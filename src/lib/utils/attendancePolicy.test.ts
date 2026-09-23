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

  describe('late-to-absence conversion (lates_per_absence)', () => {
    it('adds no penalty when latesPerAbsence is not configured (NULL)', () => {
      // 10 sessions held, 10 attended (0 real absences), but 5 of those
      // were LATE. Without latesPerAbsence configured, lates never
      // convert into an absence.
      const res = computeAttendanceSummary(10, 10, { latesPerAbsence: null }, 5)

      expect(res.absencesCount).toBe(0)
      expect(res.lateCount).toBe(5)
      expect(res.status).toBe('NORMAL')
    })

    it('never counts more lates than registered attendances', () => {
      // 4 sessions held, 1 attended, but a stale caller reports 8 lates.
      // Absences must stay capped at the sessions actually held.
      const res = computeAttendanceSummary(4, 1, { latesPerAbsence: 1 }, 8)

      expect(res.lateCount).toBe(1)
      expect(res.absencesCount).toBe(4)
      expect(res.absencePercentage).toBe(100)
    })

    it('converts every N lates into one extra absence', () => {
      // 10 sessions held, 10 attended, 6 lates, 3 lates = 1 absence.
      // Expected: floor(6/3) = 2 extra absences on top of 0 real ones.
      const res = computeAttendanceSummary(
        10,
        10,
        { ruleType: 'PERCENTAGE', maxPercentage: 20, totalPlannedSessions: 16, latesPerAbsence: 3 },
        6
      )

      expect(res.lateCount).toBe(6)
      expect(res.absencesCount).toBe(2)
    })

    it('floors partial late groups instead of rounding up', () => {
      // 8 lates, 3 lates = 1 absence -> floor(8/3) = 2, not 3.
      const res = computeAttendanceSummary(10, 10, { latesPerAbsence: 3 }, 8)

      expect(res.absencesCount).toBe(2)
    })

    it('adds the late penalty on top of real absences and can trigger FAILED_ATTENDANCE', () => {
      // FIXED_COUNT max 2. 8 sessions held, 7 attended = 1 real absence.
      // 6 lates with latesPerAbsence 3 -> +2 penalty absences = 3 total,
      // which exceeds the max of 2.
      const res = computeAttendanceSummary(
        8,
        7,
        { ruleType: 'FIXED_COUNT', maxCount: 2, latesPerAbsence: 3 },
        6
      )

      expect(res.absencesCount).toBe(3)
      expect(res.status).toBe('FAILED_ATTENDANCE')
    })

    it('defaults lateCount to 0 when not provided', () => {
      const res = computeAttendanceSummary(5, 5, { latesPerAbsence: 2 })

      expect(res.lateCount).toBe(0)
      expect(res.absencesCount).toBe(0)
    })
  })
})
