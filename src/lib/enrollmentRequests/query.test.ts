import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPendingRequests } from './query'

interface Call {
  select: string
  selectOptions?: unknown
  eq: [string, unknown][]
  or: { filter: string; options: unknown }[]
  range: [number, number]
}

type Raw = {
  id: string
  requested_at: string
  student_id: string
  subject_id: string
  student: { name: string; student_code: string | null } | null
  subject: { name: string; code: string } | null
}

const raw = (n: number, overrides: Partial<Raw> = {}): Raw => ({
  id: `r${String(n).padStart(5, '0')}`,
  requested_at: `2026-10-01T10:${String(n % 60).padStart(2, '0')}:00Z`,
  student_id: `st${n}`,
  subject_id: `su${n % 3}`,
  student: { name: `Estudiante ${n}`, student_code: `${n}` },
  subject: { name: `Materia ${n % 3}`, code: `M${n % 3}` },
  ...overrides,
})

// Cada llamada a .from() arma una consulta; el handler decide la respuesta
// por rama (cuál embed filtra el .or()) y por rango.
function fakeClient(
  handler: (call: Call) => { data: Raw[] | null; count?: number | null; error?: unknown }
) {
  const calls: Call[] = []
  const client = {
    from: vi.fn(() => {
      const call: Call = { select: '', eq: [], or: [], range: [0, 0] }
      const b: Record<string, unknown> = {}
      b.select = (sel: string, opts?: unknown) => {
        call.select = sel
        call.selectOptions = opts
        return b
      }
      b.eq = (c: string, v: unknown) => {
        call.eq.push([c, v])
        return b
      }
      b.order = () => b
      b.or = (filter: string, options: unknown) => {
        call.or.push({ filter, options })
        return b
      }
      b.range = (from: number, to: number) => {
        call.range = [from, to]
        calls.push(call)
        return Promise.resolve(handler(call))
      }
      return b
    }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const branchOf = (call: Call) =>
  (call.or[0]?.options as { referencedTable?: string })?.referencedTable

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('fetchPendingRequests', () => {
  it('pins the student FK in the embed and only asks for pending requests', async () => {
    const { client, calls } = fakeClient(() => ({ data: [raw(1)], count: 1 }))

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: '' } })

    expect(calls[0].select).toContain('profiles!enrollment_requests_student_id_fkey!inner')
    expect(calls[0].eq).toContainEqual(['status', 'pending'])
    expect(result.requests[0]).toEqual({
      id: 'r00001',
      requestedAt: '2026-10-01T10:01:00Z',
      studentId: 'st1',
      studentName: 'Estudiante 1',
      studentCode: '1',
      subjectId: 'su1',
      subjectName: 'Materia 1',
      subjectCode: 'M1',
    })
    expect(result.total).toBe(1)
    expect(result.truncated).toBe(false)
    expect(result.error).toBe(false)
  })

  it('reads past PostgREST 1000-row cap by paging, asking for the count only on page one', async () => {
    const all = Array.from({ length: 2300 }, (_, i) => raw(i))
    const { client, calls } = fakeClient((call) => ({
      data: all.slice(call.range[0], call.range[1] + 1),
      count: call.selectOptions ? all.length : null,
    }))

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: '' } })

    expect(result.requests).toHaveLength(2300)
    expect(result.total).toBe(2300)
    expect(result.truncated).toBe(false)
    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    expect(calls.map((c) => !!c.selectOptions)).toEqual([true, false, false])
  })

  it('keeps paging when the server caps pages below 1000 rows (max_rows)', async () => {
    const all = Array.from({ length: 1300 }, (_, i) => raw(i))
    const CAP = 500
    const { client, calls } = fakeClient((call) => ({
      // El servidor ignora el rango pedido y devuelve a lo sumo CAP filas.
      data: all.slice(call.range[0], Math.min(call.range[1] + 1, call.range[0] + CAP)),
      count: call.selectOptions ? all.length : null,
    }))

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: '' } })

    expect(result.requests).toHaveLength(1300)
    expect(result.total).toBe(1300)
    expect(result.truncated).toBe(false)
    expect(calls.map((c) => c.range[0])).toEqual([0, 500, 1000])
  })

  it('stops on an empty page instead of looping when the count is stale', async () => {
    const all = Array.from({ length: 10 }, (_, i) => raw(i))
    const { client, calls } = fakeClient((call) => ({
      data: all.slice(call.range[0], call.range[1] + 1),
      count: call.selectOptions ? 25 : null,
    }))

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: '' } })

    expect(result.requests).toHaveLength(10)
    expect(calls).toHaveLength(2)
  })

  it('drops duplicate rows when the list shifts between pages', async () => {
    const all = Array.from({ length: 1200 }, (_, i) => raw(i))
    const { client } = fakeClient((call) => {
      const rows = all.slice(call.range[0], call.range[1] + 1)
      // Una aprobación concurrente desplaza la lista: la 2.ª página repite 5 filas.
      return {
        data: call.range[0] === 1000 ? [...all.slice(995, 1000), ...rows] : rows,
        count: call.selectOptions ? all.length : null,
      }
    })

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: '' } })

    const ids = result.requests.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(1200)
  })

  it('stops at maxRows and says so instead of truncating silently', async () => {
    const all = Array.from({ length: 2300 }, (_, i) => raw(i))
    const { client, calls } = fakeClient((call) => ({
      data: all.slice(call.range[0], call.range[1] + 1),
      count: call.selectOptions ? all.length : null,
    }))

    const result = await fetchPendingRequests(client, {
      scope: {},
      filters: { q: '' },
      maxRows: 1500,
    })

    expect(result.requests).toHaveLength(1500)
    expect(result.total).toBe(2300)
    expect(result.truncated).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('applies the professor scope and the subject filter', async () => {
    const { client, calls } = fakeClient(() => ({ data: [], count: 0 }))

    await fetchPendingRequests(client, {
      scope: { professorId: 'prof-1' },
      filters: { q: '', subjectId: 'subj-1' },
    })

    expect(calls[0].eq).toEqual(
      expect.arrayContaining([
        ['subject_id', 'subj-1'],
        ['subject.professor_id', 'prof-1'],
      ])
    )
  })

  it('applies the career filter for an admin', async () => {
    const { client, calls } = fakeClient(() => ({ data: [], count: 0 }))

    await fetchPendingRequests(client, { scope: {}, filters: { q: '', career: 'career-1' } })

    expect(calls[0].select).toContain('subject_careers!inner')
    expect(calls[0].eq).toEqual(
      expect.arrayContaining([
        ['subject.subject_careers.career_id', 'career-1'],
        ['subject.subject_careers.is_active', true],
      ])
    )
  })

  it('ignores the career filter for a professor', async () => {
    const { client, calls } = fakeClient(() => ({ data: [], count: 0 }))

    await fetchPendingRequests(client, {
      scope: { professorId: 'prof-1' },
      filters: { q: '', career: 'career-1' },
    })

    expect(calls[0].select).not.toContain('subject_careers')
    expect(calls[0].eq.some(([c]) => c.includes('career'))).toBe(false)
  })

  it('does not join careers when there is no career filter', async () => {
    const { client, calls } = fakeClient(() => ({ data: [], count: 0 }))

    await fetchPendingRequests(client, { scope: {}, filters: { q: '' } })

    expect(calls[0].select).not.toContain('subject_careers')
  })

  it('searches student OR subject with two queries merged by id', async () => {
    const { client, calls } = fakeClient((call) =>
      branchOf(call) === 'student'
        ? { data: [raw(1), raw(2)], count: 2 }
        : { data: [raw(2), raw(3)], count: 2 }
    )

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: 'ana' } })

    expect(calls).toHaveLength(2)
    const student = calls.find((c) => branchOf(c) === 'student')!
    const subject = calls.find((c) => branchOf(c) === 'subject')!
    expect(student.or[0].filter).toBe('name.ilike.%ana%,student_code.ilike.%ana%')
    expect(subject.or[0].filter).toBe('name.ilike.%ana%,code.ilike.%ana%')
    expect(result.requests.map((r) => r.id)).toEqual(['r00001', 'r00002', 'r00003'])
    expect(result.total).toBe(3)
    expect(result.truncated).toBe(false)
  })

  it('keeps the oldest maxRows of a merged search and flags truncation', async () => {
    const { client } = fakeClient((call) =>
      branchOf(call) === 'student'
        ? { data: [raw(1), raw(3), raw(5)], count: 3 }
        : { data: [raw(2), raw(4), raw(6)], count: 3 }
    )

    const result = await fetchPendingRequests(client, {
      scope: {},
      filters: { q: 'x' },
      maxRows: 4,
    })

    expect(result.requests.map((r) => r.id)).toEqual(['r00001', 'r00002', 'r00003', 'r00004'])
    expect(result.truncated).toBe(true)
  })

  it('reports an error instead of an empty list when the query fails', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'PGRST201' } }))

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: '' } })

    expect(result).toEqual({ requests: [], total: 0, truncated: false, error: true })
  })

  it('fails the whole search if one of the two queries fails', async () => {
    const { client } = fakeClient((call) =>
      branchOf(call) === 'student'
        ? { data: [raw(1)], count: 1 }
        : { data: null, error: { message: 'boom' } }
    )

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: 'ana' } })

    expect(result.error).toBe(true)
  })

  it('falls back to neutral labels when an embed comes back empty', async () => {
    const { client } = fakeClient(() => ({
      data: [raw(1, { student: null, subject: null })],
      count: 1,
    }))

    const result = await fetchPendingRequests(client, { scope: {}, filters: { q: '' } })

    expect(result.requests[0].studentName).toBe('Estudiante')
    expect(result.requests[0].studentCode).toBeNull()
    expect(result.requests[0].subjectName).toBe('Materia')
  })
})
