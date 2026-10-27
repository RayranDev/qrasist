'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { checkStudentEnrollable, getStudentCareerIds } from './enrollmentGuards'
import { logAudit } from '@/lib/audit/auditLog'
import { sanitizeSearchTerm } from '@/lib/utils/searchTerm'
import { ASSIGNABLE_SUBJECTS_PAGE_SIZE, normalizeSubjectIds } from '@/lib/admin/assignSubjects'

export async function addEnrollment(subjectId: string, studentId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id)))
    return { success: false, error: 'No autorizado' }

  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', studentId)
    .single()
  if (studentProfile?.role !== 'STUDENT') {
    return { success: false, error: 'El usuario seleccionado no es un estudiante.' }
  }

  const check = await checkStudentEnrollable(supabase, subjectId, studentId)
  if (!check.ok) return { success: false, error: check.error }

  const { error } = await supabase
    .from('enrollments')
    .insert({ subject_id: subjectId, student_id: studentId })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'El estudiante ya está inscrito.' }
    return { success: false, error: 'Error al inscribir al estudiante.' }
  }

  revalidatePath(`/admin/subjects/${subjectId}/enrollments`)
  return { success: true }
}

export async function removeEnrollment(subjectId: string, studentId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id)))
    return { success: false, error: 'No autorizado' }

  const { error } = await supabase
    .from('enrollments')
    .delete()
    .eq('subject_id', subjectId)
    .eq('student_id', studentId)
  if (error) return { success: false, error: 'Error al remover la inscripción.' }

  revalidatePath(`/admin/subjects/${subjectId}/enrollments`)
  return { success: true }
}

// ------------------------------------------------------------
// Matricular a un estudiante en varias materias (paso opcional al
// cambiarlo a STUDENT desde Usuarios)
// ------------------------------------------------------------

export interface EnrollableSubject {
  id: string
  code: string
  name: string
}

export interface EnrollSubjectFailure {
  subjectId: string
  code: string | null
  error: string
}

// A student is enrolled in dozens of subjects at most; this only bounds the
// NOT IN list sent to PostgREST. enrollStudentInSubjects re-checks anyway.
const ENROLLED_EXCLUSION_CAP = 200

async function getActiveStudent(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from('profiles').select('role, is_active').eq('id', id).single()
  return data?.role === 'STUDENT' && data.is_active !== false
}

/**
 * Active subjects the student can be enrolled in (they share an active career,
 * rule D) and is not enrolled in yet, searchable by code or name. Limited to one
 * page: the admin narrows the list with the search box.
 */
export async function listSubjectsEnrollableByStudent(
  studentId: string,
  search?: string
): Promise<
  | { success: true; noCareers: boolean; subjects: EnrollableSubject[]; total: number }
  | { success: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }
  if (!(await getActiveStudent(supabase, studentId))) {
    return { success: false, error: 'El usuario seleccionado no es un estudiante activo.' }
  }

  const careerIds = await getStudentCareerIds(supabase, studentId)
  if (careerIds.length === 0) {
    return { success: true, noCareers: true, subjects: [], total: 0 }
  }

  const { data: enrolledRows, error: enrolledError } = await supabase
    .from('enrollments')
    .select('subject_id')
    .eq('student_id', studentId)
    .limit(ENROLLED_EXCLUSION_CAP)
  if (enrolledError) return { success: false, error: 'No se pudieron cargar las materias.' }
  const enrolledIds = (enrolledRows || []).map((r) => r.subject_id as string)

  const term = sanitizeSearchTerm(search)
  let query = supabase
    .from('subjects')
    .select('id, code, name, subject_careers!inner(career_id)', { count: 'exact' })
    .eq('is_active', true)
    .eq('subject_careers.is_active', true)
    .in('subject_careers.career_id', careerIds)
    .order('name')
    .order('id')
  if (enrolledIds.length > 0) query = query.not('id', 'in', `(${enrolledIds.join(',')})`)
  if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`)

  const { data, count, error } = await query.limit(ASSIGNABLE_SUBJECTS_PAGE_SIZE)
  if (error) return { success: false, error: 'No se pudieron cargar las materias.' }

  const subjects = ((data || []) as EnrollableSubject[]).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
  }))
  return { success: true, noCareers: false, subjects, total: count ?? subjects.length }
}

/**
 * Enrolls the student in the given subjects with the same guards as addEnrollment
 * (target is a STUDENT, checkStudentEnrollable) plus: the subject exists, is active
 * and the student is not enrolled yet. All are validated first: if any fails
 * nothing is enrolled and the per-subject failures are returned. If an individual
 * insert fails afterwards, `enrolled` and `failures` say exactly what happened.
 */
export async function enrollStudentInSubjects(
  studentId: string,
  subjectIds: string[]
): Promise<{
  success: boolean
  error?: string
  enrolled: string[]
  failures: EnrollSubjectFailure[]
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado', enrolled: [], failures: [] }
  }

  const normalized = normalizeSubjectIds(subjectIds, 'inscribir')
  if (!normalized.ok) {
    return { success: false, error: normalized.error, enrolled: [], failures: [] }
  }
  const ids = normalized.ids

  if (!(await getActiveStudent(supabase, studentId))) {
    return {
      success: false,
      error: 'El usuario seleccionado no es un estudiante activo.',
      enrolled: [],
      failures: [],
    }
  }

  const [subjectsRes, enrolledRes] = await Promise.all([
    supabase.from('subjects').select('id, code, is_active').in('id', ids),
    supabase
      .from('enrollments')
      .select('subject_id')
      .eq('student_id', studentId)
      .in('subject_id', ids),
  ])
  if (subjectsRes.error || enrolledRes.error) {
    return {
      success: false,
      error: 'No se pudieron cargar las materias.',
      enrolled: [],
      failures: [],
    }
  }
  const byId = new Map(
    ((subjectsRes.data || []) as { id: string; code: string; is_active: boolean }[]).map((s) => [
      s.id,
      s,
    ])
  )
  const alreadyEnrolled = new Set((enrolledRes.data || []).map((r) => r.subject_id as string))

  const failures: EnrollSubjectFailure[] = []
  for (const id of ids) {
    const subject = byId.get(id)
    if (!subject) {
      failures.push({ subjectId: id, code: null, error: 'La materia no existe.' })
    } else if (subject.is_active === false) {
      failures.push({ subjectId: id, code: subject.code, error: 'La materia está archivada.' })
    } else if (alreadyEnrolled.has(id)) {
      failures.push({ subjectId: id, code: subject.code, error: 'El estudiante ya está inscrito.' })
    } else {
      const check = await checkStudentEnrollable(supabase, id, studentId)
      if (!check.ok) failures.push({ subjectId: id, code: subject.code, error: check.error })
    }
  }

  if (failures.length > 0) {
    return {
      success: false,
      error: 'No se inscribió en ninguna materia: revisa las que no se pueden inscribir.',
      enrolled: [],
      failures,
    }
  }

  const enrolled: string[] = []
  for (const id of ids) {
    const { error } = await supabase
      .from('enrollments')
      .insert({ subject_id: id, student_id: studentId })
    if (error) {
      failures.push({
        subjectId: id,
        code: byId.get(id)?.code ?? null,
        error:
          error.code === '23505'
            ? 'El estudiante ya está inscrito.'
            : 'No se pudo inscribir en esta materia.',
      })
    } else {
      enrolled.push(id)
    }
  }

  if (enrolled.length > 0) {
    await logAudit({
      actorId: user.id,
      action: 'user.enroll_subjects',
      entityType: 'profile',
      entityId: studentId,
      details: {
        subject_ids: enrolled,
        enrolled_count: enrolled.length,
        failed_count: failures.length,
      },
    })
    revalidatePath('/admin/subjects')
    revalidatePath('/admin/users')
    for (const id of enrolled) revalidatePath(`/admin/subjects/${id}/enrollments`)
  }

  return {
    success: failures.length === 0,
    ...(failures.length > 0
      ? { error: `Se inscribió en ${enrolled.length} de ${ids.length} materias.` }
      : {}),
    enrolled,
    failures,
  }
}
