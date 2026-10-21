/**
 * I/O del desglose por corte de un estudiante (informativo): para cada
 * materia en que está inscrito arma el desglose de computeCutsBreakdown
 * con consultas acotadas y paginadas. Las materias cuyo período no tiene
 * cortes utilizables simplemente no aparecen en el resultado.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import type { CutBreakdown, SessionAttendance } from './cutsBreakdown'
import {
  buildStudentCutBreakdown,
  usableCuts,
  type PeriodCutRow,
  type PeriodDates,
} from './cutsView'

interface EnrollmentRow {
  subject_id: string
  subject: {
    id: string
    is_active: boolean | null
    period_id: string | null
    period: PeriodDates | PeriodDates[] | null
  } | null
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** subjectId -> desglose por corte. Solo materias con cortes utilizables. */
export async function getStudentCutBreakdowns(
  supabase: SupabaseClient,
  studentId: string
): Promise<Map<string, CutBreakdown[]>> {
  const result = new Map<string, CutBreakdown[]>()

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(
      'subject_id, subject:subjects(id, is_active, period_id, period:periods(start_date, end_date))'
    )
    .eq('student_id', studentId)

  const subjects = ((enrollments || []) as unknown as EnrollmentRow[])
    .map((e) => e.subject)
    .filter((s): s is NonNullable<EnrollmentRow['subject']> => !!s && s.is_active !== false)

  const periodIds = [
    ...new Set(subjects.map((s) => s.period_id).filter((id): id is string => !!id)),
  ]
  if (periodIds.length === 0) return result

  const { data: cutRows } = await supabase
    .from('period_cuts')
    .select('id, period_id, name, start_date, end_date, sequence')
    .in('period_id', periodIds)

  const cutRowsByPeriod = new Map<string, PeriodCutRow[]>()
  for (const cut of (cutRows || []) as (PeriodCutRow & { period_id: string })[]) {
    cutRowsByPeriod.set(cut.period_id, [...(cutRowsByPeriod.get(cut.period_id) || []), cut])
  }

  // Solo se consultan sesiones de las materias que sí tienen cortes.
  const withCuts = subjects
    .map((s) => ({
      subjectId: s.id,
      cuts: usableCuts(first(s.period), s.period_id ? cutRowsByPeriod.get(s.period_id) : []),
    }))
    .filter((s) => s.cuts.length > 0)
  if (withCuts.length === 0) return result

  const subjectIds = withCuts.map((s) => s.subjectId)

  interface SessionRow {
    id: string
    subject_id: string
    date: string
    is_active: boolean | null
  }
  interface AttendanceRow {
    session_id: string
    status: string
  }
  interface JustificationRow {
    session_id: string
  }

  const [{ data: sessions }, { data: attendances }, { data: justifications }] = await Promise.all([
    fetchAllRows<SessionRow>((from, to) =>
      supabase
        .from('sessions')
        .select('id, subject_id, date, is_active')
        .in('subject_id', subjectIds)
        .eq('is_active', true)
        .order('id')
        .range(from, to)
    ),
    fetchAllRows<AttendanceRow>((from, to) =>
      supabase
        .from('attendances')
        .select('session_id, status')
        .eq('student_id', studentId)
        .order('id')
        .range(from, to)
    ),
    fetchAllRows<JustificationRow>((from, to) =>
      supabase
        .from('absence_justifications')
        .select('session_id')
        .eq('student_id', studentId)
        .eq('status', 'APPROVED')
        .in('subject_id', subjectIds)
        .order('id')
        .range(from, to)
    ),
  ])

  const attendanceBySessionId = new Map<string, SessionAttendance>(
    attendances.map((a) => [a.session_id, { status: a.status === 'LATE' ? 'LATE' : 'PRESENT' }])
  )
  const justifiedSessionIds = new Set(justifications.map((j) => j.session_id))

  for (const { subjectId, cuts } of withCuts) {
    result.set(
      subjectId,
      buildStudentCutBreakdown({
        cuts,
        sessions: sessions.filter((s) => s.subject_id === subjectId),
        attendanceBySessionId,
        justifiedSessionIds,
      })
    )
  }
  return result
}
