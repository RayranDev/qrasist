import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countRecentSuspensions, fetchSuspendedClasses } from './suspendedClasses'

function fakeClient(result: unknown) {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'not', 'gte', 'order', 'range']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    })
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { client: { from: () => builder } as unknown as SupabaseClient, calls }
}

describe('fetchSuspendedClasses', () => {
  it('maps the suspended sessions with subject, professor, actor and kept scans', async () => {
    const { client } = fakeClient({
      data: [
        {
          id: 'session-1',
          subject_id: 'subject-1',
          date: '2026-03-02T13:00:00Z',
          suspended_at: '2026-03-02T13:30:00Z',
          suspension_reason: 'Corte de energía',
          subject: {
            name: 'Algoritmos',
            code: 'ALG-1',
            professor_id: 'prof-1',
            professor: { name: 'Profe Uno' },
          },
          suspender: [{ name: 'Profe Uno' }],
          attendances: [{ count: 20 }],
        },
        {
          id: 'session-2',
          subject_id: 'subject-1',
          date: '2026-02-23T13:00:00Z',
          suspended_at: '2026-02-23T12:00:00Z',
          suspension_reason: null,
          subject: [{ name: 'Algoritmos', code: 'ALG-1', professor_id: null, professor: null }],
          suspender: null,
          attendances: null,
        },
      ],
      error: null,
    })

    const items = await fetchSuspendedClasses(client)

    expect(items[0]).toEqual({
      sessionId: 'session-1',
      subjectId: 'subject-1',
      subjectName: 'Algoritmos',
      subjectCode: 'ALG-1',
      professorId: 'prof-1',
      professorName: 'Profe Uno',
      date: '2026-03-02T13:00:00Z',
      suspendedAt: '2026-03-02T13:30:00Z',
      suspendedByName: 'Profe Uno',
      reason: 'Corte de energía',
      attendancesKept: 20,
    })
    expect(items[1]).toMatchObject({
      professorName: null,
      suspendedByName: null,
      reason: '',
      attendancesKept: 0,
    })
  })

  it('returns an empty list when nothing is suspended', async () => {
    const { client } = fakeClient({ data: [], error: null })
    expect(await fetchSuspendedClasses(client)).toEqual([])
  })
})

describe('countRecentSuspensions', () => {
  it('counts suspensions from the last 7 days by default', async () => {
    const { client, calls } = fakeClient({ count: 3, error: null })

    const count = await countRecentSuspensions(client, new Date('2026-03-10T12:00:00Z'))

    expect(count).toBe(3)
    expect(calls.find((c) => c.method === 'gte')?.args).toEqual([
      'suspended_at',
      '2026-03-03T12:00:00.000Z',
    ])
  })

  it('treats a missing count as zero', async () => {
    const { client } = fakeClient({ count: null, error: null })
    expect(await countRecentSuspensions(client)).toBe(0)
  })
})
