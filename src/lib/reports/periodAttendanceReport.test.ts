import { describe, it, expect } from 'vitest'
import {
  buildPeriodAttendanceReport,
  type PeriodReportSubjectInput,
  type PeriodReportEnrollmentInput,
} from './periodAttendanceReport'

function subject(overrides: Partial<PeriodReportSubjectInput> = {}): PeriodReportSubjectInput {
  return {
    subjectId: 'subj-1',
    subjectCode: 'MAT101',
    subjectName: 'Cálculo I',
    professorName: 'Ana Gómez',
    careerNames: ['Ingeniería de Sistemas'],
    policy: { ruleType: 'PERCENTAGE', maxPercentage: 20, totalPlannedSessions: 16 },
    sessionsHeld: 10,
    ...overrides,
  }
}

function enrollment(
  overrides: Partial<PeriodReportEnrollmentInput> = {}
): PeriodReportEnrollmentInput {
  return {
    subjectId: 'subj-1',
    studentId: 'stu-1',
    studentCode: '123456789012',
    studentName: 'Juan Pérez',
    attendancesCount: 10,
    lateCount: 0,
    justifiedCount: 0,
    ...overrides,
  }
}

describe('buildPeriodAttendanceReport', () => {
  it('produces one detail row per (student, subject) with the right career label', () => {
    const { detailRows } = buildPeriodAttendanceReport([subject()], [enrollment()])
    expect(detailRows).toHaveLength(1)
    expect(detailRows[0]).toMatchObject({
      career: 'Ingeniería de Sistemas',
      subjectCode: 'MAT101',
      studentCode: '123456789012',
      status: 'Normal',
    })
  })

  it('joins multiple careers with " / " when a subject is shared', () => {
    const { detailRows } = buildPeriodAttendanceReport(
      [subject({ careerNames: ['Sistemas', 'Industrial'] })],
      [enrollment()]
    )
    expect(detailRows[0].career).toBe('Sistemas / Industrial')
  })

  it('falls back to a placeholder career label when a subject has none', () => {
    const { detailRows } = buildPeriodAttendanceReport(
      [subject({ careerNames: [] })],
      [enrollment()]
    )
    expect(detailRows[0].career).toBe('Sin carrera')
  })

  it('labels a student past the limit as "Perdida por fallas" and counts them at-risk', () => {
    const { detailRows, summaryRows } = buildPeriodAttendanceReport(
      [subject()],
      [enrollment({ attendancesCount: 5 })] // 5 absences of 10 sessions > 3 allowed
    )
    expect(detailRows[0].status).toBe('Perdida por fallas')
    expect(summaryRows[0].atRiskCount).toBe(1)
  })

  it('labels a student near the limit as "En riesgo"', () => {
    const { detailRows, summaryRows } = buildPeriodAttendanceReport(
      [subject()],
      [enrollment({ attendancesCount: 8 })] // 2 absences, remaining 1
    )
    expect(detailRows[0].status).toBe('En riesgo')
    expect(summaryRows[0].atRiskCount).toBe(1)
  })

  it('computes the subject summary: enrolled count and average attendance %', () => {
    const { summaryRows } = buildPeriodAttendanceReport(
      [subject()],
      [
        enrollment({ studentId: 'a', attendancesCount: 10 }), // 100% attendance
        enrollment({ studentId: 'b', attendancesCount: 0 }), // 0% attendance
      ]
    )
    expect(summaryRows[0].enrolled).toBe(2)
    expect(summaryRows[0].avgAttendancePercentage).toBe(50)
  })

  it('includes subjects with zero enrollments in the summary sheet', () => {
    const { detailRows, summaryRows } = buildPeriodAttendanceReport([subject()], [])
    expect(detailRows).toHaveLength(0)
    expect(summaryRows).toHaveLength(1)
    expect(summaryRows[0]).toMatchObject({
      enrolled: 0,
      avgAttendancePercentage: 0,
      atRiskCount: 0,
    })
  })

  it('keeps subjects and their enrollments correctly grouped when multiple subjects are present', () => {
    const subjects = [
      subject({ subjectId: 'a', subjectCode: 'A' }),
      subject({ subjectId: 'b', subjectCode: 'B' }),
    ]
    const enrollments = [
      enrollment({ subjectId: 'a', studentId: 's1' }),
      enrollment({ subjectId: 'b', studentId: 's2', attendancesCount: 5 }),
    ]
    const { detailRows, summaryRows } = buildPeriodAttendanceReport(subjects, enrollments)
    expect(detailRows).toHaveLength(2)
    expect(detailRows.find((r) => r.subjectCode === 'A')?.status).toBe('Normal')
    expect(detailRows.find((r) => r.subjectCode === 'B')?.status).toBe('Perdida por fallas')
    expect(summaryRows).toHaveLength(2)
  })
})
