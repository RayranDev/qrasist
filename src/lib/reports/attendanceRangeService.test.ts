// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateRangeReport } from './attendanceRangeService'

type TableResult = { data?: unknown; error?: unknown }

interface Call {
  table: string
  method: string
  args: unknown[]
}

/** Chainable, thenable fake of the PostgREST builder, with per-table results. */
function fakeClient(tables: Record<string, TableResult>) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {}
      const result = () => ({
        data: tables[table]?.data ?? [],
        error: tables[table]?.error ?? null,
      })
      for (const method of ['select', 'eq', 'in', 'order', 'range', 'gte', 'lt', 'lte', 'not']) {
        builder[method] = vi.fn((...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        })
      }
      builder.maybeSingle = vi.fn(async () => {
        const r = result()
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
      })
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const subjectRow = {
  id: 's1',
  name: 'Cálculo',
  code: 'MAT-101',
  is_active: true,
  professor_id: 'p1',
  period_id: null,
  absence_rule_type: null,
  max_absence_percentage: null,
  max_absence_count: null,
  total_planned_sessions: null,
  lates_per_absence: null,
  professor: { name: 'Luis' },
  period: null,
  subject_careers: [],
}

const query = { from: '2026-10-05', to: '2026-10-09' }

describe('generateRangeReport', () => {
  it('answers 404 for an unknown career before loading anything else', async () => {
    const { client, calls } = fakeClient({ careers: { data: [] } })
    const result = await generateRangeReport(client, { ...query, careerId: 'c1' })
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(calls.some((c) => c.table === 'sessions')).toBe(false)
  })

  it('rejects a subject that is not part of the chosen career', async () => {
    const { client } = fakeClient({
      careers: { data: [{ name: 'Ingeniería' }] },
      subject_careers: { data: [{ subject_id: 'other' }] },
    })
    const result = await generateRangeReport(client, { ...query, careerId: 'c1', subjectId: 's1' })
    expect(result).toMatchObject({ ok: false, status: 404 })
  })

  it('answers 404 when no subject had classes in the range', async () => {
    const { client } = fakeClient({ sessions: { data: [] } })
    const result = await generateRangeReport(client, query)
    expect(result).toMatchObject({ ok: false, status: 404 })
  })

  it('bounds the discovery and the load to the Bogota day window', async () => {
    const { client, calls } = fakeClient({
      sessions: {
        data: [
          {
            id: 'x',
            subject_id: 's1',
            date: '2026-10-05T13:00:00Z',
            class_ends_at: null,
            is_active: true,
            suspended_at: null,
            suspension_reason: null,
            modality: null,
            is_makeup: false,
            makeup_reason: null,
          },
        ],
      },
      subjects: { data: [subjectRow] },
      enrollments: {
        data: [{ subject_id: 's1', student_id: 'a', student: { name: 'Ana', student_code: '1' } }],
      },
    })
    const result = await generateRangeReport(client, query)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.detail).toHaveLength(1)
    expect(result.scopeLabel).toBe('05/10/2026 - 09/10/2026')

    const sessionCalls = calls.filter((c) => c.table === 'sessions')
    const starts = sessionCalls.filter((c) => c.method === 'gte').map((c) => c.args[1])
    const ends = sessionCalls.filter((c) => c.method === 'lt').map((c) => c.args[1])
    expect(starts.length).toBeGreaterThanOrEqual(2)
    expect(new Set(starts)).toEqual(new Set(['2026-10-05T05:00:00.000Z']))
    expect(new Set(ends)).toEqual(new Set(['2026-10-10T05:00:00.000Z']))
  })

  it('throws (so the route answers 500) when a query fails', async () => {
    const { client } = fakeClient({ sessions: { data: null, error: { message: 'timeout' } } })
    await expect(generateRangeReport(client, query)).rejects.toThrow()
  })
})
