import { computeAttendanceSummary, type AbsencePolicyConfig } from '@/lib/utils/attendancePolicy'

export interface PeriodReportSubjectInput {
  subjectId: string
  subjectCode: string
  subjectName: string
  professorName: string
  careerNames: string[]
  policy: AbsencePolicyConfig
  sessionsHeld: number
}

export interface PeriodReportEnrollmentInput {
  subjectId: string
  studentId: string
  studentCode: string
  studentName: string
  attendancesCount: number
  lateCount: number
  justifiedCount: number
}

export interface PeriodReportDetailRow {
  career: string
  subjectCode: string
  subjectName: string
  professorName: string
  studentCode: string
  studentName: string
  sessionsHeld: number
  present: number
  late: number
  justified: number
  countedAbsences: number
  absencePercentage: number
  status: string
}

export interface PeriodReportSubjectSummaryRow {
  subjectCode: string
  subjectName: string
  enrolled: number
  avgAttendancePercentage: number
  atRiskCount: number
}

export interface PeriodReportResult {
  detailRows: PeriodReportDetailRow[]
  summaryRows: PeriodReportSubjectSummaryRow[]
}

const STATUS_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  WARNING: 'En riesgo',
  FAILED_ATTENDANCE: 'Perdida por fallas',
}

/**
 * Pura: arma las dos hojas del reporte de período (detalle por
 * estudiante-materia y resumen por materia) a partir de listas ya
 * aplanadas. Separada de las consultas para poder testear las reglas
 * del reporte (qué cuenta como "en riesgo", cómo se promedia
 * asistencia) sin tocar la base de datos.
 */
export function buildPeriodAttendanceReport(
  subjects: PeriodReportSubjectInput[],
  enrollments: PeriodReportEnrollmentInput[]
): PeriodReportResult {
  const enrollmentsBySubject = new Map<string, PeriodReportEnrollmentInput[]>()
  for (const e of enrollments) {
    const list = enrollmentsBySubject.get(e.subjectId) || []
    list.push(e)
    enrollmentsBySubject.set(e.subjectId, list)
  }

  const detailRows: PeriodReportDetailRow[] = []
  const summaryRows: PeriodReportSubjectSummaryRow[] = []

  for (const subject of subjects) {
    const career = subject.careerNames.length > 0 ? subject.careerNames.join(' / ') : 'Sin carrera'
    const subjectEnrollments = enrollmentsBySubject.get(subject.subjectId) || []

    let attendancePercentageSum = 0
    let atRiskCount = 0

    for (const e of subjectEnrollments) {
      const summary = computeAttendanceSummary(
        subject.sessionsHeld,
        e.attendancesCount,
        subject.policy,
        e.lateCount,
        e.justifiedCount
      )

      if (summary.status !== 'NORMAL') atRiskCount++
      const attendancePercentage =
        subject.sessionsHeld > 0
          ? Math.round(
              ((subject.sessionsHeld - summary.absencesCount) / subject.sessionsHeld) * 1000
            ) / 10
          : 0
      attendancePercentageSum += attendancePercentage

      detailRows.push({
        career,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        professorName: subject.professorName,
        studentCode: e.studentCode,
        studentName: e.studentName,
        sessionsHeld: subject.sessionsHeld,
        present: summary.attendancesCount,
        late: summary.lateCount,
        justified: summary.justifiedCount,
        countedAbsences: summary.absencesCount,
        absencePercentage: summary.absencePercentage,
        status: STATUS_LABELS[summary.status] || summary.status,
      })
    }

    summaryRows.push({
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      enrolled: subjectEnrollments.length,
      avgAttendancePercentage:
        subjectEnrollments.length > 0
          ? Math.round((attendancePercentageSum / subjectEnrollments.length) * 10) / 10
          : 0,
      atRiskCount,
    })
  }

  return { detailRows, summaryRows }
}
