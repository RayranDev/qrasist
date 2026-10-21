/**
 * Reportes de asistencia por corte (RF27, RF30-RF33): constructores PUROS
 * que a partir de filas ya cargadas (materias, sesiones, inscripciones,
 * asistencias, justificaciones aprobadas) arman lo que muestran los
 * reportes Excel/PDF del coordinador, el PDF del profesor y el del
 * estudiante. Sin I/O: las consultas viven en attendanceReportData.ts.
 *
 * Reglas (las mismas que el resto de la app):
 *  - "Clase dictada" = sesión con is_active distinto de false. Las
 *    suspendidas (RF20) y archivadas NO cuentan, y las asistencias
 *    registradas en ellas tampoco entran en ningún numerador.
 *  - El ESTADO (Normal / En riesgo / Perdida por fallas) es semestral:
 *    sale de computeAttendanceSummary sobre TODO el período, aunque el
 *    reporte sea de un solo corte. Los porcentajes, conteos, observaciones
 *    y excusas sí se acotan al rango elegido.
 *  - Un corte es un rango de fechas civiles de Bogotá, ambos extremos
 *    inclusivos.
 */
import {
  computeAttendanceSummary,
  type AbsencePolicyConfig,
  type AttendanceStatus,
} from '@/lib/utils/attendancePolicy'
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import {
  computeCutsBreakdown,
  type CutBreakdown,
  type CutInput,
} from '@/lib/attendance/cutsBreakdown'

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  NORMAL: 'Normal',
  WARNING: 'En riesgo',
  FAILED_ATTENDANCE: 'Perdida por fallas',
}

export const NO_PROFESSOR_LABEL = 'Sin asignar'
export const NO_CAREER_LABEL = 'Sin carrera'
export const WHOLE_PERIOD_LABEL = 'Todo el período'

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export interface ReportSubjectInput {
  id: string
  code: string
  name: string
  professorId: string | null
  professorName: string | null
  careerNames: string[]
  policy: AbsencePolicyConfig
  periodName?: string | null
  /** Cortes utilizables del período de la materia (ver usableCuts). */
  cuts: CutInput[]
}

export interface ReportSessionInput {
  id: string
  subjectId: string
  /** timestamptz ISO */
  date: string
  isActive: boolean | null
  suspendedAt: string | null
  suspensionReason?: string | null
  modality?: 'PRESENCIAL' | 'VIRTUAL' | null
  isMakeup?: boolean
  makeupReason?: string | null
}

export interface ReportEnrollmentInput {
  subjectId: string
  studentId: string
  studentCode: string | null
  studentName: string
}

export interface ReportAttendanceInput {
  sessionId: string
  studentId: string
  status: 'PRESENT' | 'LATE'
  /** Quién la marcó a mano; null = escaneo normal del QR. */
  markedBy: string | null
  manualReason: string | null
}

export interface ReportJustificationInput {
  sessionId: string
  studentId: string
  subjectId: string
  status: string
  reason: string
}

export interface ReportClassStatsInput {
  subjectId: string
  scheduled: number
  held: number
  suspended: number
  omitted: number
  omittedJustified: number
}

// ---------------------------------------------------------------------------
// Rango (período completo o un corte)
// ---------------------------------------------------------------------------

export interface ReportRange {
  cutId: string | null
  label: string
  /** 'YYYY-MM-DD' inclusivos; null = sin límite (todo el período). */
  from: string | null
  to: string | null
}

export const WHOLE_PERIOD_RANGE: ReportRange = {
  cutId: null,
  label: WHOLE_PERIOD_LABEL,
  from: null,
  to: null,
}

/** Rango de un corte; el período completo si no se pide ninguno; null si el corte no existe. */
export function resolveReportRange(
  cuts: Pick<CutInput, 'id' | 'name' | 'startDate' | 'endDate'>[],
  cutId?: string | null
): ReportRange | null {
  if (!cutId) return WHOLE_PERIOD_RANGE
  const cut = cuts.find((c) => c.id === cutId)
  if (!cut) return null
  return { cutId: cut.id, label: cut.name, from: cut.startDate, to: cut.endDate }
}

function isInRange(isoInstant: string, range: ReportRange): boolean {
  if (!range.from && !range.to) return true
  const day = bogotaCalendarDate(new Date(isoInstant))
  return (!range.from || day >= range.from) && (!range.to || day <= range.to)
}

function isHeld(session: ReportSessionInput): boolean {
  return session.isActive !== false && !session.suspendedAt
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? round1((part / whole) * 100) : null
}

// ---------------------------------------------------------------------------
// Salidas
// ---------------------------------------------------------------------------

export interface ReportObservation {
  /** timestamptz ISO de la clase */
  date: string
  status: 'PRESENT' | 'LATE'
  reason: string
}

export interface ReportExcuse {
  date: string
  reason: string
}

export interface StudentSubjectRow {
  career: string
  subjectId: string
  subjectCode: string
  subjectName: string
  professorId: string | null
  professorName: string
  studentId: string
  studentCode: string
  studentName: string
  /** Clases dictadas dentro del rango. */
  sessionsHeld: number
  /** Asistencias puntuales (PRESENT) del rango. */
  present: number
  late: number
  justified: number
  /** Faltas contadas del rango (incluye la penalización por tardanzas). */
  countedAbsences: number
  /** (puntuales + tardes) / clases del rango; null sin clases en el rango. */
  attendancePct: number | null
  /** Faltas contadas / clases del rango; null sin clases en el rango. */
  absencePct: number | null
  /** Veredicto semestral. */
  status: AttendanceStatus
  statusLabel: string
  semesterAbsences: number
  maxAbsencesAllowed: number
  observations: ReportObservation[]
  excuses: ReportExcuse[]
  /** Desglose por corte de TODO el período (vacío si no hay cortes). */
  cuts: CutBreakdown[]
}

export interface SubjectSummaryRow {
  subjectId: string
  subjectCode: string
  subjectName: string
  career: string
  professorName: string
  enrolled: number
  /** Clases dictadas / suspendidas / de reposición dentro del rango. */
  sessionsHeld: number
  sessionsSuspended: number
  makeups: number
  avgAttendancePct: number | null
  normal: number
  atRisk: number
  failed: number
}

export interface ProfessorComplianceRow {
  professorId: string | null
  professorName: string
  subjects: string[]
  scheduled: number
  held: number
  suspended: number
  notRegistered: number
  notRegisteredJustified: number
  /** (dictadas + suspendidas) / programadas, tope 100; null sin clases programadas. */
  compliancePct: number | null
  /** Materias sin horario semanal: no se puede medir su cumplimiento. */
  subjectsWithoutSchedule: number
}

export interface ReportTotals {
  subjects: number
  professors: number
  enrollments: number
  students: number
  sessionsHeld: number
  sessionsSuspended: number
  /** Asistidas / clases dictadas sobre todas las filas estudiante-materia. */
  overallAttendancePct: number | null
  /** Estudiantes distintos cuyo peor estado es En riesgo / Perdida por fallas. */
  atRiskStudents: number
  failedStudents: number
  /** Cumplimiento docente global (sobre las materias con horario). */
  complianceOverallPct: number | null
}

export interface AttendanceReport {
  range: ReportRange
  rows: StudentSubjectRow[]
  subjectSummaries: SubjectSummaryRow[]
  professors: ProfessorComplianceRow[]
  totals: ReportTotals
}

export interface ReportFilters {
  subjectId?: string
  professorId?: string
  status?: AttendanceStatus
  studentId?: string
}

export interface BuildReportInput {
  subjects: ReportSubjectInput[]
  sessions: ReportSessionInput[]
  enrollments: ReportEnrollmentInput[]
  attendances: ReportAttendanceInput[]
  justifications: ReportJustificationInput[]
  /** Conteos de cumplimiento docente ya acotados al rango (fetchClassStats). */
  classStats?: ReportClassStatsInput[]
  range?: ReportRange
  filters?: ReportFilters
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}

function careerLabel(names: string[]): string {
  return names.length > 0 ? names.join(' / ') : NO_CAREER_LABEL
}

/** Qué cuenta de un estudiante en una materia, a partir de sus registros crudos. */
function studentCounts(
  heldSessions: ReportSessionInput[],
  attendanceBySession: Map<string, ReportAttendanceInput>,
  justifiedSessionIds: Set<string>
) {
  let attended = 0
  let late = 0
  let justified = 0
  for (const session of heldSessions) {
    const attendance = attendanceBySession.get(session.id)
    if (attendance) {
      attended++
      if (attendance.status === 'LATE') late++
    } else if (justifiedSessionIds.has(session.id)) {
      justified++
    }
  }
  return { attended, late, justified }
}

export function buildAttendanceReport(input: BuildReportInput): AttendanceReport {
  const range = input.range ?? WHOLE_PERIOD_RANGE
  const filters = input.filters ?? {}

  const subjects = input.subjects.filter(
    (s) =>
      (!filters.subjectId || s.id === filters.subjectId) &&
      (!filters.professorId || s.professorId === filters.professorId)
  )
  const subjectIds = new Set(subjects.map((s) => s.id))

  const sessionsBySubject = groupBy(
    input.sessions.filter((s) => subjectIds.has(s.subjectId)),
    (s) => s.subjectId
  )
  const enrollmentsBySubject = groupBy(
    input.enrollments.filter(
      (e) =>
        subjectIds.has(e.subjectId) && (!filters.studentId || e.studentId === filters.studentId)
    ),
    (e) => e.subjectId
  )

  // Asistencia por estudiante y sesión (una por sesión; si hubiera
  // duplicados gana la primera, igual que un conteo de filas únicas).
  const attendanceByStudentSession = new Map<string, ReportAttendanceInput>()
  for (const a of input.attendances) {
    const key = `${a.studentId}|${a.sessionId}`
    if (!attendanceByStudentSession.has(key)) attendanceByStudentSession.set(key, a)
  }
  const approvedByStudentSession = new Map<string, ReportJustificationInput>()
  for (const j of input.justifications) {
    if (j.status !== 'APPROVED') continue
    approvedByStudentSession.set(`${j.studentId}|${j.sessionId}`, j)
  }

  const rows: StudentSubjectRow[] = []
  const subjectSummaries: SubjectSummaryRow[] = []

  for (const subject of subjects) {
    const allSessions = sessionsBySubject.get(subject.id) || []
    const heldAll = allSessions.filter(isHeld)
    const heldInRange = heldAll.filter((s) => isInRange(s.date, range))
    const career = careerLabel(subject.careerNames)
    const professorName = subject.professorName || NO_PROFESSOR_LABEL

    const subjectRows: StudentSubjectRow[] = []
    for (const enrollment of enrollmentsBySubject.get(subject.id) || []) {
      const studentAttendance = new Map<string, ReportAttendanceInput>()
      const justifiedSessionIds = new Set<string>()
      for (const session of heldAll) {
        const key = `${enrollment.studentId}|${session.id}`
        const attendance = attendanceByStudentSession.get(key)
        if (attendance) studentAttendance.set(session.id, attendance)
        else if (approvedByStudentSession.has(key)) justifiedSessionIds.add(session.id)
      }

      const semester = studentCounts(heldAll, studentAttendance, justifiedSessionIds)
      const semesterSummary = computeAttendanceSummary(
        heldAll.length,
        semester.attended,
        subject.policy,
        semester.late,
        semester.justified
      )

      const inRange = studentCounts(heldInRange, studentAttendance, justifiedSessionIds)
      const rangeSummary = computeAttendanceSummary(
        heldInRange.length,
        inRange.attended,
        subject.policy,
        inRange.late,
        inRange.justified
      )

      const observations: ReportObservation[] = []
      const excuses: ReportExcuse[] = []
      for (const session of heldInRange) {
        const attendance = studentAttendance.get(session.id)
        if (attendance?.markedBy) {
          observations.push({
            date: session.date,
            status: attendance.status,
            reason: attendance.manualReason?.trim() || 'Marcada manualmente sin motivo registrado',
          })
        }
        if (justifiedSessionIds.has(session.id)) {
          const justification = approvedByStudentSession.get(
            `${enrollment.studentId}|${session.id}`
          )
          excuses.push({ date: session.date, reason: justification?.reason ?? '' })
        }
      }

      const attendedInRange = rangeSummary.attendancesCount
      const lateInRange = rangeSummary.lateCount

      const cuts =
        subject.cuts.length > 0
          ? computeCutsBreakdown(
              subject.cuts,
              heldAll.map((s) => ({ id: s.id, date: s.date })),
              new Map(
                [...studentAttendance].map(([sessionId, a]) => [sessionId, { status: a.status }])
              ),
              justifiedSessionIds
            )
          : []

      subjectRows.push({
        career,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        professorId: subject.professorId,
        professorName,
        studentId: enrollment.studentId,
        studentCode: enrollment.studentCode || 'N/A',
        studentName: enrollment.studentName || 'Desconocido',
        sessionsHeld: heldInRange.length,
        present: attendedInRange - lateInRange,
        late: lateInRange,
        justified: rangeSummary.justifiedCount,
        countedAbsences: rangeSummary.absencesCount,
        attendancePct: pct(attendedInRange, heldInRange.length),
        absencePct: heldInRange.length > 0 ? rangeSummary.absencePercentage : null,
        status: semesterSummary.status,
        statusLabel: STATUS_LABELS[semesterSummary.status],
        semesterAbsences: semesterSummary.absencesCount,
        maxAbsencesAllowed: semesterSummary.maxAbsencesAllowed,
        observations,
        excuses,
        cuts,
      })
    }

    const visibleRows = filters.status
      ? subjectRows.filter((r) => r.status === filters.status)
      : subjectRows
    rows.push(...visibleRows)

    const pcts = visibleRows.map((r) => r.attendancePct).filter((p): p is number => p !== null)
    const rangeSessions = allSessions.filter((s) => isInRange(s.date, range))
    subjectSummaries.push({
      subjectId: subject.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      career,
      professorName,
      enrolled: visibleRows.length,
      sessionsHeld: heldInRange.length,
      sessionsSuspended: rangeSessions.filter((s) => !!s.suspendedAt).length,
      makeups: heldInRange.filter((s) => s.isMakeup).length,
      avgAttendancePct:
        pcts.length > 0 ? round1(pcts.reduce((sum, p) => sum + p, 0) / pcts.length) : null,
      normal: visibleRows.filter((r) => r.status === 'NORMAL').length,
      atRisk: visibleRows.filter((r) => r.status === 'WARNING').length,
      failed: visibleRows.filter((r) => r.status === 'FAILED_ATTENDANCE').length,
    })
  }

  // Orden estable y legible: materia y luego estudiante (con números en
  // orden natural), sin depender del orden en que llegaron las consultas.
  const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
  rows.sort(
    (x, y) =>
      collator.compare(x.subjectName, y.subjectName) ||
      collator.compare(x.studentName, y.studentName)
  )
  subjectSummaries.sort((x, y) => collator.compare(x.subjectCode, y.subjectCode))

  const professors = buildProfessorRows(subjects, sessionsBySubject, input.classStats || [], range)

  return {
    range,
    rows,
    subjectSummaries,
    professors,
    totals: buildTotals(rows, subjectSummaries, professors),
  }
}

function buildProfessorRows(
  subjects: ReportSubjectInput[],
  sessionsBySubject: Map<string, ReportSessionInput[]>,
  classStats: ReportClassStatsInput[],
  range: ReportRange
): ProfessorComplianceRow[] {
  const statsBySubject = new Map(classStats.map((s) => [s.subjectId, s]))
  const byProfessor = new Map<
    string,
    ProfessorComplianceRow & { measuredHeld: number; measuredSuspended: number }
  >()

  for (const subject of subjects) {
    const key = subject.professorId ?? '__none__'
    let row = byProfessor.get(key)
    if (!row) {
      row = {
        professorId: subject.professorId,
        professorName: subject.professorName || NO_PROFESSOR_LABEL,
        subjects: [],
        scheduled: 0,
        held: 0,
        suspended: 0,
        notRegistered: 0,
        notRegisteredJustified: 0,
        compliancePct: null,
        subjectsWithoutSchedule: 0,
        measuredHeld: 0,
        measuredSuspended: 0,
      }
      byProfessor.set(key, row)
    }
    row.subjects.push(`${subject.code} ${subject.name}`)

    const stats = statsBySubject.get(subject.id)
    if (stats) {
      row.scheduled += stats.scheduled
      row.held += stats.held
      row.suspended += stats.suspended
      row.notRegistered += stats.omitted
      row.notRegisteredJustified += stats.omittedJustified
      row.measuredHeld += stats.held
      row.measuredSuspended += stats.suspended
    } else {
      // Sin horario semanal (o período sin fechas válidas): no hay clases
      // "programadas" contra las cuales medir, pero lo dictado sí se cuenta.
      const rangeSessions = (sessionsBySubject.get(subject.id) || []).filter((s) =>
        isInRange(s.date, range)
      )
      row.held += rangeSessions.filter(isHeld).length
      row.suspended += rangeSessions.filter((s) => !!s.suspendedAt).length
      row.subjectsWithoutSchedule += 1
    }
  }

  return [...byProfessor.values()]
    .map(({ measuredHeld, measuredSuspended, ...row }) => ({
      ...row,
      compliancePct:
        row.scheduled > 0
          ? Math.min(100, round1(((measuredHeld + measuredSuspended) / row.scheduled) * 100))
          : null,
    }))
    .sort((a, b) => a.professorName.localeCompare(b.professorName, 'es'))
}

function buildTotals(
  rows: StudentSubjectRow[],
  subjectSummaries: SubjectSummaryRow[],
  professors: ProfessorComplianceRow[]
): ReportTotals {
  let attendedTotal = 0
  let heldTotal = 0
  const worstByStudent = new Map<string, AttendanceStatus>()
  const rank: Record<AttendanceStatus, number> = { NORMAL: 0, WARNING: 1, FAILED_ATTENDANCE: 2 }
  for (const r of rows) {
    attendedTotal += r.present + r.late
    heldTotal += r.sessionsHeld
    const current = worstByStudent.get(r.studentId)
    if (!current || rank[r.status] > rank[current]) worstByStudent.set(r.studentId, r.status)
  }
  const worst = [...worstByStudent.values()]

  const scheduled = professors.reduce((sum, p) => sum + p.scheduled, 0)
  const measured = professors.reduce(
    (sum, p) => sum + (p.compliancePct === null ? 0 : (p.compliancePct / 100) * p.scheduled),
    0
  )

  return {
    subjects: subjectSummaries.length,
    professors: professors.length,
    enrollments: rows.length,
    students: worstByStudent.size,
    sessionsHeld: subjectSummaries.reduce((sum, s) => sum + s.sessionsHeld, 0),
    sessionsSuspended: subjectSummaries.reduce((sum, s) => sum + s.sessionsSuspended, 0),
    overallAttendancePct: pct(attendedTotal, heldTotal),
    atRiskStudents: worst.filter((s) => s === 'WARNING').length,
    failedStudents: worst.filter((s) => s === 'FAILED_ATTENDANCE').length,
    complianceOverallPct: scheduled > 0 ? round1((measured / scheduled) * 100) : null,
  }
}

// ---------------------------------------------------------------------------
// Lista de clases de una materia (PDF del profesor)
// ---------------------------------------------------------------------------

export type ClassState = 'HELD' | 'SUSPENDED' | 'ARCHIVED'

export interface ClassListEntry {
  sessionId: string
  date: string
  modality: 'PRESENCIAL' | 'VIRTUAL' | null
  isMakeup: boolean
  makeupReason: string | null
  state: ClassState
  suspensionReason: string | null
  /** Asistentes inscritos registrados en la clase (solo clases dictadas). */
  attendees: number
}

export function buildClassList(
  sessions: ReportSessionInput[],
  attendances: ReportAttendanceInput[],
  enrolledStudentIds: Set<string>,
  range: ReportRange
): ClassListEntry[] {
  const attendeesBySession = new Map<string, number>()
  for (const a of attendances) {
    if (!enrolledStudentIds.has(a.studentId)) continue
    attendeesBySession.set(a.sessionId, (attendeesBySession.get(a.sessionId) || 0) + 1)
  }

  return sessions
    .filter((s) => isInRange(s.date, range))
    .map((s): ClassListEntry => {
      const state: ClassState = s.suspendedAt
        ? 'SUSPENDED'
        : s.isActive === false
          ? 'ARCHIVED'
          : 'HELD'
      return {
        sessionId: s.id,
        date: s.date,
        modality: s.modality ?? null,
        isMakeup: !!s.isMakeup,
        makeupReason: s.makeupReason ?? null,
        state,
        suspensionReason: s.suspensionReason ?? null,
        attendees: state === 'HELD' ? attendeesBySession.get(s.id) || 0 : 0,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------------------
// Historial del estudiante (RF33)
// ---------------------------------------------------------------------------

export type HistoryEntryState = 'PRESENT' | 'LATE' | 'JUSTIFIED' | 'ABSENT' | 'SUSPENDED'

export interface StudentHistoryEntry {
  sessionId: string
  date: string
  state: HistoryEntryState
  /** Registrada a mano por el profesor/coordinación. */
  manual: boolean
  /** Motivo de la marca manual, de la excusa o de la suspensión. */
  note: string
}

export interface StudentSubjectHistory {
  subjectId: string
  subjectCode: string
  subjectName: string
  professorName: string
  status: AttendanceStatus
  statusLabel: string
  sessionsHeld: number
  attended: number
  late: number
  justified: number
  countedAbsences: number
  maxAbsencesAllowed: number
  attendancePct: number | null
  cuts: CutBreakdown[]
  entries: StudentHistoryEntry[]
}

/** Historial de un estudiante: una entrada por clase dictada o suspendida, de la más antigua a la más reciente. */
export function buildStudentHistory(input: {
  studentId: string
  subjects: ReportSubjectInput[]
  sessions: ReportSessionInput[]
  attendances: ReportAttendanceInput[]
  justifications: ReportJustificationInput[]
}): StudentSubjectHistory[] {
  const sessionsBySubject = groupBy(input.sessions, (s) => s.subjectId)
  const mine = input.attendances.filter((a) => a.studentId === input.studentId)
  const attendanceBySession = new Map<string, ReportAttendanceInput>()
  for (const a of mine)
    if (!attendanceBySession.has(a.sessionId)) attendanceBySession.set(a.sessionId, a)
  const approved = new Map(
    input.justifications
      .filter((j) => j.studentId === input.studentId && j.status === 'APPROVED')
      .map((j) => [j.sessionId, j])
  )

  return input.subjects
    .map((subject): StudentSubjectHistory => {
      const sessions = (sessionsBySubject.get(subject.id) || []).sort((a, b) =>
        a.date.localeCompare(b.date)
      )
      const held = sessions.filter(isHeld)
      const attendedMap = new Map<string, ReportAttendanceInput>()
      const justifiedIds = new Set<string>()
      for (const s of held) {
        const a = attendanceBySession.get(s.id)
        if (a) attendedMap.set(s.id, a)
        else if (approved.has(s.id)) justifiedIds.add(s.id)
      }
      const counts = studentCounts(held, attendedMap, justifiedIds)
      const summary = computeAttendanceSummary(
        held.length,
        counts.attended,
        subject.policy,
        counts.late,
        counts.justified
      )

      const entries: StudentHistoryEntry[] = []
      for (const s of sessions) {
        if (s.suspendedAt) {
          entries.push({
            sessionId: s.id,
            date: s.date,
            state: 'SUSPENDED',
            manual: false,
            note: s.suspensionReason?.trim() || '',
          })
          continue
        }
        if (!isHeld(s)) continue
        const a = attendedMap.get(s.id)
        if (a) {
          entries.push({
            sessionId: s.id,
            date: s.date,
            state: a.status,
            manual: !!a.markedBy,
            note: a.markedBy ? a.manualReason?.trim() || '' : '',
          })
        } else if (justifiedIds.has(s.id)) {
          entries.push({
            sessionId: s.id,
            date: s.date,
            state: 'JUSTIFIED',
            manual: false,
            note: approved.get(s.id)?.reason ?? '',
          })
        } else {
          entries.push({ sessionId: s.id, date: s.date, state: 'ABSENT', manual: false, note: '' })
        }
      }

      return {
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        professorName: subject.professorName || NO_PROFESSOR_LABEL,
        status: summary.status,
        statusLabel: STATUS_LABELS[summary.status],
        sessionsHeld: held.length,
        attended: summary.attendancesCount,
        late: summary.lateCount,
        justified: summary.justifiedCount,
        countedAbsences: summary.absencesCount,
        maxAbsencesAllowed: summary.maxAbsencesAllowed,
        attendancePct: pct(summary.attendancesCount, held.length),
        cuts:
          subject.cuts.length > 0
            ? computeCutsBreakdown(
                subject.cuts,
                held.map((s) => ({ id: s.id, date: s.date })),
                new Map([...attendedMap].map(([id, a]) => [id, { status: a.status }])),
                justifiedIds
              )
            : [],
        entries,
      }
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'es'))
}
