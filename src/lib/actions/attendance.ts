'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/utils/rateLimiter'
import { getBogotaDayRange } from '@/lib/utils/bogotaDay'

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

export async function registerAttendance(
  qrToken: string,
  coords?: Coords
): Promise<RegisterAttendanceResult> {
  const supabase = await createClient()

  // Capturar la IP real (Next.js headers)
  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for') || 'unknown'

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

  // 2. Rate Limiting por usuario y por IP (máx 10 intentos por minuto)
  const userRateKey = `scan:user:${user.id}`
  const ipRateKey = `scan:ip:${ipAddress}`
  const [userRate, ipRate] = await Promise.all([
    checkRateLimit(userRateKey, { maxAttempts: 10, windowMs: 60_000 }),
    checkRateLimit(ipRateKey, { maxAttempts: 20, windowMs: 60_000 }),
  ])

  if (!userRate.allowed || !ipRate.allowed) {
    const retrySec = userRate.retryAfterSeconds || ipRate.retryAfterSeconds || 15
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: `Demasiados intentos de escaneo. Esperá ${retrySec} segundos antes de reintentar.`,
    }
  }

  // 3. Validar formato UUID antes de consultar PostgREST
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  if (!uuidRegex.test(qrToken)) {
    return {
      ok: false,
      code: 'INVALID',
      message: 'Código QR inválido. Formato no reconocido.',
    }
  }

  // 4. Buscar la sesión por el token QR (actual o inmediatamente anterior)
  const admin = getSupabaseAdmin()
  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('*')
    .or(`qr_token.eq.${qrToken},previous_qr_token.eq.${qrToken}`)
    .single()

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
      message: 'Este código QR ha expirado. Solicitá al profesor que genere uno nuevo.',
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

  const { data: existingToday } = await supabase
    .from('attendances')
    .select('id')
    .eq('student_id', user.id)
    .eq('subject_id', session.subject_id)
    .gte('scanned_at', todayStart.toISOString())
    .lte('scanned_at', todayEnd.toISOString())
    .maybeSingle()

  if (existingToday) {
    return {
      ok: false,
      code: 'DUPLICATE',
      message: `Ya registraste asistencia para ${subject?.name || 'esta materia'} hoy.`,
    }
  }

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

  // 11. Intentar registrar la asistencia
  const { error: insertError } = await supabase.from('attendances').insert({
    session_id: session.id,
    student_id: user.id,
    ip_address: ipAddress,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    status,
  })

  if (insertError) {
    if (insertError.code === '23505') {
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

  const timeStr = registeredAt.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const subjectName = subject?.name || 'Materia'
  const subjectCode = subject?.code || ''
  const isLate = status === 'LATE'

  if (!isEnrolled) {
    return {
      ok: true,
      message: `Registrado como invitado en ${subjectName} (${subjectCode}) a las ${timeStr}`,
      data: {
        subjectName,
        subjectCode,
        time: timeStr,
        isGuest: true,
        isLate,
      },
    }
  }

  return {
    ok: true,
    message: `${subjectName} · ${subjectCode} — ${timeStr}`,
    data: {
      subjectName,
      subjectCode,
      time: timeStr,
      isGuest: false,
      isLate,
    },
  }
}
