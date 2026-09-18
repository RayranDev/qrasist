'use server'

import { createClient } from '@/lib/supabase/server'
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
