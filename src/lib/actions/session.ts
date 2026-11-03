'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkSubjectProfessor } from './authGuards'
import { DEFAULT_ROTATION_SECONDS } from '@/lib/qrRotation'
import { sessionConfigSchema } from '@/lib/validations/schemas'
import { getAppSettings } from '@/lib/settings/appSettings'
import { computeClassEndsAt, type ScheduleBlockTime } from '@/lib/sessions/classWindow'
import { getBogotaDayRange } from '@/lib/utils/bogotaDay'
import { logAudit } from '@/lib/audit/auditLog'
import { captureResetForMove, sessionCapturesLocation } from '@/lib/attendance/captureScope'
import { sanitizeCoords } from '@/lib/utils/clientIp'
import { scheduledModalityForDay } from '@/lib/sessions/scheduledModality'

interface Coords {
  latitude: number
  longitude: number
}

export type SessionModality = 'PRESENCIAL' | 'VIRTUAL'

export interface SessionExtras {
  modality?: SessionModality
  isMakeup?: boolean
  makeupReason?: string
}

const MIN_MAKEUP_REASON_LENGTH = 5

/**
 * Abre la asistencia de una clase. La ventana de registro por QR NO la
 * decide el cliente: sale de app_settings (configurable por el
 * coordinador, RF11), y el fin de la clase (class_ends_at, RF21) se
 * deduce del horario semanal de la materia o, en su defecto, de la
 * duración de clase por defecto.
 */
export async function createSession(
  subjectId: string,
  coords?: Coords,
  rotationSeconds: number = DEFAULT_ROTATION_SECONDS,
  extras?: SessionExtras
) {
  const parsed = sessionConfigSchema.pick({ rotationSeconds: true }).safeParse({ rotationSeconds })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Parámetros de sesión inválidos.',
    }
  }

  const modality: SessionModality | null =
    extras?.modality === 'PRESENCIAL' || extras?.modality === 'VIRTUAL' ? extras.modality : null
  const isMakeup = extras?.isMakeup === true
  const makeupReason = (extras?.makeupReason || '').trim()

  // Nunca confiar solo en la validación del cliente: una reposición sin
  // motivo real no debe poder crearse, ni saltándose el toggle del UI
  // ni llamando a esta acción directamente.
  if (isMakeup && makeupReason.length < MIN_MAKEUP_REASON_LENGTH) {
    return {
      success: false,
      error: `El motivo de la reposición debe tener al menos ${MIN_MAKEUP_REASON_LENGTH} caracteres.`,
    }
  }

  const supabase = await createClient()

  // 1. Obtener usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  // 2. Verificar que el profesor (activo) dicte esta materia. Desde la
  //    migración 028 `sessions` no tiene policy de escritura para
  //    profesores: toda escritura va con service-role DESPUÉS de este
  //    chequeo de aplicación.
  if (!(await checkSubjectProfessor(supabase, user.id, subjectId))) {
    return { success: false, error: 'Materia no encontrada o acceso denegado.' }
  }

  // 3. Ventana de registro y fin de clase, ambos derivados en el servidor
  const [settings, { data: scheduleRows }] = await Promise.all([
    getAppSettings(supabase),
    supabase
      .from('subject_schedules')
      .select('day_of_week, start_time, end_time, modality')
      .eq('subject_id', subjectId),
  ])

  const startedAt = new Date()

  // RF20: si la clase de hoy fue suspendida no se toma asistencia (la
  // suspensión cancela la toma). Solo coordinación puede deshacerla; una
  // reposición sí puede abrirse el mismo día (ver más abajo qué pasa con
  // las asistencias que ya habían quedado en la clase suspendida).
  const { start: dayStart, end: dayEnd } = getBogotaDayRange(startedAt)
  const { data: suspendedToday } = await supabase
    .from('sessions')
    .select('id')
    .eq('subject_id', subjectId)
    .not('suspended_at', 'is', null)
    .gte('date', dayStart.toISOString())
    .lte('date', dayEnd.toISOString())
  const suspendedTodayIds = (suspendedToday || []).map((row: { id: string }) => row.id)
  if (!isMakeup && suspendedTodayIds.length > 0) {
    return {
      success: false,
      error:
        'La clase de hoy está suspendida. Coordinación debe deshacer la suspensión para tomar asistencia.',
    }
  }

  const registrationWindowMinutes = settings.registrationWindowMinutes
  const expiresAt = new Date(startedAt.getTime() + registrationWindowMinutes * 60_000)
  const classEndsAt = computeClassEndsAt({
    start: startedAt,
    schedules: (scheduleRows || []) as ScheduleBlockTime[],
    defaultClassMinutes: settings.defaultClassMinutes,
    minimumEnd: expiresAt,
  })

  // La ubicación del profesor es la referencia para medir la distancia de los
  // estudiantes: en una clase virtual no se guarda, aunque el cliente la envíe.
  const sessionCoords = sessionCapturesLocation(modality) ? sanitizeCoords(coords) : null

  const admin = getSupabaseAdmin()
  const { data: newSession, error } = await admin
    .from('sessions')
    .insert({
      subject_id: subjectId,
      date: startedAt.toISOString(),
      duration_minutes: registrationWindowMinutes,
      expires_at: expiresAt.toISOString(),
      class_ends_at: classEndsAt.toISOString(),
      latitude: sessionCoords?.latitude ?? null,
      longitude: sessionCoords?.longitude ?? null,
      qr_rotation_seconds: parsed.data.rotationSeconds,
      modality,
      is_makeup: isMakeup,
      makeup_reason: isMakeup ? makeupReason : null,
    })
    .select('id, qr_token, expires_at')
    .single()

  if (error || !newSession) {
    return { success: false, error: 'No se pudo crear la sesión.' }
  }

  // La modalidad la elige el profesor y decide si se captura IP y ubicación.
  // Cambiarla a último momento es legítimo (pasar la clase a virtual), así que
  // no se bloquea: si difiere del horario de la materia ese día, queda en la
  // bitácora para que coordinación lo vea.
  const scheduledModality = scheduledModalityForDay(
    (scheduleRows || []) as { day_of_week: number; modality: string | null }[],
    startedAt
  )
  if (modality && scheduledModality && modality !== scheduledModality) {
    await logAudit({
      actorId: user.id,
      action: 'session.modality_differs_from_schedule',
      entityType: 'session',
      entityId: newSession.id,
      subjectId,
      details: {
        session_id: newSession.id,
        chosen_modality: modality,
        scheduled_modality: scheduledModality,
      },
    })
  }

  // Reposición el mismo día de una clase suspendida: las asistencias que se
  // escanearon antes de suspender seguirían ocupando el candado de "una
  // asistencia por materia por día" (migración 007) y esos estudiantes no
  // podrían registrarse en la reposición. Se mueven a la nueva sesión
  // (solo cambia session_id: scanned_at, ip y estado se conservan) y queda
  // en la bitácora.
  if (isMakeup && suspendedTodayIds.length > 0) {
    await moveKeptAttendancesToMakeup(admin, {
      actorId: user.id,
      subjectId,
      fromSessionIds: suspendedTodayIds,
      toSessionId: newSession.id,
      toModality: modality,
    })
  }

  return { success: true, sessionId: newSession.id, registrationWindowMinutes }
}

async function moveKeptAttendancesToMakeup(
  admin: ReturnType<typeof getSupabaseAdmin>,
  {
    actorId,
    subjectId,
    fromSessionIds,
    toSessionId,
    toModality,
  }: {
    actorId: string
    subjectId: string
    fromSessionIds: string[]
    toSessionId: string
    toModality: SessionModality | null
  }
) {
  // El UPDATE devuelve las filas que MOVIÓ de verdad: una asistencia que entre
  // en la ventana entre una lectura previa y este UPDATE también se mueve, y
  // tiene que limpiarse y quedar en la bitácora igual que las demás.
  const { data: moved, error } = await admin
    .from('attendances')
    .update({ session_id: toSessionId })
    .in('session_id', fromSessionIds)
    .select('id')
  if (error) {
    // La reposición ya existe y es válida: no se tumba, pero queda el rastro.
    console.error('[session] failed to move kept attendances into the makeup class', error)
    return
  }
  const attendanceIds = (moved || []).map((row: { id: string }) => row.id)
  if (attendanceIds.length === 0) return

  // Una reposición virtual no puede heredar la IP ni la ubicación que esas
  // asistencias capturaron en la clase presencial suspendida. El marcador
  // 'manual' no es una IP y se conserva. Si la limpieza falla no se tumba la
  // reposición (ya existe y es válida), pero la falla no se calla: queda en el
  // log del servidor y en la entrada de bitácora de esta reubicación.
  let captureClearFailed = false
  if (captureResetForMove(toModality, null)) {
    const { error: resetError } = await admin
      .from('attendances')
      .update({ ip_address: null, latitude: null, longitude: null })
      .in('id', attendanceIds)
      .eq('session_id', toSessionId)
      .or('ip_address.is.null,ip_address.neq.manual')
    if (resetError) {
      captureClearFailed = true
      console.error(
        '[session] failed to clear capture data of attendances moved to a virtual class',
        resetError
      )
    }
  }

  await logAudit({
    actorId,
    action: 'attendance.relocate',
    entityType: 'session',
    entityId: toSessionId,
    subjectId,
    details: {
      path: 'makeup_after_suspension',
      from_session_ids: fromSessionIds,
      to_session_id: toSessionId,
      attendance_ids: attendanceIds,
      moved: attendanceIds.length,
      ...(captureClearFailed ? { capture_clear_failed: true } : {}),
    },
  })
}

export async function refreshSessionQrToken(sessionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, expires_at, is_active, subject_id')
    .eq('id', sessionId)
    .single()
  if (!session) return { success: false, error: 'Sesión no encontrada.' }

  if (!(await checkSubjectProfessor(supabase, user.id, session.subject_id))) {
    return { success: false, error: 'Acceso denegado.' }
  }

  if (session.is_active === false) {
    return { success: false, error: 'Esta sesión ha sido archivada.' }
  }
  if (new Date(session.expires_at) < new Date()) {
    return { success: false, error: 'Esta sesión ya expiró.' }
  }

  // Desde la migración 031 qr_token no es legible con el JWT del usuario:
  // se lee con service-role, recién DESPUÉS de comprobar que el profesor es
  // el dueño de la materia.
  const admin = getSupabaseAdmin()
  const { data: current } = await admin
    .from('sessions')
    .select('qr_token')
    .eq('id', sessionId)
    .single()
  if (!current) return { success: false, error: 'Sesión no encontrada.' }

  const newToken = crypto.randomUUID()
  const { error: updateError } = await admin
    .from('sessions')
    .update({ qr_token: newToken, previous_qr_token: current.qr_token })
    .eq('id', sessionId)

  if (updateError) return { success: false, error: 'No se pudo renovar el código.' }

  return { success: true, qrToken: newToken }
}

/**
 * Cierre manual de sesión por el docente.
 * Invalida inmediatamente el código QR estableciendo expires_at a NOW()
 * y limpiando el qr_token activo para evitar escaneos rezagados.
 */
export async function closeSession(sessionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, subject_id')
    .eq('id', sessionId)
    .single()

  if (!session) return { success: false, error: 'Sesión no encontrada.' }

  if (!(await checkSubjectProfessor(supabase, user.id, session.subject_id))) {
    return { success: false, error: 'Acceso denegado.' }
  }

  const now = new Date().toISOString()
  const { error: updateError } = await getSupabaseAdmin()
    .from('sessions')
    .update({
      expires_at: now,
      qr_token: null,
      previous_qr_token: null,
    })
    .eq('id', sessionId)

  if (updateError) {
    return { success: false, error: 'No se pudo cerrar la sesión.' }
  }

  return { success: true }
}
