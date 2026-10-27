// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchDaySessions, fetchMonthSessions } from './calendarData'

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
      for (const method of ['select', 'eq', 'in', 'order', 'range', 'gte', 'lt']) {
        builder[method] = vi.fn((...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        })
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: tables[table]?.data ?? [],
          error: tables[table]?.error ?? null,
        }).then(resolve)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const range = { startIso: '2026-10-01T05:00:00.000Z', endIso: '2026-11-01T05:00:00.000Z' }

const monthRow = (extra: Record<string, unknown> = {}) => ({
  date: '2026-10-05T13:00:00Z',
  is_active: true,
  suspended_at: null,
  subjects: { is_active: true },
  ...extra,
})

describe('fetchMonthSessions', () => {
  it('limits the query to active subjects and the month window', async () => {
    const { client, calls } = fakeClient({ sessions: { data: [monthRow()] } })
    await fetchMonthSessions(client, range, {})
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['subjects.is_active', true])
    expect(calls.find((c) => c.method === 'gte')?.args).toEqual(['date', range.startIso])
    expect(calls.find((c) => c.method === 'lt')?.args).toEqual(['date', range.endIso])
    expect(String(calls.find((c) => c.method === 'select')?.args[0])).toContain('subjects!inner')
  })

  it('drops archived sessions and sessions of inactive subjects, keeps suspended ones', async () => {
    const { client } = fakeClient({
      sessions: {
        data: [
          monthRow(),
          monthRow({ is_active: false }), // archived
          monthRow({ is_active: false, suspended_at: '2026-10-01T00:00:00Z' }), // suspended
          monthRow({ subjects: { is_active: false } }), // inactive subject
        ],
      },
    })
    const sessions = await fetchMonthSessions(client, range, {})
    expect(sessions).toHaveLength(2)
    expect(sessions.map((s) => !!s.suspendedAt)).toEqual([false, true])
  })

  it('returns nothing for a career without subjects, without querying', async () => {
    const { client, calls } = fakeClient({ sessions: { data: [monthRow()] } })
    expect(await fetchMonthSessions(client, range, { careerSubjectIds: [] })).toEqual([])
    expect(calls).toEqual([])
  })

  it('throws instead of returning a truncated month when a query fails', async () => {
    const { client } = fakeClient({ sessions: { data: null, error: { message: 'timeout' } } })
    await expect(fetchMonthSessions(client, range, {})).rejects.toThrow()
  })
})

describe('fetchDaySessions', () => {
  const dayRow = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    subject_id: 's1',
    date: '2026-10-05T13:00:00Z',
    modality: 'PRESENCIAL',
    is_makeup: false,
    is_active: true,
    expires_at: null,
    suspended_at: null,
    suspension_reason: null,
    attendances: [{ count: 2 }],
    subjects: { name: 'Cálculo', code: 'MAT', is_active: true },
    ...extra,
  })

  it('uses the same rule as the month cells: no archived sessions, no inactive subjects', async () => {
    const { client, calls } = fakeClient({
      sessions: {
        data: [
          dayRow('held'),
          dayRow('archived', { is_active: false }),
          dayRow('suspended', { is_active: false, suspended_at: '2026-10-01T00:00:00Z' }),
          dayRow('inactive-subject', {
            subjects: { name: 'Vieja', code: 'OLD', is_active: false },
          }),
        ],
      },
      enrollments: { data: [{ subject_id: 's1' }, { subject_id: 's1' }, { subject_id: 's1' }] },
    })
    const sessions = await fetchDaySessions(client, range, {})
    expect(sessions.map((s) => s.id).sort()).toEqual(['held', 'suspended'])
    expect(sessions[0]).toMatchObject({ registered: 2, enrolled: 3, subjectName: 'Cálculo' })
    const filter = calls.find(
      (c) => c.table === 'sessions' && c.method === 'eq' && c.args[0] === 'subjects.is_active'
    )
    expect(filter?.args[1]).toBe(true)
  })
})
