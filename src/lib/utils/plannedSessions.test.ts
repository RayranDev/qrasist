import { describe, it, expect } from 'vitest'
import { computePlannedSessions } from './plannedSessions'

describe('computePlannedSessions', () => {
  it('multiplies schedule blocks by whole weeks between period dates', () => {
    // Exactly 16 weeks apart, 2 weekly blocks.
    const result = computePlannedSessions(2, '2026-02-02', '2026-05-25')
    expect(result).toBe(32)
  })

  it('returns null when there are no schedule blocks', () => {
    expect(computePlannedSessions(0, '2026-02-02', '2026-05-25')).toBeNull()
  })

  it('returns null when the period has no start or end date', () => {
    expect(computePlannedSessions(2, null, '2026-05-25')).toBeNull()
    expect(computePlannedSessions(2, '2026-02-02', null)).toBeNull()
    expect(computePlannedSessions(2, undefined, undefined)).toBeNull()
  })

  it('returns null when the period end is not after the start', () => {
    expect(computePlannedSessions(2, '2026-05-25', '2026-02-02')).toBeNull()
    expect(computePlannedSessions(2, '2026-02-02', '2026-02-02')).toBeNull()
  })

  it('rounds to the nearest week and never returns less than 1 week', () => {
    // 10 days apart (~1.4 weeks) rounds to 1 week.
    expect(computePlannedSessions(1, '2026-02-02', '2026-02-12')).toBe(1)
  })
})
