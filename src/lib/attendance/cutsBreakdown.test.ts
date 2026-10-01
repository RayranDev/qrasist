import { describe, it, expect } from 'vitest'
import { computeCutsBreakdown, type CutInput, type SessionInput } from './cutsBreakdown'

const cut1: CutInput = {
  id: 'cut-1',
  name: 'Primer corte',
  startDate: '2026-02-01',
  endDate: '2026-03-15',
  sequence: 1,
}
const cut2: CutInput = {
  id: 'cut-2',
  name: 'Segundo corte',
  startDate: '2026-03-16',
  endDate: '2026-04-30',
  sequence: 2,
}

describe('computeCutsBreakdown', () => {
  it('buckets sessions into the cut whose range contains the session date', () => {
    const sessions: SessionInput[] = [
      { id: 's1', date: '2026-02-10T14:00:00.000Z' },
      { id: 's2', date: '2026-03-20T14:00:00.000Z' },
    ]
    const result = computeCutsBreakdown(
      [cut1, cut2],
      sessions,
      new Map([
        ['s1', { status: 'PRESENT' }],
        ['s2', { status: 'PRESENT' }],
      ]),
      new Set()
    )

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ cutId: 'cut-1', sessionsHeld: 1, attended: 1 })
    expect(result[1]).toMatchObject({ cutId: 'cut-2', sessionsHeld: 1, attended: 1 })
  })

  it('includes sessions on the exact start/end boundary dates (inclusive)', () => {
    const sessions: SessionInput[] = [
      { id: 's1', date: '2026-02-01T00:00:00.000Z' }, // cut1 start
      { id: 's2', date: '2026-03-15T23:59:59.000Z' }, // cut1 end
      { id: 's3', date: '2026-03-16T00:00:00.000Z' }, // cut2 start
    ]
    const result = computeCutsBreakdown(
      [cut1, cut2],
      sessions,
      new Map([
        ['s1', { status: 'PRESENT' }],
        ['s2', { status: 'PRESENT' }],
        ['s3', { status: 'PRESENT' }],
      ]),
      new Set()
    )

    expect(result.find((r) => r.cutId === 'cut-1')?.sessionsHeld).toBe(2)
    expect(result.find((r) => r.cutId === 'cut-2')?.sessionsHeld).toBe(1)
  })

  it('puts a session outside every cut into the synthetic "Sin corte asignado" bucket', () => {
    const sessions: SessionInput[] = [
      { id: 's1', date: '2026-01-01T00:00:00.000Z' }, // before cut1
      { id: 's2', date: '2026-02-10T00:00:00.000Z' }, // inside cut1
    ]
    const result = computeCutsBreakdown(
      [cut1, cut2],
      sessions,
      new Map([
        ['s1', { status: 'PRESENT' }],
        ['s2', { status: 'PRESENT' }],
      ]),
      new Set()
    )

    const unassigned = result.find((r) => r.cutId === null)
    expect(unassigned).toBeDefined()
    expect(unassigned?.name).toBe('Sin corte asignado')
    expect(unassigned?.sequence).toBeNull()
    expect(unassigned?.sessionsHeld).toBe(1)
  })

  it('omits the "Sin corte asignado" bucket entirely when every session matches a cut', () => {
    const sessions: SessionInput[] = [{ id: 's1', date: '2026-02-10T00:00:00.000Z' }]
    const result = computeCutsBreakdown(
      [cut1, cut2],
      sessions,
      new Map([['s1', { status: 'PRESENT' }]]),
      new Set()
    )

    expect(result.some((r) => r.cutId === null)).toBe(false)
  })

  it('still includes a cut with zero sessions, with everything zeroed out', () => {
    const sessions: SessionInput[] = [{ id: 's1', date: '2026-02-10T00:00:00.000Z' }]
    const result = computeCutsBreakdown(
      [cut1, cut2],
      sessions,
      new Map([['s1', { status: 'PRESENT' }]]),
      new Set()
    )

    const emptyCut = result.find((r) => r.cutId === 'cut-2')
    expect(emptyCut).toMatchObject({
      sessionsHeld: 0,
      attended: 0,
      late: 0,
      justified: 0,
      absences: 0,
      percentage: 0,
    })
  })

  it('counts justified, late and real absences independently', () => {
    const sessions: SessionInput[] = [
      { id: 'present', date: '2026-02-05T00:00:00.000Z' },
      { id: 'late', date: '2026-02-06T00:00:00.000Z' },
      { id: 'justified', date: '2026-02-07T00:00:00.000Z' },
      { id: 'absent', date: '2026-02-08T00:00:00.000Z' },
    ]
    const result = computeCutsBreakdown(
      [cut1],
      sessions,
      new Map([
        ['present', { status: 'PRESENT' }],
        ['late', { status: 'LATE' }],
      ]),
      new Set(['justified'])
    )

    expect(result[0]).toMatchObject({
      sessionsHeld: 4,
      attended: 2, // present + late both count as "attended"
      late: 1,
      justified: 1,
      absences: 1, // only "absent" has neither attendance nor justification
    })
  })

  it('computes percentage as attended / sessionsHeld, rounded to one decimal', () => {
    const sessions: SessionInput[] = [
      { id: 's1', date: '2026-02-01T00:00:00.000Z' },
      { id: 's2', date: '2026-02-02T00:00:00.000Z' },
      { id: 's3', date: '2026-02-03T00:00:00.000Z' },
    ]
    const result = computeCutsBreakdown(
      [cut1],
      sessions,
      new Map([['s1', { status: 'PRESENT' }]]),
      new Set()
    )

    expect(result[0].percentage).toBeCloseTo(33.3, 1)
  })

  it('returns an empty array when there are no cuts and no sessions', () => {
    expect(computeCutsBreakdown([], [], new Map(), new Set())).toEqual([])
  })

  it('with an empty cuts array, every session lands in "Sin corte asignado"', () => {
    const sessions: SessionInput[] = [{ id: 's1', date: '2026-02-10T00:00:00.000Z' }]
    const result = computeCutsBreakdown(
      [],
      sessions,
      new Map([['s1', { status: 'PRESENT' }]]),
      new Set()
    )

    expect(result).toHaveLength(1)
    expect(result[0].cutId).toBeNull()
    expect(result[0].sessionsHeld).toBe(1)
  })

  it('orders cuts by sequence regardless of input order', () => {
    const sessions: SessionInput[] = []
    const result = computeCutsBreakdown([cut2, cut1], sessions, new Map(), new Set())
    expect(result.map((r) => r.cutId)).toEqual(['cut-1', 'cut-2'])
  })
})
