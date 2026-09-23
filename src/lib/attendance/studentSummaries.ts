import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeAttendanceSummary,
  type AbsencePolicyConfig,
  type StudentAttendanceSummary,
} from '@/lib/utils/attendancePolicy'
import { fetchAllRows } from '@/lib/supabase/fetchAll'

export interface EnrolledSubjectCounts {
  subjectId: string
  subjectCode: string
  subjectName: string
  policy: AbsencePolicyConfig
  sessionsHeld: number
  attendancesCount: number
  lateCount: number
  justifiedCount: number
}

export interface StudentSubjectRisk {
  subjectId: string
  subjectCode: string
  subjectName: string
  summary: StudentAttendanceSummary
}

/**
 * Pura: mapea conteos ya agregados de materias inscritas a su resumen de
 * asistencia. Se separa de `getStudentSubjectRisks` (que hace las
 * consultas) para que una página que ya tiene estos conteos por otro
 * motivo -- como /student/subjects, que los necesita también para las
 * sesiones perdidas -- pueda reusar exactamente la misma lógica de
 * cálculo sin disparar otra ronda de queries.
 */
export function computeStudentSubjectRisks(rows: EnrolledSubjectCounts[]): StudentSubjectRisk[] {
  return rows.map((r) => ({
    subjectId: r.subjectId,
    subjectCode: r.subjectCode,
    subjectName: r.subjectName,
    summary: computeAttendanceSummary(
      r.sessionsHeld,
      r.attendancesCount,
      r.policy,
      r.lateCount,
      r.justifiedCount
    ),
  }))
}

export function filterAtRiskSubjects(risks: StudentSubjectRisk[]): StudentSubjectRisk[] {
  return risks.filter((r) => r.summary.status !== 'NORMAL')
}

/**
 * Línea compacta de estado por materia para /student/history, ej.
 * "3 faltas de 4 permitidas · 1 justificada · 2 tardes". Los segmentos
 * de justificadas y tardanzas solo aparecen si hay al menos una --
 * distinta de `statusMessage` (pensada para alertas, no para un
 * resumen siempre visible).
 */
export function formatSubjectStatusLine(summary: StudentAttendanceSummary): string {
  const parts = [
    `${summary.absencesCount} falta${summary.absencesCount === 1 ? '' : 's'} de ${summary.maxAbsencesAllowed} permitidas`,
  ]
  if (summary.justifiedCount > 0) {
    parts.push(`${summary.justifiedCount} justificada${summary.justifiedCount === 1 ? '' : 's'}`)
  }
  if (summary.lateCount > 0) {
    parts.push(`${summary.lateCount} tarde${summary.lateCount === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

interface SubjectRow {
  id: string
  name: string
  code: string
  is_active: boolean | null
  absence_rule_type?: AbsencePolicyConfig['ruleType']
  max_absence_percentage?: number
  max_absence_count?: number | null
  total_planned_sessions?: number
  lates_per_absence?: number | null
}

/**
 * I/O: arma los resúmenes de riesgo de las materias en que el
 * estudiante está inscrito, con sus propias consultas mínimas.
 * Pensada para páginas que no cargan esta información por otra razón
 * (ej. /student/scanner, que solo necesita saber si mostrar un banner).
 * /student/subjects ya trae estos datos para su propio listado -- ahí
 * conviene alimentar `computeStudentSubjectRisks` directamente en vez
 * de llamar a esta función y duplicar las mismas consultas.
 */
export async function getStudentSubjectRisks(
  supabase: SupabaseClient,
  studentId: string
): Promise<StudentSubjectRisk[]> {
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(
      `subject_id, subject:subjects (
        id, name, code, is_active,
        absence_rule_type, max_absence_percentage, max_absence_count,
        total_planned_sessions, lates_per_absence
      )`
    )
    .eq('student_id', studentId)

  const subjects = (enrollments || [])
    .map((e) => e.subject as unknown as SubjectRow | null)
    .filter((s): s is SubjectRow => !!s && s.is_active !== false)

  if (subjects.length === 0) return []

  const subjectIds = subjects.map((s) => s.id)
  const subjectIdSet = new Set(subjectIds)

  // PostgREST trunca a 1000 filas por defecto sin avisar -- un
  // estudiante con muchos semestres encima puede acumular más
  // asistencias que eso, así que se pagina con fetchAllRows en vez de
  // confiar en una sola página.
  interface ActiveSessionRow {
    id: string
    subject_id: string
  }
  interface AttendanceRow {
    status: string
    // Supabase infiere el embed `session:sessions(subject_id)` como
    // array (no puede saber la cardinalidad de la FK sin generics
    // explícitos) -- se deja `unknown` acá y se castea al leerlo, igual
    // que hacía el código antes de paginar con fetchAllRows.
    session: unknown
  }
  interface ApprovedJustificationRow {
    subject_id: string
  }

  const [{ data: activeSessions }, { data: attendances }, { data: approvedJustifications }] =
    await Promise.all([
      fetchAllRows<ActiveSessionRow>((from, to) =>
        supabase
          .from('sessions')
          .select('id, subject_id')
          .eq('is_active', true)
          .in('subject_id', subjectIds)
          .range(from, to)
      ),
      fetchAllRows<AttendanceRow>((from, to) =>
        supabase
          .from('attendances')
          .select('status, session:sessions(subject_id)')
          .eq('student_id', studentId)
          .range(from, to)
      ),
      fetchAllRows<ApprovedJustificationRow>((from, to) =>
        supabase
          .from('absence_justifications')
          .select('subject_id')
          .eq('student_id', studentId)
          .eq('status', 'APPROVED')
          .in('subject_id', subjectIds)
          .range(from, to)
      ),
    ])

  const sessionsHeldBySubject = new Map<string, number>()
  for (const s of activeSessions) {
    sessionsHeldBySubject.set(s.subject_id, (sessionsHeldBySubject.get(s.subject_id) || 0) + 1)
  }

  const attendedBySubject = new Map<string, number>()
  const lateBySubject = new Map<string, number>()
  for (const a of attendances) {
    const subjectId = (a.session as unknown as { subject_id: string } | null)?.subject_id
    if (!subjectId || !subjectIdSet.has(subjectId)) continue
    attendedBySubject.set(subjectId, (attendedBySubject.get(subjectId) || 0) + 1)
    if (a.status === 'LATE') {
      lateBySubject.set(subjectId, (lateBySubject.get(subjectId) || 0) + 1)
    }
  }

  const justifiedBySubject = new Map<string, number>()
  for (const j of approvedJustifications) {
    justifiedBySubject.set(j.subject_id, (justifiedBySubject.get(j.subject_id) || 0) + 1)
  }

  const rows: EnrolledSubjectCounts[] = subjects.map((s) => ({
    subjectId: s.id,
    subjectCode: s.code,
    subjectName: s.name,
    policy: {
      ruleType: s.absence_rule_type,
      maxPercentage: s.max_absence_percentage,
      maxCount: s.max_absence_count,
      totalPlannedSessions: s.total_planned_sessions,
      latesPerAbsence: s.lates_per_absence,
    },
    sessionsHeld: sessionsHeldBySubject.get(s.id) || 0,
    attendancesCount: attendedBySubject.get(s.id) || 0,
    lateCount: lateBySubject.get(s.id) || 0,
    justifiedCount: justifiedBySubject.get(s.id) || 0,
  }))

  return computeStudentSubjectRisks(rows)
}
