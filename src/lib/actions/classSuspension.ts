'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkAdmin, resolveSubjectEditorRole } from './authGuards'
import { authorizeAttendanceEdit } from './attendanceEditGuard'
import { logAudit } from '@/lib/audit/auditLog'
import { getBogotaDayRange, bogotaInstant } from '@/lib/utils/bogotaDay'
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import type { ScheduleBlockTime } from '@/lib/sessions/classWindow'
import {
  dayOfWeekOf,
  resolveSuspendedSessionTimes,
  validateProfessorSuspensionWindow,
  validateSuspensionDay,
  validateSuspensionReason,
  type PeriodRange,
} from '@/lib/sessions/suspension'

interface SuspendResult {
  success: boolean
  error?: string
  sessionId?: string
}

interface SuspendClassInput {
  /** Suspende una sesión que ya existe (ej. se fue la luz con la clase en curso). */
  sessionId?: string
  /** Suspende una clase programada que todavía no tiene sesión. */
  subjectId?: string
  /** 'YYYY-MM-DD' (Bogotá). Si falta con subjectId, se usa hoy. */
  date?: string
  reason: string
}

function revalidateSuspensionViews() {
  revalidatePath('/professor/subjects')
  revalidatePath('/professor/history')
  revalidatePath('/admin/attendance')
  revalidatePath('/admin/omissions')
  revalidatePath('/admin/dashboard')
}

/**
 * RF20 / proceso 6: el profesor o el coordinador reportan que no hay
 * condiciones para dictar clase. Motivo obligatorio. La clase NO cuenta
 * como dictada (se guarda con is_active = false, ver migración 029), así
 * que no genera inasistencias, y queda en la bitácora.
 *
 * Dos modos:
 *  - `sessionId`: la sesión ya existe. El profesor solo puede dentro de la
 *    ventana de edición (hasta el fin de la clase), el ADMIN siempre. Se
 *    cierra el QR y se conservan las asistencias ya escaneadas (rastro
 *    de auditoría), que dejan de contar.
 *  - `subjectId` (+ `date`): la clase programada no tiene sesión todavía.
 *    Se crea un registro suspendido de ese día para que la detección de
 *    omisiones lo vea cubierto. El profesor solo la de hoy, el ADMIN
 *    cualquier fecha del período.
 *
 * Escribe con service-role: `sessions` no tiene policies de escritura
 * para profesores (migración 028), así que el chequeo de aplicación de
 * acá es la única barrera.
 */
export async function suspendClass(input: SuspendClassInput): Promise<SuspendResult> {
  const reasonError = validateSuspensionReason(input.reason ?? '')
  if (reasonError) return { success: false, error: reasonError }
  const reason = input.reason.trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const result = input.sessionId
    ? await suspendExistingSession(supabase, user.id, input.sessionId, reason)
    : input.subjectId
      ? await suspendScheduledDay(supabase, user.id, input.subjectId, input.date, reason)
      : ({ success: false, error: 'Indica la clase que quieres suspender.' } as SuspendResult)

  if (result.success) revalidateSuspensionViews()
  return result
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function suspendExistingSession(
  supabase: ServerClient,
  userId: string,
  sessionId: string,
  reason: string
): Promise<SuspendResult> {
  const { data: session } = await supabase
    .from('sessions')
    .select('id, subject_id, date, class_ends_at, expires_at, is_active, suspended_at')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return { success: false, error: 'Sesión no encontrada.' }

  // Profesor: solo mientras la clase sigue en curso; ADMIN: siempre.
  const editAuth = await authorizeAttendanceEdit(supabase, userId, session)
  if (!editAuth.ok) return { success: false, error: editAuth.error }

  if (session.suspended_at) {
    return { success: false, error: 'Esta clase ya está suspendida.' }
  }
  if (session.is_active === false) {
    return {
      success: false,
      error: 'La clase está archivada. Reactívala antes de suspenderla.',
    }
  }

  const admin = getSupabaseAdmin()
  const now = new Date()
  // Cerrar el QR: sin más escaneos. expires_at solo se adelanta si la
  // ventana de registro seguía abierta.
  const stillOpen = new Date(session.expires_at) > now

  const { data: updated, error } = await admin
    .from('sessions')
    .update({
      is_active: false,
      suspended_at: now.toISOString(),
      suspended_by: userId,
      suspension_reason: reason,
      qr_token: null,
      previous_qr_token: null,
      ...(stillOpen ? { expires_at: now.toISOString() } : {}),
    })
    .eq('id', sessionId)
    .is('suspended_at', null)
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[suspension] failed to suspend session', error)
    return { success: false, error: 'No se pudo suspender la clase.' }
  }
  if (!updated) return { success: false, error: 'Esta clase ya está suspendida.' }

  const { count: keptAttendances } = await admin
    .from('attendances')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)

  await logAudit({
    actorId: userId,
    action: 'session.suspend',
    entityType: 'session',
    entityId: sessionId,
    subjectId: session.subject_id,
    details: {
      mode: 'existing_session',
      session_date: session.date,
      reason,
      actor_role: editAuth.role,
      attendances_kept: keptAttendances ?? 0,
    },
  })

  return { success: true, sessionId }
}

async function suspendScheduledDay(
  supabase: ServerClient,
  userId: string,
  subjectId: string,
  requestedDate: string | undefined,
  reason: string
): Promise<SuspendResult> {
  const role = await resolveSubjectEditorRole(supabase, userId, subjectId)
  if (!role) return { success: false, error: 'No tienes permiso sobre esta materia.' }

  const now = new Date()
  const today = bogotaCalendarDate(now)
  const date = requestedDate || today

  const { data: subject } = await supabase
    .from('subjects')
    .select('id, is_active, period:periods(start_date, end_date)')
    .eq('id', subjectId)
    .maybeSingle()
  if (!subject || subject.is_active === false) {
    return { success: false, error: 'Materia no encontrada.' }
  }
  const period = (subject.period as unknown as PeriodRange | PeriodRange[] | null) ?? null
  const periodRange = Array.isArray(period) ? (period[0] ?? null) : period

  const dayError = validateSuspensionDay({ role, date, today, period: periodRange })
  if (dayError) return { success: false, error: dayError }

  const { data: scheduleRows } = await supabase
    .from('subject_schedules')
    .select('day_of_week, start_time, end_time, modality')
    .eq('subject_id', subjectId)
  const blocks = (scheduleRows || []) as (ScheduleBlockTime & {
    modality?: 'PRESENCIAL' | 'VIRTUAL'
  })[]

  if (role === 'PROFESSOR') {
    const windowError = validateProfessorSuspensionWindow({
      blocks,
      dayOfWeek: dayOfWeekOf(date),
      isoDate: date,
      now,
    })
    if (windowError) return { success: false, error: windowError }
  }

  // Una clase por materia y día (hora de Bogotá), mismo criterio que
  // createPastSession y el índice único de asistencia por día (007).
  const admin = getSupabaseAdmin()
  const { start, end } = getBogotaDayRange(bogotaInstant(date, 12 * 60))
  const { data: sameDay } = await admin
    .from('sessions')
    .select('id, suspended_at')
    .eq('subject_id', subjectId)
    .gte('date', start.toISOString())
    .lte('date', end.toISOString())
  if (sameDay && sameDay.length > 0) {
    return {
      success: false,
      error: sameDay.some((s) => s.suspended_at)
        ? 'La clase de ese día ya está suspendida.'
        : 'Ya existe una clase de esta materia ese día. Suspéndela desde su sesión.',
    }
  }

  const times = resolveSuspendedSessionTimes({
    isoDate: date,
    dayOfWeek: dayOfWeekOf(date),
    blocks,
    now,
    today,
  })

  const { data: created, error } = await admin
    .from('sessions')
    .insert({
      subject_id: subjectId,
      date: times.date.toISOString(),
      duration_minutes: 1,
      expires_at: times.date.toISOString(),
      class_ends_at: times.classEndsAt.toISOString(),
      qr_token: null,
      previous_qr_token: null,
      is_active: false,
      modality: times.modality,
      is_makeup: false,
      suspended_at: now.toISOString(),
      suspended_by: userId,
      suspension_reason: reason,
    })
    .select('id')
    .single()
  if (error || !created) {
    console.error('[suspension] failed to create suspended session', error)
    return { success: false, error: 'No se pudo registrar la suspensión.' }
  }

  await logAudit({
    actorId: userId,
    action: 'session.suspend',
    entityType: 'session',
    entityId: created.id,
    subjectId,
    details: {
      mode: 'scheduled_day',
      class_date: date,
      reason,
      actor_role: role,
    },
  })

  return { success: true, sessionId: created.id }
}

/**
 * Deshace una suspensión (error de coordinación): solo ADMIN. La clase
 * vuelve a contar como dictada, así que las inasistencias de los inscritos
 * se recalculan -- si era un registro creado sin sesión previa, queda una
 * clase dictada sin asistencias que el coordinador debe cargar o archivar.
 */
export async function unsuspendClass(sessionId: string): Promise<SuspendResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, subject_id, date, suspended_at, suspension_reason')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return { success: false, error: 'Sesión no encontrada.' }
  if (!session.suspended_at) {
    return { success: false, error: 'Esta clase no está suspendida.' }
  }

  // No dejar dos clases dictadas el mismo día (la suspensión pudo ser un
  // registro sin sesión y luego se cargó otra clase a mano).
  const admin = getSupabaseAdmin()
  const { start, end } = getBogotaDayRange(new Date(session.date))
  const { data: sameDay } = await admin
    .from('sessions')
    .select('id')
    .eq('subject_id', session.subject_id)
    .eq('is_active', true)
    .neq('id', sessionId)
    .gte('date', start.toISOString())
    .lte('date', end.toISOString())
    .limit(1)
  if (sameDay && sameDay.length > 0) {
    return {
      success: false,
      error: 'Ya hay otra clase dictada ese día. Archívala antes de deshacer la suspensión.',
    }
  }

  // Un solo UPDATE: los CHECK de la migración 029 exigen que
  // suspended_at y is_active cambien juntos.
  const { error } = await admin
    .from('sessions')
    .update({
      is_active: true,
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null,
    })
    .eq('id', sessionId)
  if (error) {
    console.error('[suspension] failed to undo suspension', error)
    return { success: false, error: 'No se pudo deshacer la suspensión.' }
  }

  await logAudit({
    actorId: user.id,
    action: 'session.unsuspend',
    entityType: 'session',
    entityId: sessionId,
    subjectId: session.subject_id,
    details: {
      session_date: session.date,
      suspension_reason: session.suspension_reason,
      actor_role: 'ADMIN',
    },
  })

  revalidateSuspensionViews()
  return { success: true, sessionId }
}
