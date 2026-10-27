import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enrollStudentInSubjects, listSubjectsEnrollableByStudent } from './enrollments'

interface CallEntry {
  table: string
  ops: string[]
  args: Record<string, unknown[]>
  /** Every call in order (args keeps only the last call per method). */
  history: [string, unknown[]][]
}

type Result = { data?: unknown; error?: unknown; count?: number | null }

const calls: CallEntry[] = []
const mockGetUser = vi.fn()
const mockLogAudit = vi.fn()
// Results keyed by "table.firstOp"; arrays are consumed in order.
const results = new Map<string, Result | Result[]>()

function resolveResult(entry: CallEntry): Result {
  const configured = results.get(`${entry.table}.${entry.ops[0]}`)
  if (Array.isArray(configured)) return configured.shift() ?? { data: null, error: null }
  return configured ?? { data: null, error: null }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      const entry: CallEntry = { table, ops: [], args: {}, history: [] }
      calls.push(entry)
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(resolveResult(entry)).then(resolve, reject)
            }
            return (...args: unknown[]) => {
              entry.ops.push(prop)
              entry.args[prop] = args
              entry.history.push([prop, args])
              return builder
            }
          },
        }
      )
      return builder
    },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit/auditLog', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a) }))

const subjectRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  code: `C-${id}`,
  is_active: true,
  ...over,
})

function asAdminWithStudent(student: { role: string; is_active: boolean } | null) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  results.set('profiles.select', [{ data: { role: 'ADMIN' } }, { data: student }])
  // Subject and student share career-1 unless a test overrides these.
  results.set('subject_careers.select', { data: [{ career_id: 'career-1' }] })
  results.set('student_careers.select', { data: [{ career_id: 'career-1' }] })
}

const inserts = () => calls.filter((c) => c.table === 'enrollments' && c.ops[0] === 'insert')

describe('enrollStudentInSubjects', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    mockGetUser.mockReset()
    mockLogAudit.mockReset()
  })

  it('rejects non-admin callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'p1' } } })
    results.set('profiles.select', [{ data: { role: 'PROFESSOR' } }])

    const res = await enrollStudentInSubjects('st-1', ['s1'])

    expect(res.success).toBe(false)
    expect(inserts()).toHaveLength(0)
  })

  it('rejects a target that is not an active student', async () => {
    asAdminWithStudent({ role: 'PROFESSOR', is_active: true })
    const res = await enrollStudentInSubjects('u1', ['s1'])
    expect(res.success).toBe(false)
    expect(inserts()).toHaveLength(0)
  })

  it('rejects an empty selection and caps the batch size with the enroll wording', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    expect((await enrollStudentInSubjects('st-1', [])).error).toMatch(/al menos una/i)

    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    const many = Array.from({ length: 51 }, (_, i) => `s${i}`)
    expect((await enrollStudentInSubjects('st-1', many)).error).toMatch(/inscribir hasta 50/)
  })

  it('enrolls every valid subject and writes one audit entry', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('subjects.select', { data: [subjectRow('s1'), subjectRow('s2')] })
    results.set('enrollments.select', { data: [] })
    results.set('enrollments.insert', [{ error: null }, { error: null }])

    const res = await enrollStudentInSubjects('st-1', ['s1', 's2', 's1'])

    expect(res).toEqual({ success: true, enrolled: ['s1', 's2'], failures: [] })
    expect(inserts().map((c) => c.args.insert?.[0])).toEqual([
      { subject_id: 's1', student_id: 'st-1' },
      { subject_id: 's2', student_id: 'st-1' },
    ])
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.enroll_subjects',
        entityId: 'st-1',
        details: expect.objectContaining({ subject_ids: ['s1', 's2'], enrolled_count: 2 }),
      })
    )
  })

  it('applies nothing and reports every failing subject', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('subjects.select', {
      data: [subjectRow('s1'), subjectRow('s2'), subjectRow('s3', { is_active: false })],
    })
    results.set('enrollments.select', { data: [{ subject_id: 's2' }] })

    const res = await enrollStudentInSubjects('st-1', ['s1', 's2', 's3', 'missing'])

    expect(res.success).toBe(false)
    expect(res.enrolled).toEqual([])
    expect(res.failures.map((f) => [f.subjectId, f.error])).toEqual([
      ['s2', 'El estudiante ya está inscrito.'],
      ['s3', 'La materia está archivada.'],
      ['missing', 'La materia no existe.'],
    ])
    expect(inserts()).toHaveLength(0)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('reuses the career guard: no shared career means nothing is enrolled', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('subjects.select', { data: [subjectRow('s1')] })
    results.set('enrollments.select', { data: [] })
    results.set('subject_careers.select', { data: [{ career_id: 'career-2' }] })

    const res = await enrollStudentInSubjects('st-1', ['s1'])

    expect(res.success).toBe(false)
    expect(res.failures[0].error).toMatch(/no pertenece a la carrera/i)
    expect(inserts()).toHaveLength(0)
  })

  it('reports a partial outcome explicitly when an insert fails afterwards', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('subjects.select', { data: [subjectRow('s1'), subjectRow('s2')] })
    results.set('enrollments.select', { data: [] })
    results.set('enrollments.insert', [{ error: null }, { error: { code: '23505' } }])

    const res = await enrollStudentInSubjects('st-1', ['s1', 's2'])

    expect(res.success).toBe(false)
    expect(res.enrolled).toEqual(['s1'])
    expect(res.failures).toEqual([
      { subjectId: 's2', code: 'C-s2', error: 'El estudiante ya está inscrito.' },
    ])
    expect(res.error).toBe('Se inscribió en 1 de 2 materias; revisa las que fallaron.')
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ subject_ids: ['s1'], failed_count: 1 }),
      })
    )
  })
})

describe('enrollStudentInSubjects write-stage wording', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    mockGetUser.mockReset()
    mockLogAudit.mockReset()
  })

  it('says nothing was enrolled (not "0 of N") when every insert fails after validation', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('subjects.select', { data: [subjectRow('s1'), subjectRow('s2')] })
    results.set('enrollments.select', { data: [] })
    results.set('enrollments.insert', [{ error: { code: 'XX' } }, { error: { code: 'XX' } }])

    const res = await enrollStudentInSubjects('st-1', ['s1', 's2'])

    expect(res.success).toBe(false)
    expect(res.enrolled).toEqual([])
    expect(res.error).toBe('No se inscribió en ninguna materia: revisa las que fallaron.')
    expect(res.failures).toHaveLength(2)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

describe('listSubjectsEnrollableByStudent', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    mockGetUser.mockReset()
  })

  const candidate = (i: number) => ({
    id: `s${i}`,
    code: `C${i}`,
    name: `Materia ${i}`,
    subject_careers: [{ career_id: 'career-1' }],
  })
  const orders = (entry: CallEntry) =>
    entry.history.filter(([op]) => op === 'order').map(([, args]) => args)

  it('says so when the student has no careers instead of listing anything', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('student_careers.select', { data: [] })

    const res = await listSubjectsEnrollableByStudent('st-1')

    expect(res).toEqual({
      success: true,
      noCareers: true,
      subjects: [],
      total: 0,
      truncated: false,
    })
    expect(calls.some((c) => c.table === 'subjects')).toBe(false)
  })

  it('filters by career, sanitizes the search and orders by name then id', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('enrollments.select', { data: [] })
    results.set('subjects.select', { data: [candidate(1)] })

    const res = await listSubjectsEnrollableByStudent('st-1', ' MAT,(1)% ')

    expect(res).toEqual({
      success: true,
      noCareers: false,
      subjects: [{ id: 's1', code: 'C1', name: 'Materia 1' }],
      total: 1,
      truncated: false,
    })
    const query = calls.find((c) => c.table === 'subjects')!
    expect(query.args.in).toEqual(['subject_careers.career_id', ['career-1']])
    expect(query.args.or).toEqual(['name.ilike.%MAT1%,code.ilike.%MAT1%'])
    expect(orders(query)).toEqual([['name'], ['id']])
    expect(query.args.limit).toEqual([500])
  })

  it('reads the enrolled ids in a stable order and never sends them to PostgREST', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('enrollments.select', { data: [{ subject_id: 's1' }] })
    results.set('subjects.select', { data: [candidate(1), candidate(2)] })

    await listSubjectsEnrollableByStudent('st-1')

    const enrolledQuery = calls.find((c) => c.table === 'enrollments')!
    expect(orders(enrolledQuery)).toEqual([['subject_id']])
    expect(enrolledQuery.args.limit).toEqual([2000])
    expect(calls.find((c) => c.table === 'subjects')!.ops).not.toContain('not')
  })

  it('excludes every enrolled subject in memory, even with more than 200 enrollments', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    // The student is enrolled in s0..s249; s250..s259 are the only free candidates.
    const enrolled = Array.from({ length: 250 }, (_, i) => ({ subject_id: `s${i}` }))
    results.set('enrollments.select', { data: enrolled })
    results.set('subjects.select', {
      data: Array.from({ length: 260 }, (_, i) => candidate(i)),
    })

    const res = await listSubjectsEnrollableByStudent('st-1')

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.subjects.map((s) => s.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `s${250 + i}`)
    )
    expect(res.total).toBe(10)
    expect(res.truncated).toBe(false)
  })

  it('returns the first 20 of the filtered candidates with the filtered total', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('enrollments.select', { data: [{ subject_id: 's0' }] })
    results.set('subjects.select', { data: Array.from({ length: 31 }, (_, i) => candidate(i)) })

    const res = await listSubjectsEnrollableByStudent('st-1')

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.subjects).toHaveLength(20)
    expect(res.subjects[0].id).toBe('s1')
    expect(res.total).toBe(30)
  })

  it('flags the list as truncated when the candidate window is full', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('enrollments.select', { data: [] })
    results.set('subjects.select', { data: Array.from({ length: 500 }, (_, i) => candidate(i)) })

    const res = await listSubjectsEnrollableByStudent('st-1')

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.truncated).toBe(true)
    expect(res.subjects).toHaveLength(20)
    expect(res.total).toBe(500)
  })

  it('treats a non-string search as empty', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('enrollments.select', { data: [] })
    results.set('subjects.select', { data: [] })

    const res = await listSubjectsEnrollableByStudent('st-1', { evil: true } as unknown as string)

    expect(res.success).toBe(true)
    expect(calls.find((c) => c.table === 'subjects')!.ops).not.toContain('or')
  })

  it('fails cleanly when a query errors', async () => {
    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('enrollments.select', { data: null, error: { message: 'boom' } })
    expect((await listSubjectsEnrollableByStudent('st-1')).success).toBe(false)

    asAdminWithStudent({ role: 'STUDENT', is_active: true })
    results.set('enrollments.select', { data: [] })
    results.set('subjects.select', { data: null, error: { message: 'boom' } })
    expect((await listSubjectsEnrollableByStudent('st-1')).success).toBe(false)
  })

  it('rejects non-admin callers and non-students', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'p1' } } })
    results.set('profiles.select', [{ data: { role: 'STUDENT' } }])
    expect((await listSubjectsEnrollableByStudent('st-1')).success).toBe(false)

    asAdminWithStudent({ role: 'ADMIN', is_active: true })
    expect((await listSubjectsEnrollableByStudent('u1')).success).toBe(false)
  })
})
