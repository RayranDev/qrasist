'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkAdminOrSubjectProfessor } from './authGuards'
import { getBogotaDayRange } from '@/lib/utils/bogotaDay'
import { revalidatePath } from 'next/cache'

export type ManualAttendanceStatus = 'PRESENT' | 'LATE'

interface ActionResult {
  success: boolean
  error?: string
}

const MIN_REASON_LENGTH = 5

function validateReason(reason: string): string | null {
  if (reason.trim().length < MIN_REASON_LENGTH) {
    return `El motivo debe tener al menos ${MIN_REASON_LENGTH} caracteres.`
  }
  return null
}

/**
 * Marca manualmente la asistencia de un estudiante inscrito para una
 * sesión puntual (usado tanto por el panel en vivo del profesor como
 * por el historial de sesiones pasadas). Semántica de upsert:
 *   - Si ya existe una fila attendances para esta sesión+estudiante
 *     (llegó por escaneo propio o por una corrección manual previa),
 *     se actualiza su status/marked_by/manual_reason.
 *   - Si no existe, se inserta una fila nueva con scanned_at =
 *     sessions.date, para que el candado de "una asistencia por
 *     materia por día" (migración 007) quede en el mismo día que la
 *     sesión, sin importar cuándo se hace la corrección.
 *   - Si la inserción choca con ese candado (23505) es porque el
 *     estudiante ya tiene una fila de asistencia ese mismo día en
 *     OTRA sesión de la materia: en vez de devolver un error seco, se
 *     reubica esa fila a esta sesión con el estado pedido.
 */
export async function markAttendanceManually({
  sessionId,
  studentId,
  status,
  reason,
}: {
  sessionId: string
  studentId: string
  status: ManualAttendanceStatus
  reason: string
}): Promise<ActionResult> {
  const reasonError = validateReason(reason)
  if (reasonError) return { success: false, error: reasonError }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, date, subject_id')
    .eq('id', sessionId)
    .single()
  if (!session) return { success: false, error: 'Sesión no encontrada.' }

  const authorized = await checkAdminOrSubjectProfessor(supabase, user.id, session.subject_id)
  if (!authorized) return { success: false, error: 'No tienes permiso sobre esta sesión.' }

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', session.subject_id)
    .eq('student_id', studentId)
    .maybeSingle()
  if (!enrollment) {
    return { success: false, error: 'El estudiante no está inscrito en esta materia.' }
  }

  const trimmedReason = reason.trim()
  const admin = getSupabaseAdmin()

  const { data: existing } = await admin
    .from('attendances')
    .select('id')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (existing) {
    const { error } = await admin
      .from('attendances')
      .update({ status, marked_by: user.id, manual_reason: trimmedReason })
      .eq('id', existing.id)
    if (error) return { success: false, error: 'No se pudo actualizar la asistencia.' }
  } else {
    const { error } = await admin.from('attendances').insert({
      session_id: sessionId,
      student_id: studentId,
      status,
      marked_by: user.id,
      manual_reason: trimmedReason,
      scanned_at: session.date,
      ip_address: 'manual',
    })

    if (error) {
      if (error.code === '23505') {
        const { start, end } = getBogotaDayRange(new Date(session.date))
        const { data: sameDayRow } = await admin
          .from('attendances')
          .select('id')
          .eq('student_id', studentId)
          .eq('subject_id', session.subject_id)
          .gte('scanned_at', start.toISOString())
          .lte('scanned_at', end.toISOString())
          .maybeSingle()

        if (!sameDayRow) {
          return { success: false, error: 'Ya tiene asistencia registrada ese día.' }
        }

        const { error: relocateError } = await admin
          .from('attendances')
          .update({
            session_id: sessionId,
            status,
            marked_by: user.id,
            manual_reason: trimmedReason,
          })
          .eq('id', sameDayRow.id)

        if (relocateError) {
          return { success: false, error: 'Ya tiene asistencia registrada ese día.' }
        }
      } else {
        return { success: false, error: 'No se pudo registrar la asistencia.' }
      }
    }
  }

  revalidatePath('/professor/history')
  return { success: true }
}

/**
 * Quita una fila de asistencia (marcada por escaneo o manualmente).
 * Fase 4 agregará una tabla audit_log real; por ahora el motivo queda
 * en el log del servidor como gancho claro para ese registro futuro.
 */
export async function removeAttendanceMark({
  attendanceId,
  reason,
}: {
  attendanceId: string
  reason: string
}): Promise<ActionResult> {
  const reasonError = validateReason(reason)
  if (reasonError) return { success: false, error: reasonError }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const { data: attendance } = await supabase
    .from('attendances')
    .select('id, session:sessions(subject_id)')
    .eq('id', attendanceId)
    .single()

  const subjectId = (attendance as unknown as { session: { subject_id: string } | null } | null)
    ?.session?.subject_id
  if (!attendance || !subjectId) {
    return { success: false, error: 'Registro no encontrado.' }
  }

  const authorized = await checkAdminOrSubjectProfessor(supabase, user.id, subjectId)
  if (!authorized) return { success: false, error: 'No tienes permiso sobre este registro.' }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('attendances').delete().eq('id', attendanceId)
  if (error) return { success: false, error: 'No se pudo quitar la asistencia.' }

  // Gancho de auditoría (fase 4: audit_log persistente).
  console.log(`[audit] attendance ${attendanceId} removed by ${user.id} - reason: ${reason.trim()}`)

  revalidatePath('/professor/history')
  return { success: true }
}

export interface RosterStudent {
  studentId: string
  name: string
  studentCode: string | null
  status: 'PRESENT' | 'LATE' | null
  attendanceId: string | null
  scannedAt: string | null
  isManual: boolean
}

interface RosterProfileRow {
  id: string
  name: string
  student_code: string | null
}

/**
 * Devuelve la lista de inscritos de la materia de una sesión, cruzada
 * con las asistencias registradas para esa sesión puntual. Usada por
 * el panel en vivo del profesor (polling) y puede reutilizarse para
 * cualquier vista que necesite el estado de la sesión en un momento
 * dado.
 */
export async function getSessionRoster(sessionId: string): Promise<{
  success: boolean
  error?: string
  roster?: RosterStudent[]
  totalEnrolled?: number
  totalRegistered?: number
}> {
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

  const authorized = await checkAdminOrSubjectProfessor(supabase, user.id, session.subject_id)
  if (!authorized) return { success: false, error: 'No tienes permiso sobre esta sesión.' }

  const [{ data: enrollments }, { data: attendances }] = await Promise.all([
    supabase
      .from('enrollments')
      .select('student_id, student:profiles(id, name, student_code)')
      .eq('subject_id', session.subject_id),
    supabase
      .from('attendances')
      .select('id, student_id, status, scanned_at, marked_by')
      .eq('session_id', sessionId),
  ])

  const attendanceByStudent = new Map((attendances || []).map((a) => [a.student_id, a]))

  const roster: RosterStudent[] = (enrollments || [])
    .map((e) => {
      const student = e.student as unknown as RosterProfileRow | null
      if (!student) return null
      const att = attendanceByStudent.get(e.student_id)
      return {
        studentId: e.student_id,
        name: student.name,
        studentCode: student.student_code,
        status: (att?.status as 'PRESENT' | 'LATE' | undefined) ?? null,
        attendanceId: att?.id ?? null,
        scannedAt: att?.scanned_at ?? null,
        isManual: !!att?.marked_by,
      }
    })
    .filter((r): r is RosterStudent => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    success: true,
    roster,
    totalEnrolled: roster.length,
    totalRegistered: roster.filter((r) => r.status !== null).length,
  }
}
