import { describe, it, expect } from 'vitest'
import { computeAttendanceSummary } from './attendancePolicy'

describe('computeAttendanceSummary', () => {
  it('should calculate correct summary for normal attendance in percentage mode', () => {
    // 16 total planned, 20% max = 3 allowed absences.
    // 5 sessions held, 5 attended, 0 absences.
    const res = computeAttendanceSummary(5, 5, {
      ruleType: 'PERCENTAGE',
      maxPercentage: 20,
      totalPlannedSessions: 16,
    })

    expect(res.sessionsHeld).toBe(5)
    expect(res.attendancesCount).toBe(5)
    expect(res.absencesCount).toBe(0)
    expect(res.absencePercentage).toBe(0)
    expect(res.maxAbsencesAllowed).toBe(3)
    expect(res.remainingAbsences).toBe(3)
    expect(res.status).toBe('NORMAL')
  })

  it('should trigger WARNING when student has only 1 absence left', () => {
    // 16 planned, 20% = 3 max absences allowed.
    // 8 sessions held, 6 attended = 2 absences.
    const res = computeAttendanceSummary(8, 6, {
      ruleType: 'PERCENTAGE',
      maxPercentage: 20,
      totalPlannedSessions: 16,
    })

    expect(res.absencesCount).toBe(2)
    expect(res.remainingAbsences).toBe(1)
    expect(res.status).toBe('WARNING')
  })

  it('should trigger FAILED_ATTENDANCE when absences exceed limit in fixed count mode', () => {
    // FIXED_COUNT with max 2 absences.
    // 4 sessions held, 1 attended = 3 absences.
    const res = computeAttendanceSummary(4, 1, {
      ruleType: 'FIXED_COUNT',
      maxCount: 2,
    })

    expect(res.absencesCount).toBe(3)
    expect(res.maxAbsencesAllowed).toBe(2)
    expect(res.status).toBe('FAILED_ATTENDANCE')
  })
})
