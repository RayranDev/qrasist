import { describe, it, expect } from 'vitest'
import {
  bogotaMonthOf,
  buildMonthGrid,
  countClasses,
  dayBounds,
  formatMonthLabel,
  isCalendarClass,
  monthBounds,
  parseCivilDay,
  parseMonth,
  shiftMonth,
  summarizeDays,
} from './calendarGrid'

describe('parseMonth / parseCivilDay', () => {
  it('accepts well-formed values and rejects the rest', () => {
    expect(parseMonth('2026-10')).toBe('2026-10')
    expect(parseMonth('2026-13')).toBeNull()
    expect(parseMonth('2026-1')).toBeNull()
    expect(parseMonth(undefined)).toBeNull()
    expect(parseCivilDay('2026-10-27')).toBe('2026-10-27')
    expect(parseCivilDay('2026-02-31')).toBeNull()
    expect(parseCivilDay('27/10/2026')).toBeNull()
    expect(parseCivilDay('')).toBeNull()
  })

  it('only accepts years between 2000 and 2100', () => {
    for (const month of ['0050-05', '1999-12', '2101-01', '9999-12']) {
      expect(parseMonth(month), month).toBeNull()
    }
    for (const day of ['0050-05-01', '1999-12-31', '2101-01-01', '9999-12-31']) {
      expect(parseCivilDay(day), day).toBeNull()
    }
    expect(parseMonth('2000-01')).toBe('2000-01')
    expect(parseMonth('2100-12')).toBe('2100-12')
    expect(parseCivilDay('2100-12-31')).toBe('2100-12-31')
  })
})

describe('shiftMonth', () => {
  it('rolls over year boundaries in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', 0)).toBe('2026-10')
  })
})

describe('bogotaMonthOf', () => {
  it('uses the Bogota civil day, not the UTC one', () => {
    // 2026-11-01T03:00Z is still 31 October 22:00 in Bogota.
    expect(bogotaMonthOf(new Date('2026-11-01T03:00:00Z'))).toBe('2026-10')
    expect(bogotaMonthOf(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11')
  })
})

describe('monthBounds / dayBounds', () => {
  it('returns Bogota-aligned half-open ranges', () => {
    const b = monthBounds('2026-10')
    expect(b.firstDay).toBe('2026-10-01')
    expect(b.lastDay).toBe('2026-10-31')
    expect(b.startIso).toBe('2026-10-01T05:00:00.000Z')
    expect(b.endIso).toBe('2026-11-01T05:00:00.000Z')
  })

  it('handles February in leap and non-leap years', () => {
    expect(monthBounds('2028-02').lastDay).toBe('2028-02-29')
    expect(monthBounds('2027-02').lastDay).toBe('2027-02-28')
  })

  it('bounds a single civil day', () => {
    expect(dayBounds('2026-10-27')).toEqual({
      startIso: '2026-10-27T05:00:00.000Z',
      endIso: '2026-10-28T05:00:00.000Z',
    })
  })
})

describe('buildMonthGrid', () => {
  it('starts weeks on Monday and pads with days of adjacent months', () => {
    const weeks = buildMonthGrid('2026-10', '2026-10-27')
    expect(weeks).toHaveLength(5)
    for (const week of weeks) expect(week).toHaveLength(7)
    // 1 October 2026 is a Thursday -> 28, 29, 30 September lead the first row.
    expect(weeks[0].map((c) => c.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(weeks[0].map((c) => c.inMonth)).toEqual([false, false, false, true, true, true, true])
    expect(weeks[4][6]).toMatchObject({ date: '2026-11-01', inMonth: false })
  })

  it('marks only today', () => {
    const cells = buildMonthGrid('2026-10', '2026-10-27').flat()
    expect(cells.filter((c) => c.isToday).map((c) => c.date)).toEqual(['2026-10-27'])
    expect(
      buildMonthGrid('2026-10', '2026-11-05')
        .flat()
        .some((c) => c.isToday)
    ).toBe(false)
  })

  it('fits a month that starts on Monday and ends on Sunday in four rows', () => {
    const weeks = buildMonthGrid('2027-02', '2027-02-10')
    expect(weeks).toHaveLength(4)
    expect(weeks.flat().every((c) => c.inMonth)).toBe(true)
  })

  it('needs six rows when the month spans six calendar weeks', () => {
    // 1 August 2026 is a Saturday and 31 August a Monday.
    expect(buildMonthGrid('2026-08', '2026-08-01')).toHaveLength(6)
  })

  it('contains every day of the month exactly once', () => {
    const inMonth = buildMonthGrid('2028-02', '2028-02-01')
      .flat()
      .filter((c) => c.inMonth)
    expect(inMonth.map((c) => c.dayOfMonth)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1))
  })
})

describe('formatMonthLabel', () => {
  it('writes the month in Spanish', () => {
    expect(formatMonthLabel('2026-10')).toMatch(/octubre/i)
    expect(formatMonthLabel('2026-10')).toContain('2026')
  })
})

describe('summarizeDays', () => {
  it('groups by Bogota civil day and separates held from suspended', () => {
    const days = summarizeDays([
      // 27 Oct 21:00 Bogota = 28 Oct 02:00 UTC: must still land on the 27th.
      { date: '2026-10-28T02:00:00Z', isActive: true, suspendedAt: null },
      { date: '2026-10-27T13:00:00Z', isActive: true, suspendedAt: null },
      { date: '2026-10-27T15:00:00Z', isActive: false, suspendedAt: '2026-10-20T10:00:00Z' },
      { date: '2026-10-29T13:00:00Z', isActive: false, suspendedAt: null },
    ])
    expect(days.get('2026-10-27')).toEqual({ held: 2, suspended: 1 })
    // Archived (inactive, not suspended) sessions are not classes.
    expect(days.has('2026-10-29')).toBe(false)
  })
})

describe('isCalendarClass / countClasses', () => {
  const held = { isActive: true, suspendedAt: null }
  const suspended = { isActive: false, suspendedAt: '2026-10-01T10:00:00Z' }
  const archived = { isActive: false, suspendedAt: null }

  it('treats held and suspended sessions as classes and archived ones as nothing', () => {
    expect(isCalendarClass(held)).toBe(true)
    expect(isCalendarClass({ isActive: null, suspendedAt: null })).toBe(true)
    expect(isCalendarClass(suspended)).toBe(true)
    expect(isCalendarClass(archived)).toBe(false)
  })

  it('drops every session of an archived subject, suspended or not', () => {
    expect(isCalendarClass({ ...held, subjectActive: false })).toBe(false)
    expect(isCalendarClass({ ...suspended, subjectActive: false })).toBe(false)
    expect(isCalendarClass({ ...held, subjectActive: true })).toBe(true)
  })

  it('counts held and suspended separately; total classes = held + suspended', () => {
    expect(countClasses([held, held, suspended, archived])).toEqual({ held: 2, suspended: 1 })
    expect(countClasses([archived, archived])).toEqual({ held: 0, suspended: 0 })
    expect(countClasses([{ ...held, subjectActive: false }, suspended])).toEqual({
      held: 0,
      suspended: 1,
    })
  })

  it('gives the cell, month and day panel the same numbers', () => {
    const sessions = [
      { date: '2026-10-05T13:00:00Z', ...held },
      { date: '2026-10-05T15:00:00Z', ...suspended },
      { date: '2026-10-05T17:00:00Z', ...archived },
      { date: '2026-10-05T19:00:00Z', ...held, subjectActive: false },
      { date: '2026-10-06T13:00:00Z', ...archived },
    ]
    const days = summarizeDays(sessions)
    // The panel counts the same sessions of that day with the same rule.
    expect(days.get('2026-10-05')).toEqual(countClasses(sessions.slice(0, 4)))
    expect(days.get('2026-10-05')).toEqual({ held: 1, suspended: 1 })
    // An archived-only day has no cell data at all.
    expect(days.has('2026-10-06')).toBe(false)
  })
})
