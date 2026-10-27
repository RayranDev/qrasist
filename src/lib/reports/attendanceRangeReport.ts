/**
 * Reporte de asistencia por rango de fechas (módulo /admin/attendance):
 * constructor PURO que, a partir de filas ya cargadas, arma una fila por
 * estudiante inscrito y clase del rango, con su estado, y un resumen por
 * materia. Sin I/O: las consultas viven en attendanceRangeService.ts y
 * attendanceReportData.ts.
 *
 * Reglas (las mismas del resto de reportes, ver attendanceReport.ts):
 *  - Clase dictada = sesión activa y no suspendida. Las suspendidas generan
 *    una fila "Clase suspendida" por inscrito y NO cuentan como falta; las
 *    archivadas (is_active = false sin suspensión) no aparecen.
 *  - Las ausencias se derivan de las inscripciones: inscrito sin asistencia
 *    en una clase dictada = Ausente, o Justificada si tiene una excusa
 *    aprobada para esa clase.
 *  - Con `held`, una clase EN CURSO no genera ausencias (DEF-QA-05): solo
 *    aparece quien ya registró asistencia, y la clase cuenta como dictada
 *    únicamente si alguien ya escaneó.
 *  - Asistencias de quien ya no está inscrito no se listan (el reporte parte
 *    de las inscripciones, igual que buildClassList).
 *  - Los días son días civiles de Bogotá, ambos extremos inclusivos.
 */
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import { hasClassEnded } from '@/lib/attendance/heldSessions'
import type {
  ReportAttendanceInput,
  ReportEnrollmentInput,
  ReportHeldContext,
  ReportJustificationInput,
  ReportSessionInput,
  ReportSubjectInput,
} from './attendanceReport'

export type RangeStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'JUSTIFIED' | 'SUSPENDED'

export const RANGE_STATUS_LABELS: Record<RangeStatus, string> = {
  PRESENT: 'Presente',
  LATE: 'Tarde',
  ABSENT: 'Ausente',
  JUSTIFIED: 'Justificada',
  SUSPENDED: 'Clase suspendida',
}

export const RANGE_NO_PROFESSOR_LABEL = 'Sin asignar'

export interface RangeDetailRow {
  /** Día civil de Bogotá de la clase, 'YYYY-MM-DD'. */
  date: string
  /** timestamptz ISO de la clase (para la hora). */
  sessionDate: string
  subjectCode: string
  subjectName: string
  professorName: string
  studentCode: string
  studentName: string
  status: RangeStatus
  statusLabel: string
  /** timestamptz ISO del registro de asistencia; null si no hay. */
  scannedAt: string | null
}

export interface RangeSubjectSummary {
  subjectCode: string
  subjectName: string
  professorName: string
  enrolled: number
  /** Clases dictadas y suspendidas dentro del rango. */
  sessionsHeld: number
  sessionsSuspended: number
  /** Asistencias (puntuales + tardes) sobre todas las parejas estudiante-clase dictada. */
  attendances: number
  late: number
  justified: number
  absent: number
  /** attendances / (attendances + justified + absent); null sin clases dictadas. */
  attendancePct: number | null
}

export interface RangeReport {
  from: string
  to: string
  detail: RangeDetailRow[]
  summary: RangeSubjectSummary[]
}

export interface RangeReportInput {
  subjects: ReportSubjectInput[]
  sessions: ReportSessionInput[]
  enrollments: ReportEnrollmentInput[]
  attendances: ReportAttendanceInput[]
  justifications: ReportJustificationInput[]
  held?: ReportHeldContext
  /** 'YYYY-MM-DD' inclusivos (días civiles de Bogotá). */
  from: string
  to: string
  /** Si el detalle supera esta cantidad de filas se aborta con RangeReportTooLargeError. */
  maxDetailRows?: number
}

/** El detalle excede `maxDetailRows`: se corta apenas se detecta, sin seguir armando filas. */
export class RangeReportTooLargeError extends Error {
  constructor() {
    super('El reporte por rango excede el máximo de filas.')
    this.name = 'RangeReportTooLargeError'
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function buildRangeReport(input: RangeReportInput): RangeReport {
  const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

  const attendanceByKey = new Map<string, ReportAttendanceInput>()
  for (const a of input.attendances) {
    const key = `${a.studentId}|${a.sessionId}`
    if (!attendanceByKey.has(key)) attendanceByKey.set(key, a)
  }
  const approved = new Set(
    input.justifications
      .filter((j) => j.status === 'APPROVED')
      .map((j) => `${j.studentId}|${j.sessionId}`)
  )

  const sessionsBySubject = new Map<string, ReportSessionInput[]>()
  for (const s of input.sessions) {
    const day = bogotaCalendarDate(new Date(s.date))
    if (day < input.from || day > input.to) continue
    const list = sessionsBySubject.get(s.subjectId)
    if (list) list.push(s)
    else sessionsBySubject.set(s.subjectId, [s])
  }
  const enrollmentsBySubject = new Map<string, ReportEnrollmentInput[]>()
  for (const e of input.enrollments) {
    const list = enrollmentsBySubject.get(e.subjectId)
    if (list) list.push(e)
    else enrollmentsBySubject.set(e.subjectId, [e])
  }

  const detail: RangeDetailRow[] = []
  const summary: RangeSubjectSummary[] = []

  for (const subject of input.subjects) {
    const sessions = (sessionsBySubject.get(subject.id) || []).sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
    )
    // Una materia sin clases en el rango no aporta nada al reporte.
    const relevant = sessions.filter((s) => !!s.suspendedAt || s.isActive !== false)
    if (relevant.length === 0) continue

    const enrolled = enrollmentsBySubject.get(subject.id) || []
    const professorName = subject.professorName || RANGE_NO_PROFESSOR_LABEL
    const counts = { attendances: 0, late: 0, justified: 0, absent: 0 }
    let sessionsHeld = 0
    let sessionsSuspended = 0

    for (const session of relevant) {
      const suspended = !!session.suspendedAt
      const ended =
        !input.held ||
        hasClassEnded(
          { date: session.date, class_ends_at: session.classEndsAt ?? null },
          input.held.defaultClassMinutes,
          input.held.now
        )
      // En curso solo cuenta como dictada si algún inscrito actual ya escaneó
      // (misma regla que el resumen por materia de attendanceReport: las
      // asistencias de quien ya no está inscrito no cuentan).
      const counted =
        !suspended &&
        (ended || enrolled.some((e) => attendanceByKey.has(`${e.studentId}|${session.id}`)))
      if (suspended) sessionsSuspended++
      else if (counted) sessionsHeld++

      const date = bogotaCalendarDate(new Date(session.date))
      const push = (
        enrollment: ReportEnrollmentInput,
        status: RangeStatus,
        scannedAt: string | null
      ) => {
        if (input.maxDetailRows !== undefined && detail.length >= input.maxDetailRows) {
          throw new RangeReportTooLargeError()
        }
        detail.push({
          date,
          sessionDate: session.date,
          subjectCode: subject.code,
          subjectName: subject.name,
          professorName,
          studentCode: enrollment.studentCode || 'N/A',
          studentName: enrollment.studentName || 'Desconocido',
          status,
          statusLabel: RANGE_STATUS_LABELS[status],
          scannedAt,
        })
      }

      for (const enrollment of enrolled) {
        if (suspended) {
          push(enrollment, 'SUSPENDED', null)
          continue
        }
        const key = `${enrollment.studentId}|${session.id}`
        const attendance = attendanceByKey.get(key)
        if (attendance) {
          counts.attendances++
          if (attendance.status === 'LATE') counts.late++
          push(enrollment, attendance.status, attendance.scannedAt ?? null)
        } else if (!ended) {
          // Clase en curso: solo cuenta para quien ya registró asistencia, así
          // que quien aún no escaneó no tiene falta todavía.
          continue
        } else if (approved.has(key)) {
          counts.justified++
          push(enrollment, 'JUSTIFIED', null)
        } else {
          counts.absent++
          push(enrollment, 'ABSENT', null)
        }
      }
    }

    const possible = counts.attendances + counts.justified + counts.absent
    summary.push({
      subjectCode: subject.code,
      subjectName: subject.name,
      professorName,
      enrolled: enrolled.length,
      sessionsHeld,
      sessionsSuspended,
      attendances: counts.attendances,
      late: counts.late,
      justified: counts.justified,
      absent: counts.absent,
      attendancePct: possible > 0 ? round1((counts.attendances / possible) * 100) : null,
    })
  }

  detail.sort(
    (a, b) =>
      a.sessionDate.localeCompare(b.sessionDate) ||
      collator.compare(a.subjectCode, b.subjectCode) ||
      collator.compare(a.studentName, b.studentName)
  )
  summary.sort((a, b) => collator.compare(a.subjectCode, b.subjectCode))

  return { from: input.from, to: input.to, detail, summary }
}
