import { describe, it, expect } from 'vitest'
import {
  computeStudentSubjectRisks,
  filterAtRiskSubjects,
  formatSubjectStatusLine,
  type EnrolledSubjectCounts,
} from './studentSummaries'

function baseRow(overrides: Partial<EnrolledSubjectCounts> = {}): EnrolledSubjectCounts {
  return {
    subjectId: 'subj-1',
    subjectCode: 'MAT101',
    subjectName: 'Cálculo I',
    policy: { ruleType: 'PERCENTAGE', maxPercentage: 20, totalPlannedSessions: 16 },
    sessionsHeld: 10,
    attendancesCount: 10,
    lateCount: 0,
    justifiedCount: 0,
    ...overrides,
  }
}

describe('computeStudentSubjectRisks', () => {
  it('marks a subject with perfect attendance as NORMAL', () => {
    const [risk] = computeStudentSubjectRisks([baseRow()])
    expect(risk.summary.status).toBe('NORMAL')
    expect(risk.subjectId).toBe('subj-1')
  })

  it('marks a subject near the absence limit as WARNING', () => {
    // maxAbsencesAllowed = floor(16 * 20 / 100) = 3
    const rows = [baseRow({ sessionsHeld: 10, attendancesCount: 8 })] // 2 absences, remaining 1
    const [risk] = computeStudentSubjectRisks(rows)
    expect(risk.summary.status).toBe('WARNING')
    expect(risk.summary.remainingAbsences).toBe(1)
  })

  it('marks a subject past the absence limit as FAILED_ATTENDANCE', () => {
    const rows = [baseRow({ sessionsHeld: 10, attendancesCount: 5 })] // 5 absences > 3 allowed
    const [risk] = computeStudentSubjectRisks(rows)
    expect(risk.summary.status).toBe('FAILED_ATTENDANCE')
  })

  it('maps multiple rows independently, preserving subject identity', () => {
    const rows = [
      baseRow({ subjectId: 'a', sessionsHeld: 10, attendancesCount: 10 }),
      baseRow({ subjectId: 'b', sessionsHeld: 10, attendancesCount: 5 }),
    ]
    const risks = computeStudentSubjectRisks(rows)
    expect(risks.map((r) => r.subjectId)).toEqual(['a', 'b'])
    expect(risks[0].summary.status).toBe('NORMAL')
    expect(risks[1].summary.status).toBe('FAILED_ATTENDANCE')
  })
})

describe('filterAtRiskSubjects', () => {
  it('keeps only WARNING and FAILED_ATTENDANCE subjects', () => {
    const rows = [
      baseRow({ subjectId: 'normal', sessionsHeld: 10, attendancesCount: 10 }),
      baseRow({ subjectId: 'warning', sessionsHeld: 10, attendancesCount: 8 }),
      baseRow({ subjectId: 'failed', sessionsHeld: 10, attendancesCount: 5 }),
    ]
    const risks = computeStudentSubjectRisks(rows)
    const atRisk = filterAtRiskSubjects(risks)
    expect(atRisk.map((r) => r.subjectId).sort()).toEqual(['failed', 'warning'])
  })

  it('returns an empty array when nothing is at risk', () => {
    const risks = computeStudentSubjectRisks([baseRow()])
    expect(filterAtRiskSubjects(risks)).toEqual([])
  })
})

describe('formatSubjectStatusLine', () => {
  it('shows only the absences segment when nothing else applies', () => {
    const [risk] = computeStudentSubjectRisks([baseRow({ sessionsHeld: 5, attendancesCount: 5 })])
    expect(formatSubjectStatusLine(risk.summary)).toBe('0 faltas de 3 permitidas')
  })

  it('adds justified and late segments only when present', () => {
    const [risk] = computeStudentSubjectRisks([
      baseRow({ sessionsHeld: 10, attendancesCount: 7, lateCount: 2, justifiedCount: 1 }),
    ])
    // 3 real absences - 1 justified = 2 counted absences
    expect(formatSubjectStatusLine(risk.summary)).toBe(
      '2 faltas de 3 permitidas · 1 justificada · 2 tardes'
    )
  })

  it('uses singular wording for a count of exactly 1', () => {
    const [risk] = computeStudentSubjectRisks([
      baseRow({ sessionsHeld: 10, attendancesCount: 9, lateCount: 1, justifiedCount: 1 }),
    ])
    expect(formatSubjectStatusLine(risk.summary)).toBe(
      '0 faltas de 3 permitidas · 1 justificada · 1 tarde'
    )
  })
})
