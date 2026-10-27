'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { checkStudentEnrollable, getStudentCareerIds } from './enrollmentGuards'
import { logAudit } from '@/lib/audit/auditLog'
import { sanitizeSearchTerm } from '@/lib/utils/searchTerm'
import {
  ASSIGNABLE_SUBJECTS_PAGE_SIZE,
  ENROLLABLE_CANDIDATE_CAP,
  normalizeSubjectIds,
} from '@/lib/admin/assignSubjects'

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

// Safety limit, not expected to be reached: a student has dozens of enrollments.
const ENROLLED_IDS_SAFETY_LIMIT = 2000

async function getActiveStudent(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from('profiles').select('role, is_active').eq('id', id).single()
  return data?.role === 'STUDENT' && data.is_active !== false
}

/**
 * Active subjects the student can be enrolled in (they share an active career,
 * rule D) and is not enrolled in yet, searchable by code or name. Returns one page
 * (the admin narrows the list with the search box).
 *
 * Enrolled subjects are excluded in memory, not with a NOT IN sent to PostgREST
 * (no URL-length limit, no silent truncation): all of the student's enrollment ids
 * are read, then up to ENROLLABLE_CANDIDATE_CAP candidate subjects (name, id order)
 * are fetched and filtered. `total` counts the filtered candidates; when the
 * candidate window was full there may be more, so `truncated` is set and `total`
 * is a lower bound.
 */
export async function listSubjectsEnrollableByStudent(
  studentId: string,
  search?: string
): Promise<
  | {
      success: true
      noCareers: boolean
      subjects: EnrollableSubject[]
      total: number
      truncated: boolean
    }
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
    return { success: true, noCareers: true, subjects: [], total: 0, truncated: false }
  }

  const { data: enrolledRows, error: enrolledError } = await supabase
    .from('enrollments')
    .select('subject_id')
    .eq('student_id', studentId)
    .order('subject_id')
    .limit(ENROLLED_IDS_SAFETY_LIMIT)
  if (enrolledError) return { success: false, error: 'No se pudieron cargar las materias.' }
  const enrolledIds = new Set((enrolledRows || []).map((r) => r.subject_id as string))

  const term = sanitizeSearchTerm(typeof search === 'string' ? search : '')
  let query = supabase
    .from('subjects')
    .select('id, code, name, subject_careers!inner(career_id)')
    .eq('is_active', true)
    .eq('subject_careers.is_active', true)
    .in('subject_careers.career_id', careerIds)
    .order('name')
    .order('id')
  if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`)

  const { data, error } = await query.limit(ENROLLABLE_CANDIDATE_CAP)
  if (error) return { success: false, error: 'No se pudieron cargar las materias.' }

  const candidates = (data || []) as EnrollableSubject[]
  const available = candidates
    .filter((s) => !enrolledIds.has(s.id))
    .map((s) => ({ id: s.id, code: s.code, name: s.name }))

  return {
    success: true,
    noCareers: false,
    subjects: available.slice(0, ASSIGNABLE_SUBJECTS_PAGE_SIZE),
    total: available.length,
    truncated: candidates.length >= ENROLLABLE_CANDIDATE_CAP,
  }
}

/**
 * Enrolls the student in the given subjects with the same guards as addEnrollment
 * (target is a STUDENT, checkStudentEnrollable) plus: the subject exists, is active
 * and the student is not enrolled yet. All are validated first: if any fails
 * nothing is enrolled and the per-subject failures are returned. If an individual
 * insert fails afterwards, `enrolled` and `failures` say exactly what happened.
 *
 * Known limitation (accepted): validation and writes are separate statements, so a
 * concurrent change (e.g. the student's role) between them is not caught; closing
 * that would need a DB trigger/migration. It also runs several sequential queries
 * per subject (bounded by the 50-subject cap).
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
      ? {
          error:
            enrolled.length === 0
              ? 'No se inscribió en ninguna materia: revisa las que fallaron.'
              : `Se inscribió en ${enrolled.length} de ${ids.length} materias; revisa las que fallaron.`,
        }
      : {}),
    enrolled,
    failures,
  }
}
