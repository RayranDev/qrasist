import { describe, it, expect } from 'vitest'
import { buildStudentCutBreakdown, formatCutLine, formatPercent, usableCuts } from './cutsView'

const rows = [
  { id: 'c2', name: 'Corte 2', start_date: '2026-03-16', end_date: '2026-04-30', sequence: 2 },
  { id: 'c1', name: 'Corte 1', start_date: '2026-02-01', end_date: '2026-03-15', sequence: 1 },
]

describe('usableCuts', () => {
  it('maps rows and keeps the cuts of a period without dates', () => {
    const cuts = usableCuts({ start_date: null, end_date: null }, rows)
    expect(cuts.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(cuts[0]).toMatchObject({ startDate: '2026-03-16', endDate: '2026-04-30' })
  })

  it('returns nothing for a period with inverted dates (production data)', () => {
    expect(usableCuts({ start_date: '2026-08-30', end_date: '2026-06-02' }, rows)).toEqual([])
  })

  it('drops cuts with an inverted range and tolerates null input', () => {
    const bad = {
      id: 'x',
      name: 'X',
      start_date: '2026-05-01',
      end_date: '2026-04-01',
      sequence: 3,
    }
    expect(usableCuts(null, [bad])).toEqual([])
    expect(usableCuts(null, null)).toEqual([])
    expect(usableCuts(undefined, undefined)).toEqual([])
  })
})

describe('buildStudentCutBreakdown', () => {
  const cuts = usableCuts(null, rows)

  it('is empty when the period has no cuts (section hidden)', () => {
    expect(
      buildStudentCutBreakdown({
        cuts: [],
        sessions: [{ id: 's1', date: '2026-02-10T15:00:00Z', is_active: true }],
        attendanceBySessionId: new Map(),
        justifiedSessionIds: new Set(),
      })
    ).toEqual([])
  })

  it('ignores suspended/archived sessions and buckets by cut', () => {
    const result = buildStudentCutBreakdown({
      cuts,
      sessions: [
        { id: 's1', date: '2026-02-10T15:00:00Z', is_active: true },
        { id: 's2', date: '2026-02-12T15:00:00Z', is_active: false },
        { id: 's3', date: '2026-03-20T15:00:00Z', is_active: true },
      ],
      attendanceBySessionId: new Map([
        ['s1', { status: 'PRESENT' as const }],
        ['s2', { status: 'PRESENT' as const }],
      ]),
      justifiedSessionIds: new Set(),
    })
    expect(result.map((r) => [r.cutId, r.sessionsHeld, r.attended])).toEqual([
      ['c1', 1, 1],
      ['c2', 1, 0],
    ])
  })
})

describe('formatting', () => {
  const base = {
    cutId: 'c1',
    name: 'Corte 1',
    sequence: 1,
    late: 0,
    justified: 0,
    absences: 0,
  }

  it('formats percentages', () => {
    expect(formatPercent(80)).toBe('80%')
    expect(formatPercent(33.3)).toBe('33.3%')
  })

  it('formats cut lines, with and without classes', () => {
    expect(formatCutLine({ ...base, sessionsHeld: 5, attended: 4, percentage: 80 })).toBe(
      'Corte 1: 80% (4/5)'
    )
    expect(formatCutLine({ ...base, sessionsHeld: 0, attended: 0, percentage: 0 })).toBe(
      'Corte 1: sin clases dictadas'
    )
  })
})
