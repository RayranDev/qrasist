/**
 * Reporte de un docente para coordinación: por materia, clases programadas /
 * dictadas / suspendidas / sin registrar, y por clase, cuántos inscritos
 * asistieron. Constructor PURO que reusa buildAttendanceReport (clase
 * dictada, rango, clases en curso) y buildClassList; sin I/O (las consultas
 * viven en professorUserReportService.ts).
 */
import {
  buildAttendanceReport,
  buildClassList,
  type ClassState,
  type ReportAttendanceInput,
  type ReportClassStatsInput,
  type ReportEnrollmentInput,
  type ReportHeldContext,
  type ReportRange,
  type ReportSessionInput,
  type ReportSubjectInput,
} from './attendanceReport'

/** Cifras de una materia dentro de un corte (el corte completo, no el rango del reporte). */
export interface ProfessorCutRow {
  cutId: string
  name: string
  sequence: number
  /** Clases esperadas del corte según el horario; null si la materia no tiene horario. */
  scheduled: number | null
  held: number
  suspended: number
  omitted: number | null
  omittedJustified: number | null
  /** Asistencia promedio de los inscritos en las clases del corte. */
  avgAttendancePct: number | null
}

export interface ProfessorSubjectRow {
  subjectCode: string
  subjectName: string
  periodName: string
  enrolled: number
  /** Clases esperadas según el horario; null si la materia no tiene horario. */
  scheduled: number | null
  held: number
  suspended: number
  /** Clases esperadas sin ningún registro; null si la materia no tiene horario. */
  omitted: number | null
  omittedJustified: number | null
  /** Asistencia promedio de los inscritos en las clases del rango. */
  avgAttendancePct: number | null
  /**
   * Desglose por corte del semestre (vacío si la materia no tiene cortes).
   * Es semestral aunque el reporte tenga rango: las cifras de arriba son las
   * generales del rango.
   */
  cuts: ProfessorCutRow[]
}

export interface ProfessorClassRow {
  sessionId: string
  /** timestamptz ISO de la clase */
  date: string
  subjectCode: string
  subjectName: string
  state: ClassState
  modality: 'PRESENCIAL' | 'VIRTUAL' | null
  isMakeup: boolean
  /** Inscritos que asistieron (solo clases dictadas; 0 en las demás). */
  attendees: number
  enrolled: number
  /** Motivo de la suspensión o de la reposición, si lo hay. */
  note: string
}

export interface ProfessorUserReport {
  subjects: ProfessorSubjectRow[]
  classes: ProfessorClassRow[]
}

export interface ProfessorUserReportInput {
  subjects: ReportSubjectInput[]
  sessions: ReportSessionInput[]
  enrollments: ReportEnrollmentInput[]
  attendances: ReportAttendanceInput[]
  /** Cumplimiento por materia ya acotado al rango (fetchClassStats). */
  classStats: ReportClassStatsInput[]
  /** Cumplimiento por materia acotado a cada corte (fetchClassStats con las fechas del corte). */
  cutClassStats?: { cutId: string; stats: ReportClassStatsInput[] }[]
  /** 'YYYY-MM-DD' inclusivos; null = sin límite. */
  from: string | null
  to: string | null
  held?: ReportHeldContext
}

const NO_PERIOD_LABEL = 'Sin período'

/**
 * Desglose por corte de cada materia con cortes: reusa buildAttendanceReport
 * acotado a las fechas de cada corte, así que clase dictada, clases en curso
 * y promedio de asistencia siguen exactamente las mismas reglas que el
 * resumen general.
 */
function buildCutRows(input: ProfessorUserReportInput): Map<string, ProfessorCutRow[]> {
  const bySubject = new Map<string, ProfessorCutRow[]>()
  const cuts = new Map<string, ReportSubjectInput['cuts'][number]>()
  for (const subject of input.subjects) for (const cut of subject.cuts) cuts.set(cut.id, cut)

  for (const cut of cuts.values()) {
    const subjects = input.subjects.filter((s) => s.cuts.some((c) => c.id === cut.id))
    const stats = input.cutClassStats?.find((c) => c.cutId === cut.id)?.stats ?? []
    const report = buildAttendanceReport({
      subjects,
      sessions: input.sessions,
      enrollments: input.enrollments,
      attendances: input.attendances,
      justifications: [],
      classStats: stats,
      range: { cutId: cut.id, label: cut.name, from: cut.startDate, to: cut.endDate },
      held: input.held,
    })
    const statsBySubject = new Map(stats.map((s) => [s.subjectId, s]))
    for (const summary of report.subjectSummaries) {
      const subjectStats = statsBySubject.get(summary.subjectId)
      const list = bySubject.get(summary.subjectId) ?? []
      list.push({
        cutId: cut.id,
        name: cut.name,
        sequence: cut.sequence,
        scheduled: subjectStats ? subjectStats.scheduled : null,
        held: summary.sessionsHeld,
        suspended: summary.sessionsSuspended,
        omitted: subjectStats ? subjectStats.omitted : null,
        omittedJustified: subjectStats ? subjectStats.omittedJustified : null,
        avgAttendancePct: summary.avgAttendancePct,
      })
      bySubject.set(summary.subjectId, list)
    }
  }
  for (const list of bySubject.values()) list.sort((a, b) => a.sequence - b.sequence)
  return bySubject
}

export function buildProfessorUserReport(input: ProfessorUserReportInput): ProfessorUserReport {
  const range: ReportRange = { cutId: null, label: '', from: input.from, to: input.to }
  const report = buildAttendanceReport({
    subjects: input.subjects,
    sessions: input.sessions,
    enrollments: input.enrollments,
    attendances: input.attendances,
    justifications: [],
    classStats: input.classStats,
    range,
    held: input.held,
  })
  const summaryBySubject = new Map(report.subjectSummaries.map((s) => [s.subjectId, s]))
  const cutRowsBySubject = buildCutRows(input)
  const statsBySubject = new Map(input.classStats.map((s) => [s.subjectId, s]))
  const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

  const subjects: ProfessorSubjectRow[] = []
  const classes: ProfessorClassRow[] = []

  for (const subject of input.subjects) {
    const summary = summaryBySubject.get(subject.id)
    const stats = statsBySubject.get(subject.id)
    const enrolledIds = new Set(
      input.enrollments.filter((e) => e.subjectId === subject.id).map((e) => e.studentId)
    )
    subjects.push({
      subjectCode: subject.code,
      subjectName: subject.name,
      periodName: subject.periodName || NO_PERIOD_LABEL,
      enrolled: enrolledIds.size,
      scheduled: stats ? stats.scheduled : null,
      held: summary?.sessionsHeld ?? 0,
      suspended: summary?.sessionsSuspended ?? 0,
      omitted: stats ? stats.omitted : null,
      omittedJustified: stats ? stats.omittedJustified : null,
      avgAttendancePct: summary?.avgAttendancePct ?? null,
      cuts: cutRowsBySubject.get(subject.id) ?? [],
    })

    const subjectSessions = input.sessions.filter((s) => s.subjectId === subject.id)
    for (const entry of buildClassList(subjectSessions, input.attendances, enrolledIds, range)) {
      classes.push({
        sessionId: entry.sessionId,
        date: entry.date,
        subjectCode: subject.code,
        subjectName: subject.name,
        state: entry.state,
        modality: entry.modality,
        isMakeup: entry.isMakeup,
        attendees: entry.attendees,
        enrolled: enrolledIds.size,
        note: entry.suspensionReason?.trim() || entry.makeupReason?.trim() || '',
      })
    }
  }

  subjects.sort((a, b) => collator.compare(a.subjectCode, b.subjectCode))
  classes.sort(
    (a, b) => a.date.localeCompare(b.date) || collator.compare(a.subjectCode, b.subjectCode)
  )
  return { subjects, classes }
}
