import type { SupabaseClient } from '@supabase/supabase-js'

async function getActiveCareerIds(
  supabase: SupabaseClient,
  table: string,
  column: string,
  id: string
) {
  const { data } = await supabase
    .from(table)
    .select('career_id')
    .eq(column, id)
    .eq('is_active', true)
  return (data || []).map((r) => r.career_id as string)
}

export function getSubjectCareerIds(supabase: SupabaseClient, subjectId: string) {
  return getActiveCareerIds(supabase, 'subject_careers', 'subject_id', subjectId)
}

export function getStudentCareerIds(supabase: SupabaseClient, studentId: string) {
  return getActiveCareerIds(supabase, 'student_careers', 'student_id', studentId)
}

export function getProfessorCareerIds(supabase: SupabaseClient, professorId: string) {
  return getActiveCareerIds(supabase, 'professor_careers', 'professor_id', professorId)
}

export function hasOverlap(a: string[], b: string[]) {
  const setB = new Set(b)
  return a.some((id) => setB.has(id))
}

/**
 * Gates A+B: una materia solo admite profesor si ya pertenece a
 * >=1 carrera, y el profesor debe pertenecer a >=1 de esas carreras.
 */
export async function checkProfessorAssignable(
  supabase: SupabaseClient,
  subjectId: string,
  professorId: string
) {
  const subjectCareers = await getSubjectCareerIds(supabase, subjectId)
  if (subjectCareers.length === 0) {
    return {
      ok: false,
      error:
        'Esta materia no pertenece a ninguna carrera. Asignale una carrera antes de asignar un profesor.',
    }
  }
  const professorCareers = await getProfessorCareerIds(supabase, professorId)
  if (professorCareers.length === 0) {
    return { ok: false, error: 'Este profesor no pertenece a ninguna carrera todavía.' }
  }
  if (!hasOverlap(subjectCareers, professorCareers)) {
    return { ok: false, error: 'Este profesor no pertenece a la(s) carrera(s) de esta materia.' }
  }
  return { ok: true as const }
}

/**
 * Gates A+C+D: la materia debe pertenecer a >=1 carrera, el
 * estudiante debe tener >=1 carrera, y deben coincidir.
 */
export async function checkStudentEnrollable(
  supabase: SupabaseClient,
  subjectId: string,
  studentId: string
) {
  const subjectCareers = await getSubjectCareerIds(supabase, subjectId)
  if (subjectCareers.length === 0) {
    return { ok: false, error: 'Esta materia no pertenece a ninguna carrera todavía.' }
  }
  const studentCareers = await getStudentCareerIds(supabase, studentId)
  if (studentCareers.length === 0) {
    return { ok: false, error: 'El estudiante no tiene ninguna carrera asignada.' }
  }
  if (!hasOverlap(subjectCareers, studentCareers)) {
    return { ok: false, error: 'El estudiante no pertenece a la carrera de esta materia.' }
  }
  return { ok: true as const }
}
