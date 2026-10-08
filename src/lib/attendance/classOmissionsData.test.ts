import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countUnjustified, fetchClassOmissions, fetchClassStats } from './classOmissionsData'

type Rows = Record<string, unknown[]>

/** Chainable, thenable fake of the PostgREST builder: resolves to the table's rows. */
function fakeClient(rows: Rows) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'not', 'in', 'gte', 'order', 'range']) {
        builder[method] = vi.fn((...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        })
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const NOW = new Date('2026-03-04T17:00:00Z') // Wednesday 12:00 Bogota

const subject = {
  id: 'subject-1',
  name: 'Algoritmos',
  code: 'ALG-1',
  professor_id: 'prof-1',
  period: { start_date: '2026-02-02', end_date: '2026-06-05' },
  professor: { name: 'Profe Uno' },
}
const mondayBlock = {
  id: 'block-1',
  subject_id: 'subject-1',
  day_of_week: 1,
  start_time: '08:00:00',
  end_time: '10:00:00',
  created_at: '2026-01-15T15:00:00Z',
}

describe('fetchClassOmissions', () => {
  it('returns omissions newest first with subject and professor context', async () => {
    const { client } = fakeClient({
      subjects: [subject],
      subject_schedules: [mondayBlock],
      sessions: [
        {
          subject_id: 'subject-1',
          date: '2026-02-09T13:05:00Z',
          is_active: true,
          suspended_at: null,
        },
        {
          subject_id: 'subject-1',
          date: '2026-02-16T13:00:00Z',
          is_active: false,
          suspended_at: '2026-02-16T12:00:00Z',
        },
      ],
      class_omissions: [
        { subject_id: 'subject-1', class_date: '2026-02-23', reason: 'Cita médica urgente' },
      ],
    })

    const items = await fetchClassOmissions(client, { now: NOW })

    expect(items.map((i) => i.date)).toEqual(['2026-03-02', '2026-02-23', '2026-02-02'])
    expect(items[0]).toMatchObject({
      subjectId: 'subject-1',
      subjectName: 'Algoritmos',
      professorId: 'prof-1',
      professorName: 'Profe Uno',
      justified: false,
    })
    expect(items[1]).toMatchObject({ justified: true, reason: 'Cita médica urgente' })
    expect(countUnjustified(items)).toBe(2)
  })

  it('degrades to an empty list when there is no period, no dates or no schedule', async () => {
    const noPeriod = fakeClient({ subjects: [], subject_schedules: [mondayBlock] })
    expect(await fetchClassOmissions(noPeriod.client, { now: NOW })).toEqual([])

    const noDates = fakeClient({
      subjects: [{ ...subject, period: { start_date: null, end_date: null } }],
      subject_schedules: [mondayBlock],
    })
    expect(await fetchClassOmissions(noDates.client, { now: NOW })).toEqual([])

    const noSchedule = fakeClient({ subjects: [subject], subject_schedules: [] })
    expect(await fetchClassOmissions(noSchedule.client, { now: NOW })).toEqual([])
  })

  it('does not hit the database for an explicit empty subject list', async () => {
    const { client, calls } = fakeClient({ subjects: [subject] })

    expect(await fetchClassOmissions(client, { subjectIds: [], now: NOW })).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('accepts the embedded period as an array (PostgREST typing quirk)', async () => {
    const { client } = fakeClient({
      subjects: [{ ...subject, period: [subject.period], professor: [subject.professor] }],
      subject_schedules: [mondayBlock],
    })

    const items = await fetchClassOmissions(client, { now: NOW })
    expect(items).toHaveLength(5)
  })
})

describe('fetchClassStats', () => {
  it('summarises scheduled/held/suspended/omitted per subject for a range', async () => {
    const { client } = fakeClient({
      subjects: [subject],
      subject_schedules: [mondayBlock],
      sessions: [
        {
          subject_id: 'subject-1',
          date: '2026-02-02T13:05:00Z',
          is_active: true,
          suspended_at: null,
        },
        {
          subject_id: 'subject-1',
          date: '2026-02-09T13:00:00Z',
          is_active: false,
          suspended_at: '2026-02-09T12:00:00Z',
        },
      ],
      class_omissions: [],
    })

    const [stats] = await fetchClassStats(client, {
      now: NOW,
      from: '2026-02-01',
      to: '2026-03-04',
    })

    expect(stats).toMatchObject({
      subjectId: 'subject-1',
      professorId: 'prof-1',
      scheduled: 5,
      held: 1,
      suspended: 1,
      omitted: 3,
      omittedJustified: 0,
    })
  })
})
