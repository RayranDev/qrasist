/**
 * Orquestación del PDF de historial del estudiante (RF33). Siempre se
 * deriva de la sesión: el id del estudiante nunca viene del cliente, y las
 * consultas se acotan a sus propias inscripciones, asistencias y
 * justificaciones.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildStudentHistory, type StudentSubjectHistory } from './attendanceReport'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { loadReportData } from './attendanceReportData'

export interface StudentReport {
  studentName: string
  studentCode: string | null
  history: StudentSubjectHistory[]
}

export type StudentReportResult =
  { ok: true; report: StudentReport } | { ok: false; status: number; error: string }

export async function generateStudentReport(
  supabase: SupabaseClient,
  studentId: string
): Promise<StudentReportResult> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name, student_code, role, is_active')
    .eq('id', studentId)
    .maybeSingle()
  if (profileError) throw new Error('No se pudo cargar el perfil.', { cause: profileError })
  if (!profile || !profile.is_active || profile.role !== 'STUDENT') {
    return { ok: false, status: 403, error: 'No autorizado.' }
  }

  const { data: enrollments, error: enrollmentsError } = await supabase
    .from('enrollments')
    .select('subject_id')
    .eq('student_id', studentId)
  if (enrollmentsError) {
    throw new Error('No se pudieron cargar las inscripciones.', { cause: enrollmentsError })
  }
  const subjectIds = [...new Set((enrollments || []).map((e) => e.subject_id as string))]

  const data = await loadReportData(supabase, { subjectIds, studentId, activeOnly: true })
  // El estudiante no puede leer el perfil de sus docentes (RLS de profiles),
  // así que el nombre del docente de SUS materias se resuelve en el servidor
  // con el cliente de servicio, solo para los ids que salen de esas materias.
  const professorIds = [
    ...new Set(data.subjects.map((s) => s.professorId).filter((id): id is string => !!id)),
  ]
  if (professorIds.length > 0) {
    const { data: professors, error: professorsError } = await getSupabaseAdmin()
      .from('profiles')
      .select('id, name')
      .in('id', professorIds)
    if (professorsError) {
      throw new Error('No se pudieron cargar los docentes.', { cause: professorsError })
    }
    const nameById = new Map((professors || []).map((p) => [p.id as string, p.name as string]))
    for (const subject of data.subjects) {
      if (subject.professorId) subject.professorName = nameById.get(subject.professorId) ?? null
    }
  }

  const history = buildStudentHistory({
    studentId,
    subjects: data.subjects,
    sessions: data.sessions,
    attendances: data.attendances,
    justifications: data.justifications,
  })

  return {
    ok: true,
    report: { studentName: profile.name, studentCode: profile.student_code, history },
  }
}
