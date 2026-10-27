// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const loadReportData = vi.fn()
vi.mock('./attendanceReportData', () => ({
  loadReportData: (...args: unknown[]) => loadReportData(...args),
}))
const fetchClassStats = vi.fn()
const fetchClassStatsByWindow = vi.fn()
vi.mock('@/lib/attendance/classOmissionsData', () => ({
  fetchClassStats: (...args: unknown[]) => fetchClassStats(...args),
  fetchClassStatsByWindow: (...args: unknown[]) => fetchClassStatsByWindow(...args),
}))
vi.mock('./studentReportService', () => ({ generateStudentReport: vi.fn() }))

import { generateUserReport } from './userReportService'

/** Minimal PostgREST fake: a professor profile and two active subjects. */
function client(): SupabaseClient {
  const builder = (data: unknown) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'range']) b[m] = vi.fn(() => b)
    b.maybeSingle = vi.fn(async () => ({ data, error: null }))
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: Array.isArray(data) ? data : [], error: null }).then(resolve)
    return b
  }
  return {
    from: (table: string) =>
      table === 'profiles'
        ? builder({ id: 'u1', name: 'Ana', role: 'PROFESSOR', is_active: true, student_code: null })
        : builder([{ id: 'con' }, { id: 'sin' }]),
  } as unknown as SupabaseClient
}

const cuts = [
  { id: 'k1', name: 'Corte 1', startDate: '2026-02-01', endDate: '2026-03-15', sequence: 1 },
  { id: 'k2', name: 'Corte 2', startDate: '2026-03-16', endDate: '2026-04-30', sequence: 2 },
]

const subject = (id: string, withCuts: boolean) => ({
  id,
  code: id.toUpperCase(),
  name: id,
  professorId: 'u1',
  professorName: 'Ana',
  careerNames: [],
  policy: {},
  periodName: '2026-1',
  cuts: withCuts ? cuts : [],
})

beforeEach(() => {
  vi.clearAllMocks()
  loadReportData.mockResolvedValue({
    subjects: [subject('con', true), subject('sin', false)],
    sessions: [],
    enrollments: [],
    attendances: [],
    justifications: [],
  })
  const stat = (subjectId: string, scheduled: number) => ({
    subjectId,
    scheduled,
    held: 0,
    suspended: 0,
    omitted: 0,
    omittedJustified: 0,
  })
  fetchClassStats.mockImplementation(async (_c: unknown, q: { subjectIds: string[] }) =>
    q.subjectIds.map((id) => stat(id, 5))
  )
  // Like the real function, answers every requested subject for every window.
  fetchClassStatsByWindow.mockImplementation(
    async (_c: unknown, q: { subjectIds: string[]; windows: { key: string; from?: string }[] }) =>
      new Map(
        q.windows.map((w) => [
          w.key,
          q.subjectIds.map((id) => stat(id, w.from === '2026-02-01' ? 2 : 3)),
        ])
      )
  )
})

describe('generateUserReport (professor, cuts)', () => {
  it('asks the loader to cover the cuts and fetches the cut class stats once for subjects that have them', async () => {
    const result = await generateUserReport(client(), {
      userId: 'u1',
      range: { from: '2026-03-01', to: '2026-03-07' },
    })
    expect(loadReportData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ widenToCuts: true, dateRange: expect.any(Object) })
    )

    // The report range is fetched once; the cuts share ONE fetch (not one per cut),
    // only for the subject that has cuts.
    expect(fetchClassStats).toHaveBeenCalledTimes(1)
    expect(fetchClassStatsByWindow).toHaveBeenCalledTimes(1)
    const [, query] = fetchClassStatsByWindow.mock.calls[0]
    expect(query).toEqual({
      subjectIds: ['con'],
      windows: [
        { key: 'k1', from: '2026-02-01', to: '2026-03-15' },
        { key: 'k2', from: '2026-03-16', to: '2026-04-30' },
      ],
    })

    if (!result.ok || result.kind !== 'professor') throw new Error('expected a professor report')
    const [con, sin] = result.report.subjects
    expect(con.cuts.map((c) => [c.name, c.scheduled])).toEqual([
      ['Corte 1', 2],
      ['Corte 2', 3],
    ])
    expect(sin.cuts).toEqual([])
  })
})
