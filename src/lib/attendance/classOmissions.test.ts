import { describe, it, expect } from 'vitest'
import {
  findClassOmissions,
  formatBlockTime,
  listExpectedClassDays,
  summarizeClassStats,
  type OmissionScheduleBlock,
} from './classOmissions'

// Period 2026-02-02 (Mon) .. 2026-06-05 (Fri). Mondays 08:00-10:00 Bogota.
// Holidays that matter here: 2026-03-23 (San José, moved to Monday),
// 2026-04-02/03 (Holy Thursday/Friday), 2026-05-01.
const period = { start_date: '2026-02-02', end_date: '2026-06-05' }

function mondayBlock(overrides: Partial<OmissionScheduleBlock> = {}): OmissionScheduleBlock {
  return {
    id: 'block-mon',
    day_of_week: 1,
    start_time: '08:00:00',
    end_time: '10:00:00',
    created_at: '2026-01-15T15:00:00Z',
    ...overrides,
  }
}

/** Instant for a Bogota wall-clock time (UTC-5). */
function bogota(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-05:00`)
}

function datesOf(days: { date: string }[]) {
  return days.map((d) => d.date)
}

describe('listExpectedClassDays', () => {
  it('returns nothing without blocks, period or period dates', () => {
    const now = bogota('2026-03-04', '12:00')
    expect(listExpectedClassDays({ blocks: [], period, now })).toEqual([])
    expect(listExpectedClassDays({ blocks: [mondayBlock()], period: null, now })).toEqual([])
    expect(
      listExpectedClassDays({
        blocks: [mondayBlock()],
        period: { start_date: null, end_date: null },
        now,
      })
    ).toEqual([])
  })

  it('lists the due scheduled days from the period start up to yesterday', () => {
    const days = listExpectedClassDays({
      blocks: [mondayBlock()],
      period,
      now: bogota('2026-03-04', '12:00'), // Wednesday
    })

    expect(datesOf(days)).toEqual([
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
      '2026-03-02',
    ])
    expect(days[0]).toMatchObject({
      scheduleId: 'block-mon',
      startTime: '08:00:00',
      endTime: '10:00:00',
    })
  })

  it('does not accuse anyone before the period starts or after it ends', () => {
    expect(
      listExpectedClassDays({
        blocks: [mondayBlock()],
        period,
        now: bogota('2026-01-26', '12:00'),
      })
    ).toEqual([])

    const afterEnd = listExpectedClassDays({
      blocks: [mondayBlock()],
      period: { start_date: '2026-02-02', end_date: '2026-02-12' },
      now: bogota('2026-09-01', '12:00'),
    })
    expect(datesOf(afterEnd)).toEqual(['2026-02-02', '2026-02-09'])
  })

  it('includes today only once the block has ended', () => {
    const during = listExpectedClassDays({
      blocks: [mondayBlock()],
      period,
      now: bogota('2026-03-02', '09:00'), // Monday, class still running
    })
    expect(datesOf(during)).not.toContain('2026-03-02')

    const after = listExpectedClassDays({
      blocks: [mondayBlock()],
      period,
      now: bogota('2026-03-02', '10:01'),
    })
    expect(datesOf(after)).toContain('2026-03-02')
  })

  it('skips Colombian holidays', () => {
    const days = listExpectedClassDays({
      blocks: [mondayBlock()],
      period,
      now: bogota('2026-03-31', '12:00'),
    })

    expect(datesOf(days)).toContain('2026-03-16')
    expect(datesOf(days)).not.toContain('2026-03-23') // San José, moved to Monday
    expect(datesOf(days)).toContain('2026-03-30')

    const fridays = listExpectedClassDays({
      blocks: [mondayBlock({ day_of_week: 5 })],
      period,
      now: bogota('2026-05-08', '12:00'),
    })
    expect(datesOf(fridays)).not.toContain('2026-04-03') // Good Friday
    expect(datesOf(fridays)).not.toContain('2026-05-01') // Labour Day
    expect(datesOf(fridays)).toContain('2026-04-10')
  })

  it('ignores weeks before a block existed (block created mid-period)', () => {
    const days = listExpectedClassDays({
      blocks: [mondayBlock({ created_at: bogota('2026-02-20', '11:00').toISOString() })],
      period,
      now: bogota('2026-03-04', '12:00'),
    })

    expect(datesOf(days)).toEqual(['2026-02-23', '2026-03-02'])
  })

  it('does not flag the day a block was created after that class had already ended', () => {
    const createdAfterClass = listExpectedClassDays({
      blocks: [mondayBlock({ created_at: bogota('2026-03-02', '12:00').toISOString() })],
      period,
      now: bogota('2026-03-04', '12:00'),
    })
    expect(createdAfterClass).toEqual([])

    // Created while the class was running (08:00-10:00): it did not exist
    // when the class started, so nobody was expected to register it.
    const createdMidClass = listExpectedClassDays({
      blocks: [mondayBlock({ created_at: bogota('2026-03-02', '09:00').toISOString() })],
      period,
      now: bogota('2026-03-04', '12:00'),
    })
    expect(createdMidClass).toEqual([])

    const createdBeforeClass = listExpectedClassDays({
      blocks: [mondayBlock({ created_at: bogota('2026-03-02', '07:00').toISOString() })],
      period,
      now: bogota('2026-03-04', '12:00'),
    })
    expect(datesOf(createdBeforeClass)).toEqual(['2026-03-02'])
  })

  it('merges several blocks of one day into one expected class', () => {
    const blocks = [
      mondayBlock({ id: 'afternoon', start_time: '14:00', end_time: '16:00' }),
      mondayBlock({ id: 'morning', start_time: '08:00', end_time: '10:00' }),
    ]

    // Between the two blocks the day is not due yet.
    const midday = listExpectedClassDays({
      blocks,
      period,
      now: bogota('2026-03-02', '12:00'),
    })
    expect(datesOf(midday)).not.toContain('2026-03-02')

    const evening = listExpectedClassDays({
      blocks,
      period,
      now: bogota('2026-03-02', '17:00'),
    })
    const last = evening[evening.length - 1]
    expect(last).toMatchObject({
      date: '2026-03-02',
      scheduleId: 'morning',
      startTime: '08:00',
      endTime: '16:00',
    })
  })

  it('clips the range with from/to', () => {
    const days = listExpectedClassDays({
      blocks: [mondayBlock()],
      period,
      now: bogota('2026-03-04', '12:00'),
      from: '2026-02-10',
      to: '2026-02-23',
    })

    expect(datesOf(days)).toEqual(['2026-02-16', '2026-02-23'])
  })

  it('ignores blocks with unparseable times instead of crashing', () => {
    const days = listExpectedClassDays({
      blocks: [mondayBlock({ start_time: 'abc' })],
      period,
      now: bogota('2026-03-04', '12:00'),
    })
    expect(days).toEqual([])
  })
})

describe('findClassOmissions', () => {
  const base = {
    subjectId: 'subject-1',
    blocks: [mondayBlock()],
    period,
    now: bogota('2026-03-04', '12:00'),
  }

  it('flags every expected day that has no session at all', () => {
    const omissions = findClassOmissions({ ...base, sessions: [] })

    expect(datesOf(omissions)).toEqual([
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
      '2026-03-02',
    ])
    expect(omissions.every((o) => o.subjectId === 'subject-1' && !o.justified)).toBe(true)
  })

  it('treats a held, an archived and a suspended session as covering the day', () => {
    const omissions = findClassOmissions({
      ...base,
      sessions: [
        { date: bogota('2026-02-02', '08:05').toISOString() }, // normal
        { date: bogota('2026-02-09', '08:05').toISOString() }, // archived (is_active=false)
        { date: bogota('2026-02-16', '08:00').toISOString() }, // suspended placeholder
      ],
    })

    expect(datesOf(omissions)).toEqual(['2026-02-23', '2026-03-02'])
  })

  it('counts a makeup class on that day, even outside the scheduled hours', () => {
    const omissions = findClassOmissions({
      ...base,
      sessions: [{ date: bogota('2026-02-23', '18:30').toISOString() }],
    })

    expect(datesOf(omissions)).not.toContain('2026-02-23')
  })

  it('matches sessions by their Bogota day, not their UTC day', () => {
    // Monday 23:30 Bogota is Tuesday 04:30 UTC: still covers Monday.
    const lateEvening = findClassOmissions({
      ...base,
      sessions: [{ date: bogota('2026-03-02', '23:30').toISOString() }],
    })
    expect(datesOf(lateEvening)).not.toContain('2026-03-02')

    // Sunday 19:30 Bogota is Monday 00:30 UTC: does NOT cover Monday.
    const sundayNight = findClassOmissions({
      ...base,
      sessions: [{ date: bogota('2026-03-01', '19:30').toISOString() }],
    })
    expect(datesOf(sundayNight)).toContain('2026-03-02')
  })

  it('marks justified omissions with their reason', () => {
    const omissions = findClassOmissions({
      ...base,
      sessions: [],
      justifications: [{ class_date: '2026-02-16', reason: 'Cita médica urgente' }],
    })

    const justified = omissions.filter((o) => o.justified)
    expect(justified).toHaveLength(1)
    expect(justified[0]).toMatchObject({ date: '2026-02-16', reason: 'Cita médica urgente' })
    expect(omissions.filter((o) => !o.justified)).toHaveLength(4)
  })

  it("computes from the period dates alone (period activity is the caller's call)", () => {
    // An inactive period still has dates: omissions are computed for it.
    const omissions = findClassOmissions({
      ...base,
      period: { ...period },
      sessions: [],
    })
    expect(omissions.length).toBeGreaterThan(0)
  })

  it('returns an empty list when the subject has no period', () => {
    expect(findClassOmissions({ ...base, period: null, sessions: [] })).toEqual([])
  })
})

describe('summarizeClassStats', () => {
  it('splits scheduled, held, suspended and omitted classes for a range', () => {
    const stats = summarizeClassStats({
      subjectId: 'subject-1',
      blocks: [mondayBlock()],
      period,
      now: bogota('2026-03-04', '12:00'),
      from: '2026-02-01',
      to: '2026-03-04',
      sessions: [
        { date: bogota('2026-02-02', '08:05').toISOString(), is_active: true, suspended_at: null },
        { date: bogota('2026-02-09', '08:05').toISOString(), is_active: false, suspended_at: null },
        {
          date: bogota('2026-02-16', '08:00').toISOString(),
          is_active: false,
          suspended_at: '2026-02-16T12:00:00Z',
        },
        // makeup outside the schedule: held, but not a scheduled day
        { date: bogota('2026-02-27', '18:00').toISOString(), is_active: true, suspended_at: null },
        // outside the requested range
        { date: bogota('2026-03-20', '08:00').toISOString(), is_active: true, suspended_at: null },
      ],
      justifications: [{ class_date: '2026-02-23', reason: 'Cita médica urgente' }],
    })

    expect(stats).toEqual({
      scheduled: 5,
      held: 2, // Feb 2 + the makeup; the archived one does not count
      suspended: 1,
      omitted: 2, // Feb 23 (justified) and Mar 2; the archived/suspended days are covered
      omittedJustified: 1,
    })
  })
})

describe('formatBlockTime', () => {
  it('drops the seconds', () => {
    expect(formatBlockTime('08:00:00')).toBe('08:00')
    expect(formatBlockTime('14:30')).toBe('14:30')
  })
})
