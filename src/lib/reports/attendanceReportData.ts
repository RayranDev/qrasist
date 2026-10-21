/**
 * I/O de los reportes de asistencia: trae, con consultas acotadas y
 * paginadas (PostgREST corta a 1000 filas), todo lo que necesitan los
 * constructores puros de attendanceReport.ts. No es un archivo
 * 'use server': lo importan route handlers.
 *
 * Quién ve qué lo decide RLS (admin: todo; profesor: sus materias;
 * estudiante: lo suyo), pero cada route handler además re-deriva la
 * autorización por su cuenta -- este módulo no decide permisos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, unwrapRows } from '@/lib/supabase/fetchAll'
import type { AbsenceRuleType } from '@/lib/utils/attendancePolicy'
import { usableCuts, type PeriodCutRow } from '@/lib/attendance/cutsView'
import { getAppSettings } from '@/lib/settings/appSettings'
import type {
  ReportAttendanceInput,
  ReportEnrollmentInput,
  ReportHeldContext,
  ReportJustificationInput,
  ReportSessionInput,
  ReportSubjectInput,
} from './attendanceReport'

/** Cuántas materias por consulta `.in(...)`: mantiene corta la URL de PostgREST. */
const SUBJECT_CHUNK = 50

interface SubjectRow {
  id: string
  name: string
  code: string
  is_active: boolean | null
  professor_id: string | null
  period_id: string | null
  absence_rule_type: AbsenceRuleType | null
  max_absence_percentage: number | null
  max_absence_count: number | null
  total_planned_sessions: number | null
  lates_per_absence: number | null
  professor: { name: string } | { name: string }[] | null
  period:
    | { id: string; name: string; start_date: string | null; end_date: string | null }
    | { id: string; name: string; start_date: string | null; end_date: string | null }[]
    | null
  subject_careers:
    { is_active: boolean | null; career: { name: string } | { name: string }[] | null }[] | null
}

interface SessionRow {
  id: string
  subject_id: string
  date: string
  class_ends_at: string | null
  is_active: boolean | null
  suspended_at: string | null
  suspension_reason: string | null
  modality: 'PRESENCIAL' | 'VIRTUAL' | null
  is_makeup: boolean | null
  makeup_reason: string | null
}

interface EnrollmentRow {
  subject_id: string
  student_id: string
  student:
    | { name: string; student_code: string | null }
    | { name: string; student_code: string | null }[]
    | null
}

interface AttendanceRow {
  session_id: string
  student_id: string
  status: string
  marked_by: string | null
  manual_reason: string | null
}

interface JustificationRow {
  session_id: string
  student_id: string
  subject_id: string
  status: string
  reason: string
}

export interface ReportDataQuery {
  /** Todas las materias de un período. */
  periodId?: string
  /** O un conjunto explícito de materias. */
  subjectIds?: string[]
  /** Limita inscripciones, asistencias y justificaciones a un estudiante. */
  studentId?: string
  /** Descarta materias archivadas (is_active = false). */
  activeOnly?: boolean
}

export interface ReportData {
  subjects: ReportSubjectInput[]
  sessions: ReportSessionInput[]
  enrollments: ReportEnrollmentInput[]
  attendances: ReportAttendanceInput[]
  justifications: ReportJustificationInput[]
  /** Hora actual y duración por defecto, para no contar clases en curso (DEF-QA-05). */
  held?: ReportHeldContext
}

const EMPTY: ReportData = {
  subjects: [],
  sessions: [],
  enrollments: [],
  attendances: [],
  justifications: [],
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const SUBJECT_SELECT = `
  id, name, code, is_active, professor_id, period_id,
  absence_rule_type, max_absence_percentage, max_absence_count,
  total_planned_sessions, lates_per_absence,
  professor:profiles(name),
  period:periods(id, name, start_date, end_date),
  subject_careers(is_active, career:careers(name))
`

async function loadSubjectRows(
  supabase: SupabaseClient,
  query: ReportDataQuery
): Promise<SubjectRow[]> {
  const rows: SubjectRow[] = []
  if (query.periodId) {
    const periodId = query.periodId
    const result = await fetchAllRows<SubjectRow>((from, to) =>
      supabase
        .from('subjects')
        .select(SUBJECT_SELECT)
        .eq('period_id', periodId)
        .order('id')
        .range(from, to)
    )
    rows.push(...unwrapRows(result, 'las materias del reporte'))
  } else {
    for (const part of chunk(query.subjectIds || [], SUBJECT_CHUNK)) {
      const result = await fetchAllRows<SubjectRow>((from, to) =>
        supabase.from('subjects').select(SUBJECT_SELECT).in('id', part).order('id').range(from, to)
      )
      rows.push(...unwrapRows(result, 'las materias del reporte'))
    }
  }
  return query.activeOnly ? rows.filter((r) => r.is_active !== false) : rows
}

export async function loadReportData(
  supabase: SupabaseClient,
  query: ReportDataQuery
): Promise<ReportData> {
  const subjectRows = await loadSubjectRows(supabase, query)
  if (subjectRows.length === 0) return EMPTY

  // Cortes de los períodos involucrados.
  const periodIds = [
    ...new Set(subjectRows.map((r) => r.period_id).filter((id): id is string => !!id)),
  ]
  const cutRowsByPeriod = new Map<string, PeriodCutRow[]>()
  for (const part of chunk(periodIds, SUBJECT_CHUNK)) {
    const result = await fetchAllRows<PeriodCutRow & { period_id: string }>((from, to) =>
      supabase
        .from('period_cuts')
        .select('id, period_id, name, start_date, end_date, sequence')
        .in('period_id', part)
        .order('id')
        .range(from, to)
    )
    for (const cut of unwrapRows(result, 'los cortes del período')) {
      cutRowsByPeriod.set(cut.period_id, [...(cutRowsByPeriod.get(cut.period_id) || []), cut])
    }
  }

  const subjects: ReportSubjectInput[] = subjectRows.map((s) => {
    const period = first(s.period)
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      professorId: s.professor_id,
      professorName: first(s.professor)?.name ?? null,
      careerNames: (s.subject_careers || [])
        .filter((sc) => sc.is_active !== false)
        .map((sc) => first(sc.career)?.name)
        .filter((n): n is string => !!n),
      policy: {
        ruleType: s.absence_rule_type ?? undefined,
        maxPercentage: s.max_absence_percentage ?? undefined,
        maxCount: s.max_absence_count,
        totalPlannedSessions: s.total_planned_sessions ?? undefined,
        latesPerAbsence: s.lates_per_absence,
      },
      periodName: period?.name ?? null,
      cuts: usableCuts(period, s.period_id ? cutRowsByPeriod.get(s.period_id) : []),
    }
  })

  const sessions: ReportSessionInput[] = []
  const enrollments: ReportEnrollmentInput[] = []
  const attendances: ReportAttendanceInput[] = []
  const justifications: ReportJustificationInput[] = []

  for (const part of chunk(
    subjects.map((s) => s.id),
    SUBJECT_CHUNK
  )) {
    const [sessionRes, enrollmentRes, attendanceRes, justificationRes] = await Promise.all([
      fetchAllRows<SessionRow>((from, to) =>
        supabase
          .from('sessions')
          .select(
            'id, subject_id, date, class_ends_at, is_active, suspended_at, suspension_reason, modality, is_makeup, makeup_reason'
          )
          .in('subject_id', part)
          .order('id')
          .range(from, to)
      ),
      fetchAllRows<EnrollmentRow>((from, to) => {
        let q = supabase
          .from('enrollments')
          .select('subject_id, student_id, student:profiles(name, student_code)')
          .in('subject_id', part)
        if (query.studentId) q = q.eq('student_id', query.studentId)
        return q.order('id').range(from, to)
      }),
      fetchAllRows<AttendanceRow>((from, to) => {
        // Inner join con sessions solo para poder filtrar por materia sin
        // armar una lista enorme de ids de sesión en la URL.
        let q = supabase
          .from('attendances')
          .select(
            'session_id, student_id, status, marked_by, manual_reason, sessions!inner(subject_id)'
          )
          .in('sessions.subject_id', part)
        if (query.studentId) q = q.eq('student_id', query.studentId)
        return q.order('id').range(from, to)
      }),
      fetchAllRows<JustificationRow>((from, to) => {
        let q = supabase
          .from('absence_justifications')
          .select('session_id, student_id, subject_id, status, reason')
          .eq('status', 'APPROVED')
          .in('subject_id', part)
        if (query.studentId) q = q.eq('student_id', query.studentId)
        return q.order('id').range(from, to)
      }),
    ])

    for (const e of [sessionRes, enrollmentRes, attendanceRes, justificationRes]) {
      if (e.error) throw new Error('No se pudieron cargar los datos del reporte.')
    }

    for (const s of sessionRes.data) {
      sessions.push({
        id: s.id,
        subjectId: s.subject_id,
        date: s.date,
        classEndsAt: s.class_ends_at,
        isActive: s.is_active,
        suspendedAt: s.suspended_at,
        suspensionReason: s.suspension_reason,
        modality: s.modality,
        isMakeup: !!s.is_makeup,
        makeupReason: s.makeup_reason,
      })
    }
    for (const e of enrollmentRes.data) {
      const student = first(e.student)
      if (!student) continue
      enrollments.push({
        subjectId: e.subject_id,
        studentId: e.student_id,
        studentCode: student.student_code,
        studentName: student.name,
      })
    }
    for (const a of attendanceRes.data) {
      attendances.push({
        sessionId: a.session_id,
        studentId: a.student_id,
        status: a.status === 'LATE' ? 'LATE' : 'PRESENT',
        markedBy: a.marked_by,
        manualReason: a.manual_reason,
      })
    }
    for (const j of justificationRes.data) {
      justifications.push({
        sessionId: j.session_id,
        studentId: j.student_id,
        subjectId: j.subject_id,
        status: j.status,
        reason: j.reason,
      })
    }
  }

  const { defaultClassMinutes } = await getAppSettings(supabase)
  return {
    subjects,
    sessions,
    enrollments,
    attendances,
    justifications,
    held: { now: new Date(), defaultClassMinutes },
  }
}
