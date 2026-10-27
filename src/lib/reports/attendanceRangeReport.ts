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
 *  - Una materia con cortes definidos trae además su desglose por corte: las
 *    clases del rango se reparten por el corte que contiene su día y cada corte
 *    se acota al rango (solo cuenta lo que cae dentro). Se listan los cortes
 *    que se cruzan con el rango, aunque queden con 0 clases; los que no se
 *    cruzan no aparecen. Las clases fuera de todo corte van a "Sin corte
 *    asignado". Sin cortes definidos solo hay cifra general.
 */
import { UNASSIGNED_CUT_NAME } from '@/lib/attendance/cutsBreakdown'
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
  /** Corte que contiene la clase; vacío si la materia no tiene cortes definidos. */
  cutName: string
}

/** Cifras de una materia dentro de un corte, acotadas al rango del reporte. */
export interface RangeCutSummary {
  /** null en el bucket "Sin corte asignado". */
  cutId: string | null
  name: string
  sequence: number | null
  /** Período de la materia, para distinguir cortes homónimos de períodos distintos. */
  periodName: string | null
  sessionsHeld: number
  sessionsSuspended: number
  attendances: number
  late: number
  justified: number
  absent: number
  /** Misma fórmula que el general; null sin clases dictadas en el corte. */
  attendancePct: number | null
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
  /** Desglose por corte dentro del rango; vacío si la materia no tiene cortes. */
  cuts: RangeCutSummary[]
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

type CutBucket = Omit<RangeCutSummary, 'attendancePct'>

function newBucket(
  cutId: string | null,
  name: string,
  sequence: number | null,
  periodName: string | null
): CutBucket {
  return {
    cutId,
    name,
    sequence,
    periodName,
    sessionsHeld: 0,
    sessionsSuspended: 0,
    attendances: 0,
    late: 0,
    justified: 0,
    absent: 0,
  }
}

function toCutSummary(bucket: CutBucket): RangeCutSummary {
  const possible = bucket.attendances + bucket.justified + bucket.absent
  return {
    ...bucket,
    attendancePct: possible > 0 ? round1((bucket.attendances / possible) * 100) : null,
  }
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

    // Cortes del rango: los que se cruzan con él, en orden. Una clase del
    // rango siempre cae en uno de ellos o fuera de todos (sin corte).
    const sortedCuts = [...subject.cuts].sort((a, b) => a.sequence - b.sequence)
    const buckets = new Map<string, CutBucket>()
    for (const cut of sortedCuts) {
      if (cut.startDate <= input.to && cut.endDate >= input.from) {
        buckets.set(cut.id, newBucket(cut.id, cut.name, cut.sequence, subject.periodName ?? null))
      }
    }
    let unassigned: CutBucket | null = null
    const bucketOf = (day: string): CutBucket | null => {
      if (sortedCuts.length === 0) return null
      const cut = sortedCuts.find((c) => day >= c.startDate && day <= c.endDate)
      if (cut) return buckets.get(cut.id) ?? null
      unassigned ??= newBucket(null, UNASSIGNED_CUT_NAME, null, subject.periodName ?? null)
      return unassigned
    }

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
      const date = bogotaCalendarDate(new Date(session.date))
      const bucket = bucketOf(date)
      if (suspended) {
        sessionsSuspended++
        if (bucket) bucket.sessionsSuspended++
      } else if (counted) {
        sessionsHeld++
        if (bucket) bucket.sessionsHeld++
      }

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
          cutName: bucket?.name ?? '',
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
          if (bucket) bucket.attendances++
          if (attendance.status === 'LATE') {
            counts.late++
            if (bucket) bucket.late++
          }
          push(enrollment, attendance.status, attendance.scannedAt ?? null)
        } else if (!ended) {
          // Clase en curso: solo cuenta para quien ya registró asistencia, así
          // que quien aún no escaneó no tiene falta todavía.
          continue
        } else if (approved.has(key)) {
          counts.justified++
          if (bucket) bucket.justified++
          push(enrollment, 'JUSTIFIED', null)
        } else {
          counts.absent++
          if (bucket) bucket.absent++
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
      cuts: [...buckets.values(), ...(unassigned ? [unassigned] : [])].map(toCutSummary),
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
