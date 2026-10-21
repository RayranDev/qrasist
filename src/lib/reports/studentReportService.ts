/**
 * Orquestación del PDF de historial del estudiante (RF33). Siempre se
 * deriva de la sesión: el id del estudiante nunca viene del cliente, y las
 * consultas se acotan a sus propias inscripciones, asistencias y
 * justificaciones.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildStudentHistory, type StudentSubjectHistory } from './attendanceReport'
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, student_code, role, is_active')
    .eq('id', studentId)
    .maybeSingle()
  if (!profile || !profile.is_active || profile.role !== 'STUDENT') {
    return { ok: false, status: 403, error: 'No autorizado.' }
  }

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('subject_id')
    .eq('student_id', studentId)
  const subjectIds = [...new Set((enrollments || []).map((e) => e.subject_id as string))]

  const data = await loadReportData(supabase, { subjectIds, studentId, activeOnly: true })
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
