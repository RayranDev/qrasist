import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchDashboardAttendanceData } from './dashboardAttendanceData'

type Row = Record<string, unknown>

/**
 * Fake of the PostgREST builder that behaves like a server with `max_rows`:
 * it honours `.range(from, to)` but never returns more than `serverCap` rows
 * per response (the silent truncation the dashboard used to suffer).
 */
function fakeClient(tables: Record<string, Row[]>, serverCap: number, failTable?: string) {
  const calls: { table: string; order: string[]; ranges: [number, number][] }[] = []
  const client = {
    from(table: string) {
      const call = { table, order: [] as string[], ranges: [] as [number, number][] }
      calls.push(call)
      let range: [number, number] | null = null
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq']) {
        builder[method] = vi.fn(() => builder)
      }
      builder.order = vi.fn((column: string) => {
        call.order.push(column)
        return builder
      })
      builder.range = vi.fn((from: number, to: number) => {
        range = [from, to]
        call.ranges.push([from, to])
        return builder
      })
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (table === failTable) {
          return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve)
        }
        const all = tables[table] ?? []
        const [from, to] = range ?? [0, all.length - 1]
        const wanted = all.slice(from, to + 1)
        return Promise.resolve({ data: wanted.slice(0, serverCap), error: null }).then(resolve)
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const rows = (n: number, make: (i: number) => Row): Row[] =>
  Array.from({ length: n }, (_, i) => make(i))

describe('fetchDashboardAttendanceData', () => {
  it('returns every row even when the server caps each response below the page size', async () => {
    const { client } = fakeClient(
      {
        sessions: rows(7, (i) => ({
          id: `s${i}`,
          subject_id: 'sub',
          date: 'd',
          class_ends_at: null,
        })),
        attendances: rows(2500, (i) => ({
          id: `a${i}`,
          student_id: `st${i}`,
          session_id: 's0',
          status: 'PRESENT',
          session: { subject_id: 'sub', is_active: true },
        })),
        absence_justifications: rows(3, (i) => ({
          id: `j${i}`,
          student_id: 'st',
          subject_id: 'sub',
        })),
        enrollments: rows(1200, (i) => ({ id: `e${i}`, student_id: `st${i}`, subject_id: 'sub' })),
      },
      // Production-like: the server returns fewer rows than a full 1000 page.
      500
    )

    const data = await fetchDashboardAttendanceData(client)

    expect(data.activeSessions).toHaveLength(7)
    expect(data.attendances).toHaveLength(2500)
    expect(data.approvedJustifications).toHaveLength(3)
    expect(data.enrollments).toHaveLength(1200)
    // No row is duplicated or skipped across pages.
    expect(new Set(data.attendances.map((a) => a.student_id)).size).toBe(2500)
  })

  it('returns more than 1000 attendances with the default 1000-row server cap', async () => {
    const { client } = fakeClient(
      {
        attendances: rows(1664, (i) => ({
          id: `a${i}`,
          student_id: `st${i % 30}`,
          session_id: 's0',
          status: 'PRESENT',
          session: null,
        })),
      },
      1000
    )

    const data = await fetchDashboardAttendanceData(client)

    expect(data.attendances).toHaveLength(1664)
  })

  it('orders every paged query by its primary key so pages are deterministic', async () => {
    const { client, calls } = fakeClient({}, 1000)

    await fetchDashboardAttendanceData(client)

    expect(calls.map((c) => c.table).sort()).toEqual([
      'absence_justifications',
      'attendances',
      'enrollments',
      'sessions',
    ])
    for (const call of calls) {
      expect(call.order).toEqual(['id'])
      expect(call.ranges[0]).toEqual([0, 999])
    }
  })

  it('throws instead of computing indicators from partial data when a page fails', async () => {
    const { client } = fakeClient({}, 1000, 'attendances')

    await expect(fetchDashboardAttendanceData(client)).rejects.toThrow(/asistencias/)
  })
})
