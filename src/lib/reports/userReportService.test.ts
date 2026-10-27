// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const generateStudentReport = vi.fn()
vi.mock('./studentReportService', () => ({
  generateStudentReport: (...args: unknown[]) => generateStudentReport(...args),
}))

import { describeRange, generateUserReport } from './userReportService'

type TableResult = { data?: unknown; error?: unknown }

/** Chainable, thenable fake of the PostgREST builder, with per-table results. */
function fakeClient(tables: Record<string, TableResult>) {
  const tablesQueried: string[] = []
  const client = {
    from(table: string) {
      tablesQueried.push(table)
      const builder: Record<string, unknown> = {}
      const result = () => ({
        data: tables[table]?.data ?? [],
        error: tables[table]?.error ?? null,
      })
      for (const method of ['select', 'eq', 'in', 'order', 'range', 'gte', 'lt', 'lte', 'not']) {
        builder[method] = vi.fn(() => builder)
      }
      builder.maybeSingle = vi.fn(async () => {
        const r = result()
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
      })
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, tablesQueried }
}

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: 'u2',
  name: 'Ana',
  role: 'STUDENT',
  is_active: true,
  student_code: '1',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('describeRange', () => {
  it('labels a range, a single day and the whole history', () => {
    expect(describeRange(null)).toBe('Todo el historial')
    expect(describeRange({ from: '2026-10-05', to: '2026-10-05' })).toBe('05/10/2026')
    expect(describeRange({ from: '2026-10-01', to: '2026-10-31' })).toBe('01/10/2026 - 31/10/2026')
  })
})

describe('generateUserReport', () => {
  it('answers 404 for an unknown or inactive user', async () => {
    const unknown = fakeClient({ profiles: { data: [] } })
    expect(await generateUserReport(unknown.client, { userId: 'x', range: null })).toMatchObject({
      ok: false,
      status: 404,
    })
    const inactive = fakeClient({ profiles: { data: [profile({ is_active: false })] } })
    expect(await generateUserReport(inactive.client, { userId: 'x', range: null })).toMatchObject({
      ok: false,
      status: 404,
    })
    expect(generateStudentReport).not.toHaveBeenCalled()
  })

  it('answers 400 for administrators without loading any report data', async () => {
    const { client, tablesQueried } = fakeClient({
      profiles: { data: [profile({ role: 'ADMIN' })] },
    })
    expect(await generateUserReport(client, { userId: 'x', range: null })).toMatchObject({
      ok: false,
      status: 400,
    })
    expect(tablesQueried).toEqual(['profiles'])
  })

  it('delegates students to the student report with the range', async () => {
    generateStudentReport.mockResolvedValue({
      ok: true,
      report: { studentName: 'Ana', studentCode: '1', history: [] },
    })
    const { client } = fakeClient({ profiles: { data: [profile()] } })
    const range = { from: '2026-10-01', to: '2026-10-31' }
    const result = await generateUserReport(client, { userId: 'u2', range })
    expect(result).toMatchObject({ ok: true, kind: 'student', name: 'Ana', code: '1' })
    expect(generateStudentReport).toHaveBeenCalledWith(client, 'u2', { range })
  })

  it('answers 404 for a professor without active subjects', async () => {
    const { client } = fakeClient({
      profiles: { data: [profile({ role: 'PROFESSOR' })] },
      subjects: { data: [] },
    })
    expect(await generateUserReport(client, { userId: 'u2', range: null })).toMatchObject({
      ok: false,
      status: 404,
    })
  })

  it('throws (so the route answers 500) when the profile query fails', async () => {
    const { client } = fakeClient({ profiles: { data: null, error: { message: 'timeout' } } })
    await expect(generateUserReport(client, { userId: 'u2', range: null })).rejects.toThrow()
  })
})
