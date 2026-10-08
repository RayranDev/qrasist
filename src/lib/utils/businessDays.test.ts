import { describe, it, expect } from 'vitest'
import { addBusinessDaysBogota, bogotaCalendarDate, endOfBogotaDay } from './businessDays'

describe('bogotaCalendarDate', () => {
  it('uses the Bogota day, not the UTC day', () => {
    // 22:00 Thursday in Bogota is already Friday in UTC.
    expect(bogotaCalendarDate(new Date('2026-03-20T03:00:00Z'))).toBe('2026-03-19')
    expect(bogotaCalendarDate(new Date('2026-03-20T05:00:00Z'))).toBe('2026-03-20')
  })
})

describe('addBusinessDaysBogota', () => {
  it('counts three plain weekdays', () => {
    // Monday 2 Mar 2026 -> Tue, Wed, Thu
    expect(addBusinessDaysBogota(new Date('2026-03-02T15:00:00Z'), 3)).toBe('2026-03-05')
  })

  it('skips a weekend', () => {
    // Thursday 26 Feb 2026 -> Fri 27, Mon 2, Tue 3
    expect(addBusinessDaysBogota(new Date('2026-02-26T15:00:00Z'), 3)).toBe('2026-03-03')
  })

  it('skips a weekend AND the Monday holiday that follows it', () => {
    // Thursday 19 Mar 2026 -> Fri 20 (1), [Sat, Sun, Mon 23 San José], Tue 24 (2), Wed 25 (3)
    expect(addBusinessDaysBogota(new Date('2026-03-19T15:00:00Z'), 3)).toBe('2026-03-25')
  })

  it('starts counting on the next business day when the session was on a Saturday', () => {
    // Saturday 21 Mar 2026 -> [Sun, Mon 23 holiday], Tue 24 (1), Wed 25 (2), Thu 26 (3)
    expect(addBusinessDaysBogota(new Date('2026-03-21T15:00:00Z'), 3)).toBe('2026-03-26')
  })

  it('skips Holy Thursday and Good Friday', () => {
    // Wednesday 1 Apr 2026 -> [Thu 2, Fri 3 holy days, weekend], Mon 6 (1), Tue 7 (2), Wed 8 (3)
    expect(addBusinessDaysBogota(new Date('2026-04-01T15:00:00Z'), 3)).toBe('2026-04-08')
  })

  it('crosses the new year, skipping January 1', () => {
    // Tuesday 29 Dec 2026 -> Wed 30 (1), Thu 31 (2), [Fri 1 Jan holiday, weekend], Mon 4 Jan (3)
    expect(addBusinessDaysBogota(new Date('2026-12-29T15:00:00Z'), 3)).toBe('2027-01-04')
  })

  it('anchors on the Bogota calendar day of the session', () => {
    // Thursday 19 Mar 2026, 22:00 in Bogota (= Friday 03:00Z) behaves like Thursday.
    expect(addBusinessDaysBogota(new Date('2026-03-20T03:00:00Z'), 3)).toBe('2026-03-25')
  })

  it('returns the same day for zero business days', () => {
    expect(addBusinessDaysBogota(new Date('2026-03-02T15:00:00Z'), 0)).toBe('2026-03-02')
  })
})

describe('endOfBogotaDay', () => {
  it('is 23:59:59.999 in Bogota', () => {
    expect(endOfBogotaDay('2026-03-25').toISOString()).toBe('2026-03-26T04:59:59.999Z')
  })
})
