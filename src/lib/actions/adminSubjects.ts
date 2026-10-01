'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { checkProfessorAssignable } from './enrollmentGuards'
import { subjectSchema } from '@/lib/validations/schemas'

export async function createSubject(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const raw = {
    name: formData.get('name') as string,
    code: formData.get('code') as string,
    periodId: (formData.get('period_id') as string) || undefined,
    absenceRuleType: (formData.get('absence_rule_type') as string) || 'PERCENTAGE',
    maxAbsencePercentage: formData.get('max_absence_percentage') || 20,
    maxAbsenceCount: formData.get('max_absence_count') || undefined,
    totalPlannedSessions: formData.get('total_planned_sessions') || 16,
    // Campo vacío = tardanzas desactivadas para esta materia (columna NULL);
    // el input de creación siempre trae un defaultValue, así que "vacío"
    // solo ocurre si el admin lo borra a propósito.
    lateAfterMinutes: formData.get('late_after_minutes') || null,
    latesPerAbsence: formData.get('lates_per_absence') || null,
  }

  const parsed = subjectSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Datos de materia inválidos',
    }
  }

  const { error } = await supabase.from('subjects').insert({
    name: parsed.data.name,
    code: parsed.data.code,
    period_id: parsed.data.periodId || null,
    absence_rule_type: parsed.data.absenceRuleType,
    max_absence_percentage: parsed.data.maxAbsencePercentage,
    max_absence_count: parsed.data.maxAbsenceCount || null,
    total_planned_sessions: parsed.data.totalPlannedSessions,
    late_after_minutes: parsed.data.lateAfterMinutes ?? null,
    lates_per_absence: parsed.data.latesPerAbsence ?? null,
  })

  if (error) {
    if (error.code === '23505')
      return { success: false, error: 'Ya existe una materia con este código' }
    return { success: false, error: 'Error al crear la materia' }
  }

  revalidatePath('/admin/subjects')
  return { success: true }
}

export async function deleteSubject(subjectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const [
    { count: sessions },
    { count: enrollments },
    { count: subjectCareers },
    { count: enrollmentRequests },
  ] = await Promise.all([
    supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
    supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
    supabase
      .from('subject_careers')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
    supabase
      .from('enrollment_requests')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
  ])

  const hasDependents =
    (sessions || 0) > 0 ||
    (enrollments || 0) > 0 ||
    (subjectCareers || 0) > 0 ||
    (enrollmentRequests || 0) > 0

  if (hasDependents) {
    const { error } = await supabase
      .from('subjects')
      .update({ is_active: false })
      .eq('id', subjectId)
    if (error) return { success: false, error: 'Error al archivar la materia' }
    revalidatePath('/admin/subjects')
    revalidatePath('/admin/dashboard')
    return {
      success: true,
      archived: true,
      message:
        'Esta materia tiene sesiones, inscripciones o pénsum asociados: se archivó en vez de borrarse.',
    }
  }

  const { error } = await supabase.from('subjects').delete().eq('id', subjectId)
  if (error) return { success: false, error: 'Error al borrar la materia' }

  revalidatePath('/admin/subjects')
  revalidatePath('/admin/dashboard')
  return { success: true, archived: false }
}

export async function reactivateSubject(subjectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { error } = await supabase.from('subjects').update({ is_active: true }).eq('id', subjectId)

  if (error) return { success: false, error: 'Error al reactivar la materia' }

  revalidatePath('/admin/subjects')
  revalidatePath('/admin/dashboard')
  return { success: true }
}

export async function updateSubject(
  subjectId: string,
  data: {
    name: string
    code: string
    professor_id: string | null
    period_id: string | null
    absence_rule_type?: 'PERCENTAGE' | 'FIXED_COUNT'
    max_absence_percentage?: number
    max_absence_count?: number | null
    total_planned_sessions?: number
    late_after_minutes?: number | null
    lates_per_absence?: number | null
  }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const parsed = subjectSchema.safeParse({
    name: data.name,
    code: data.code,
    periodId: data.period_id,
    absenceRuleType: data.absence_rule_type,
    maxAbsencePercentage: data.max_absence_percentage,
    maxAbsenceCount: data.max_absence_count,
    totalPlannedSessions: data.total_planned_sessions,
    lateAfterMinutes: data.late_after_minutes,
    latesPerAbsence: data.lates_per_absence,
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Datos inválidos' }
  }

  if (data.professor_id) {
    const check = await checkProfessorAssignable(supabase, subjectId, data.professor_id)
    if (!check.ok) return { success: false, error: check.error }
  }

  const { error } = await supabase
    .from('subjects')
    .update({
      name: parsed.data.name,
      code: parsed.data.code,
      professor_id: data.professor_id || null,
      period_id: parsed.data.periodId || null,
      absence_rule_type: parsed.data.absenceRuleType,
      max_absence_percentage: parsed.data.maxAbsencePercentage,
      max_absence_count: parsed.data.maxAbsenceCount || null,
      total_planned_sessions: parsed.data.totalPlannedSessions,
      late_after_minutes: parsed.data.lateAfterMinutes ?? null,
      lates_per_absence: parsed.data.latesPerAbsence ?? null,
    })
    .eq('id', subjectId)

  if (error) {
    if (error.code === '23505')
      return { success: false, error: 'Ya existe una materia con este código' }
    return { success: false, error: 'Error al actualizar la materia' }
  }

  revalidatePath('/admin/subjects')
  return { success: true }
}

// ------------------------------------------------------------
// Horario semanal (subject_schedules)
// ------------------------------------------------------------

export interface SubjectSchedule {
  id: string
  subject_id: string
  day_of_week: number
  start_time: string
  end_time: string
  modality: 'PRESENCIAL' | 'VIRTUAL'
}

const DAY_OF_WEEK_MIN = 0
const DAY_OF_WEEK_MAX = 6

interface ScheduleInput {
  dayOfWeek: number
  startTime: string
  endTime: string
  modality: 'PRESENCIAL' | 'VIRTUAL'
}

function validateScheduleInput(data: ScheduleInput): string | null {
  if (
    !Number.isInteger(data.dayOfWeek) ||
    data.dayOfWeek < DAY_OF_WEEK_MIN ||
    data.dayOfWeek > DAY_OF_WEEK_MAX
  ) {
    return 'Día de la semana inválido'
  }
  if (!data.startTime || !data.endTime) {
    return 'La hora de inicio y fin son obligatorias'
  }
  if (data.startTime >= data.endTime) {
    return 'La hora de inicio debe ser anterior a la hora de fin'
  }
  if (data.modality !== 'PRESENCIAL' && data.modality !== 'VIRTUAL') {
    return 'Modalidad inválida'
  }
  return null
}

export async function listSubjectSchedules(
  subjectId: string
): Promise<{ success: boolean; schedules?: SubjectSchedule[]; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { data, error } = await supabase
    .from('subject_schedules')
    .select('*')
    .eq('subject_id', subjectId)
    .order('day_of_week')

  if (error) return { success: false, error: 'Error al cargar el horario' }
  return { success: true, schedules: (data as SubjectSchedule[]) || [] }
}

export async function addSubjectSchedule(
  subjectId: string,
  data: ScheduleInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const validationError = validateScheduleInput(data)
  if (validationError) return { success: false, error: validationError }

  // subject_schedules no tiene policies de INSERT/UPDATE/DELETE a
  // propósito (ver migración 026): se escribe con service-role
  // después del checkAdmin() de arriba.
  const admin = getSupabaseAdmin()
  const { error } = await admin.from('subject_schedules').insert({
    subject_id: subjectId,
    day_of_week: data.dayOfWeek,
    start_time: data.startTime,
    end_time: data.endTime,
    modality: data.modality,
  })

  if (error) return { success: false, error: 'No se pudo agregar el bloque de horario' }

  revalidatePath('/admin/subjects')
  return { success: true }
}

export async function removeSubjectSchedule(
  scheduleId: string,
  subjectId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from('subject_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('subject_id', subjectId)

  if (error) return { success: false, error: 'No se pudo quitar el bloque de horario' }

  revalidatePath('/admin/subjects')
  return { success: true }
}
