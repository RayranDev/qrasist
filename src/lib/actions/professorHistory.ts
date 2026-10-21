'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { authorizeAttendanceEdit } from './attendanceEditGuard'
import { logAudit } from '@/lib/audit/auditLog'
import { revalidatePath } from 'next/cache'

interface ActionResult {
  success: boolean
  error?: string
}

/**
 * Archivar/reactivar una sesión cambia cuántas clases cuentan como
 * dictadas (computeAttendanceSummary solo cuenta is_active = true), o sea
 * reescribe el historial de inasistencias de todos los inscritos. Por eso
 * sigue la MISMA regla que editar asistencia (RF21/RF25): el profesor dueño
 * solo mientras la clase está en curso, ADMIN en cualquier momento, y
 * queda en la bitácora.
 *
 * La escritura va con service-role (migración 028: `sessions` ya no tiene
 * policy de escritura para profesores) después del chequeo de aplicación.
 */
async function setSessionActive(sessionId: string, active: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, subject_id, date, class_ends_at, is_active, suspended_at')
    .eq('id', sessionId)
    .single()
  if (!session) return { success: false, error: 'Sesión no encontrada.' }

  const editAuth = await authorizeAttendanceEdit(supabase, user.id, session)
  if (!editAuth.ok) return { success: false, error: editAuth.error }

  // Una clase suspendida también tiene is_active = false, pero reactivarla
  // la dejaría suspendida y dictada a la vez (la base lo rechaza). Se
  // deshace desde coordinación con unsuspendClass.
  if (session.suspended_at) {
    return {
      success: false,
      error: 'Esta clase está suspendida. Coordinación puede deshacer la suspensión.',
    }
  }

  const alreadyActive = session.is_active !== false
  if (alreadyActive === active) {
    return {
      success: false,
      error: active ? 'La sesión ya está activa.' : 'La sesión ya está archivada.',
    }
  }

  const { error } = await getSupabaseAdmin()
    .from('sessions')
    .update({ is_active: active })
    .eq('id', sessionId)
  if (error) {
    return {
      success: false,
      error: active ? 'Error al reactivar la sesión.' : 'Error al archivar la sesión.',
    }
  }

  await logAudit({
    actorId: user.id,
    action: active ? 'session.reactivate' : 'session.archive',
    entityType: 'session',
    entityId: sessionId,
    subjectId: session.subject_id,
    details: { session_date: session.date, actor_role: editAuth.role },
  })

  revalidatePath('/professor/history')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function deleteSession(sessionId: string): Promise<ActionResult> {
  return setSessionActive(sessionId, false)
}

export async function reactivateSession(sessionId: string): Promise<ActionResult> {
  return setSessionActive(sessionId, true)
}
