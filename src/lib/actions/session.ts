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
      .select('day_of_week, start_time, end_time')
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

  const admin = getSupabaseAdmin()
  const { data: newSession, error } = await admin
    .from('sessions')
    .insert({
      subject_id: subjectId,
      date: startedAt.toISOString(),
      duration_minutes: registrationWindowMinutes,
      expires_at: expiresAt.toISOString(),
      class_ends_at: classEndsAt.toISOString(),
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
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
  }: { actorId: string; subjectId: string; fromSessionIds: string[]; toSessionId: string }
) {
  const { data: kept } = await admin
    .from('attendances')
    .select('id, student_id, session_id')
    .in('session_id', fromSessionIds)
  if (!kept || kept.length === 0) return

  const { error } = await admin
    .from('attendances')
    .update({ session_id: toSessionId })
    .in('session_id', fromSessionIds)
  if (error) {
    // La reposición ya existe y es válida: no se tumba, pero queda el rastro.
    console.error('[session] failed to move kept attendances into the makeup class', error)
    return
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
      attendance_ids: kept.map((row: { id: string }) => row.id),
      moved: kept.length,
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
    .select('id, qr_token, expires_at, is_active, subject_id')
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

  const newToken = crypto.randomUUID()
  const { error: updateError } = await getSupabaseAdmin()
    .from('sessions')
    .update({ qr_token: newToken, previous_qr_token: session.qr_token })
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
