'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { headers } from 'next/headers'
import { getClientIp, sanitizeCoords } from '@/lib/utils/clientIp'
import { checkRateLimit } from '@/lib/utils/rateLimiter'
import { formatBogotaTime, getBogotaDayRange } from '@/lib/utils/bogotaDay'
import { sessionCapturesLocation } from '@/lib/attendance/captureScope'

interface Coords {
  latitude: number
  longitude: number
}

export type AttendanceErrorCode =
  | 'EXPIRED'
  | 'NOT_ENROLLED'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'INVALID'
  | 'INACTIVE'
  | 'UNAUTHENTICATED'
  | 'SERVER_ERROR'

export type RegisterAttendanceResult =
  | {
      ok: true
      message: string
      data: {
        subjectName: string
        subjectCode: string
        time: string
        isGuest: boolean
        isLate: boolean
      }
    }
  | {
      ok: false
      code: AttendanceErrorCode
      message: string
    }

// Un doble envío del mismo escaneo (remonte del componente, reintento del
// navegador, doble toque) llega como segunda llamada para la MISMA sesión
// segundos después. Dentro de esta ventana se responde con el registro ya
// guardado en vez de un error: el estudiante ve la confirmación que le
// corresponde. Fuera de ella, o en otra sesión del día, sigue siendo DUPLICATE.
const IDEMPOTENT_RETRY_WINDOW_MS = 2 * 60_000

interface ExistingAttendance {
  id: string
  session_id: string
  scanned_at: string
  status: string
}

function rateLimited(retryAfterSeconds?: number): RegisterAttendanceResult {
  return {
    ok: false,
    code: 'RATE_LIMITED',
    message: `Demasiados intentos de escaneo. Espera ${retryAfterSeconds || 15} segundos antes de reintentar.`,
  }
}

function buildSuccess(
  subjectName: string,
  subjectCode: string,
  timeStr: string,
  isLate: boolean,
  isGuest: boolean
): RegisterAttendanceResult {
  if (isGuest) {
    return {
      ok: true,
      message: `Registrado como invitado en ${subjectName} (${subjectCode}) a las ${timeStr}`,
      data: { subjectName, subjectCode, time: timeStr, isGuest: true, isLate },
    }
  }

  return {
    ok: true,
    message: `${subjectName} · ${subjectCode} — ${timeStr}`,
    data: { subjectName, subjectCode, time: timeStr, isGuest: false, isLate },
  }
}

export async function registerAttendance(
  qrToken: string,
  coords?: Coords
): Promise<RegisterAttendanceResult> {
  const supabase = await createClient()

  // 1. Obtener usuario autenticado
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'No estás autenticado.',
    }
  }

  // 1b. Solo un ESTUDIANTE activo registra asistencia. Antes lo imponía la
  //     policy `attendances_insert` (my_role() = 'STUDENT'); desde la
  //     migración 031 esa policy ya no existe y el INSERT va con
  //     service-role, así que el chequeo vive acá.
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.is_active !== true || callerProfile.role !== 'STUDENT') {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'Solo las cuentas de estudiante activas pueden registrar asistencia.',
    }
  }

  // 2. Rate Limiting por usuario (10/min). Cada escaneo es UNA llamada; este
  //    es el límite que frena el abuso real de una cuenta (adivinar un UUID v4
  //    no es viable).
  const userRate = await checkRateLimit(`scan:user:${user.id}`, {
    maxAttempts: 10,
    windowMs: 60_000,
  })
  if (!userRate.allowed) return rateLimited(userRate.retryAfterSeconds)

  // Límite por IP (200/min). El tope es alto a propósito porque un salón de
  // ~40 estudiantes comparte la IP del NAT del campus y escanea en la misma
  // ventana de registro (5 min), a menudo en el primer minuto; 200/min cubre
  // varios salones a la vez. La clave lleva la IP y queda en rate_limits, así
  // que NO se consulta en una clase virtual (ahí la IP no se guarda en ningún
  // lado); sí en todo lo demás, incluidos los tokens que no existen.
  const headersList = await headers()
  const ipAddress = getClientIp(headersList)
  const checkIpRate = async () => {
    const ipRate = await checkRateLimit(`scan:ip:${ipAddress}`, {
      maxAttempts: 200,
      windowMs: 60_000,
    })
    return ipRate.allowed ? null : rateLimited(ipRate.retryAfterSeconds)
  }

  // 3. Validar formato UUID antes de consultar PostgREST
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  if (!uuidRegex.test(qrToken)) {
    const limited = await checkIpRate()
    if (limited) return limited
    return {
      ok: false,
      code: 'INVALID',
      message: 'Código QR inválido. Formato no reconocido.',
    }
  }

  // 4. Buscar la sesión por el token QR (actual o inmediatamente anterior).
  //    Con service-role: desde la migración 031 los roles de usuario no
  //    pueden leer qr_token / previous_qr_token (si no, un estudiante
  //    podría pedir el token vigente por PostgREST sin estar en clase).
  const admin = getSupabaseAdmin()
  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('*')
    .or(`qr_token.eq.${qrToken},previous_qr_token.eq.${qrToken}`)
    .single()

  // Solo las clases presenciales (o sin modalidad) capturan IP y ubicación.
  const capturesLocation = !session || sessionCapturesLocation(session.modality)
  if (capturesLocation) {
    const limited = await checkIpRate()
    if (limited) return limited
  }

  if (sessionError || !session) {
    return {
      ok: false,
      code: 'INVALID',
      message: 'Código QR inválido. No pertenece a ninguna clase activa.',
    }
  }

  // 5. Validar que la sesión no haya sido archivada por el docente
  if (session.is_active === false) {
    return {
      ok: false,
      code: 'INACTIVE',
      message: 'Esta sesión ha sido archivada y ya no acepta registros.',
    }
  }

  // 6. Validar si el token expiró o la sesión fue cerrada
  const now = new Date()
  const expiresAt = new Date(session.expires_at)
  if (now > expiresAt || !session.qr_token) {
    return {
      ok: false,
      code: 'EXPIRED',
      message: 'Este código QR ha expirado. Solicita al profesor que genere uno nuevo.',
    }
  }

  // 7. Traer datos de la materia y validar que no esté archivada
  const { data: subject } = await supabase
    .from('subjects')
    .select('name, code, is_active, late_after_minutes')
    .eq('id', session.subject_id)
    .single()

  if (subject?.is_active === false) {
    return {
      ok: false,
      code: 'INACTIVE',
      message: 'Esta materia ha sido archivada y ya no acepta registros.',
    }
  }

  // 8. Verificar si el estudiante está inscrito en la materia
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', session.subject_id)
    .eq('student_id', user.id)
    .maybeSingle()

  const isEnrolled = !!enrollment

  // 9. Verificar duplicado por materia en el mismo día (cálculo en zona de Bogotá UTC-5)
  const { start: todayStart, end: todayEnd } = getBogotaDayRange()

  const findTodayAttendance = async (): Promise<ExistingAttendance | null> => {
    const { data } = await supabase
      .from('attendances')
      .select('id, session_id, scanned_at, status')
      .eq('student_id', user.id)
      .eq('subject_id', session.subject_id)
      .gte('scanned_at', todayStart.toISOString())
      .lte('scanned_at', todayEnd.toISOString())
      .maybeSingle()
    return (data as ExistingAttendance | null) ?? null
  }

  // Duplicado: si es un reenvío reciente de esta misma sesión devolvemos el
  // registro original (idempotente); cualquier otro caso es DUPLICATE.
  const resolveDuplicate = (existing: ExistingAttendance): RegisterAttendanceResult => {
    const scannedAt = new Date(existing.scanned_at)
    const isRecentRetry =
      existing.session_id === session.id &&
      Date.now() - scannedAt.getTime() <= IDEMPOTENT_RETRY_WINDOW_MS

    if (isRecentRetry) {
      return buildSuccess(
        subject?.name || 'Materia',
        subject?.code || '',
        formatBogotaTime(scannedAt),
        existing.status === 'LATE',
        !isEnrolled
      )
    }

    return {
      ok: false,
      code: 'DUPLICATE',
      message: `Ya registraste asistencia para ${subject?.name || 'esta materia'} hoy.`,
    }
  }

  const existingToday = await findTodayAttendance()
  if (existingToday) return resolveDuplicate(existingToday)

  // 10. Determinar si el escaneo llegó tarde. late_after_minutes = NULL
  //     desactiva el seguimiento de tardanzas para esta materia (todo
  //     queda como PRESENT). Se compara contra sessions.date (el
  //     instante en que el profesor generó la sesión), no expires_at.
  const registeredAt = new Date()
  let status: 'PRESENT' | 'LATE' = 'PRESENT'
  if (subject?.late_after_minutes != null) {
    const sessionStart = new Date(session.date)
    const lateThreshold = new Date(sessionStart.getTime() + subject.late_after_minutes * 60_000)
    if (registeredAt > lateThreshold) {
      status = 'LATE'
    }
  }

  // 11. Intentar registrar la asistencia. Con service-role y DESPUÉS de todas
  //     las validaciones anteriores: `attendances` no tiene policy de INSERT
  //     (migración 031), así que un estudiante no puede insertarse a sí
  //     mismo saltándose el QR, la ventana de registro o la inscripción.
  //     student_id sale del usuario autenticado y session_id de la sesión
  //     validada, nunca de datos del cliente.
  //     IP y coordenadas solo se guardan si la clase las captura: en una clase
  //     virtual se descartan aquí aunque el cliente las envíe.
  const safeCoords = capturesLocation ? sanitizeCoords(coords) : null
  const { error: insertError } = await admin.from('attendances').insert({
    session_id: session.id,
    student_id: user.id,
    ip_address: capturesLocation ? ipAddress : null,
    latitude: safeCoords?.latitude ?? null,
    longitude: safeCoords?.longitude ?? null,
    status,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      // Carrera entre dos envíos simultáneos: el otro ganó el INSERT. Se
      // relee su fila para aplicar la misma regla idempotente.
      const winner = await findTodayAttendance()
      if (winner) return resolveDuplicate(winner)
      return {
        ok: false,
        code: 'DUPLICATE',
        message: `Ya registraste asistencia para ${subject?.name || 'esta materia'} hoy.`,
      }
    }
    return {
      ok: false,
      code: 'SERVER_ERROR',
      message: 'Error del servidor al registrar asistencia. Intenta nuevamente.',
    }
  }

  // El servidor corre en UTC (Vercel): sin zona explícita la hora saldría
  // 5 horas adelantada respecto a la del estudiante.
  return buildSuccess(
    subject?.name || 'Materia',
    subject?.code || '',
    formatBogotaTime(registeredAt),
    status === 'LATE',
    !isEnrolled
  )
}
