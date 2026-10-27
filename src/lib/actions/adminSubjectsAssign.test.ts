import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assignSubjectsToProfessor, listSubjectsAssignableToProfessor } from './adminSubjects'

interface CallEntry {
  table: string
  ops: string[]
  args: Record<string, unknown[]>
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
      const entry: CallEntry = { table, ops: [], args: {} }
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
              return builder
            }
          },
        }
      )
      return builder
    },
  })),
}))

vi.mock('@/lib/supabase/adminClient', () => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit/auditLog', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a) }))

const subjectRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  code: `C-${id}`,
  is_active: true,
  professor_id: null,
  ...over,
})

function asAdminWithProfessor(professor: { role: string; is_active: boolean } | null) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  results.set('profiles.select', [{ data: { role: 'ADMIN' } }, { data: professor }])
  // Subject and professor share career-1 unless a test overrides these.
  results.set('subject_careers.select', { data: [{ career_id: 'career-1' }] })
  results.set('professor_careers.select', { data: [{ career_id: 'career-1' }] })
}

const subjectUpdates = () => calls.filter((c) => c.table === 'subjects' && c.ops[0] === 'update')

describe('assignSubjectsToProfessor', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    mockGetUser.mockReset()
    mockLogAudit.mockReset()
  })

  it('rejects non-admin callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'p1' } } })
    results.set('profiles.select', [{ data: { role: 'PROFESSOR' } }])

    const res = await assignSubjectsToProfessor('prof-1', ['s1'])

    expect(res.success).toBe(false)
    expect(subjectUpdates()).toHaveLength(0)
  })

  it('rejects a target that is not an active professor', async () => {
    asAdminWithProfessor({ role: 'STUDENT', is_active: true })
    const res = await assignSubjectsToProfessor('u1', ['s1'])
    expect(res.success).toBe(false)
    expect(subjectUpdates()).toHaveLength(0)
  })

  it('rejects an empty selection', async () => {
    asAdminWithProfessor({ role: 'PROFESSOR', is_active: true })
    const res = await assignSubjectsToProfessor('prof-1', [])
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/al menos una/i)
  })

  it('assigns every valid subject and writes one audit entry', async () => {
    asAdminWithProfessor({ role: 'PROFESSOR', is_active: true })
    results.set('subjects.select', { data: [subjectRow('s1'), subjectRow('s2')] })
    results.set('subjects.update', [{ data: [{ id: 's1' }] }, { data: [{ id: 's2' }] }])

    const res = await assignSubjectsToProfessor('prof-1', ['s1', 's2', 's1'])

    expect(res).toEqual({ success: true, assigned: ['s1', 's2'], failures: [] })
    expect(subjectUpdates().map((c) => c.args.update?.[0])).toEqual([
      { professor_id: 'prof-1' },
      { professor_id: 'prof-1' },
    ])
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.assign_subjects',
        entityId: 'prof-1',
        details: expect.objectContaining({ subject_ids: ['s1', 's2'], assigned_count: 2 }),
      })
    )
  })

  it('applies nothing and reports each failing subject when one is not assignable', async () => {
    asAdminWithProfessor({ role: 'PROFESSOR', is_active: true })
    results.set('subjects.select', {
      data: [
        subjectRow('s1'),
        subjectRow('s2', { professor_id: 'other' }),
        subjectRow('s3', { is_active: false }),
      ],
    })

    const res = await assignSubjectsToProfessor('prof-1', ['s1', 's2', 's3', 'missing'])

    expect(res.success).toBe(false)
    expect(res.assigned).toEqual([])
    expect(res.failures.map((f) => [f.subjectId, f.error])).toEqual([
      ['s2', 'La materia ya tiene docente.'],
      ['s3', 'La materia está archivada.'],
      ['missing', 'La materia no existe.'],
    ])
    expect(subjectUpdates()).toHaveLength(0)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('reuses the professor/career rule: no shared career means nothing is assigned', async () => {
    asAdminWithProfessor({ role: 'PROFESSOR', is_active: true })
    results.set('subjects.select', { data: [subjectRow('s1')] })
    results.set('subject_careers.select', { data: [{ career_id: 'career-2' }] })

    const res = await assignSubjectsToProfessor('prof-1', ['s1'])

    expect(res.success).toBe(false)
    expect(res.failures[0]).toMatchObject({ subjectId: 's1' })
    expect(res.failures[0].error).toMatch(/ninguna de las carreras/i)
    expect(subjectUpdates()).toHaveLength(0)
  })

  it('reports a partial outcome explicitly when a concurrent change wins a write', async () => {
    asAdminWithProfessor({ role: 'PROFESSOR', is_active: true })
    results.set('subjects.select', { data: [subjectRow('s1'), subjectRow('s2')] })
    results.set('subjects.update', [{ data: [{ id: 's1' }] }, { data: [] }])

    const res = await assignSubjectsToProfessor('prof-1', ['s1', 's2'])

    expect(res.success).toBe(false)
    expect(res.assigned).toEqual(['s1'])
    expect(res.failures.map((f) => f.subjectId)).toEqual(['s2'])
    expect(res.error).toBe('Se asignaron 1 de 2 materias; revisa las que fallaron.')
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ subject_ids: ['s1'], failed_count: 1 }),
      })
    )
  })
})

describe('listSubjectsAssignableToProfessor', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    mockGetUser.mockReset()
  })

  it('says so when the professor has no careers instead of listing anything', async () => {
    asAdminWithProfessor({ role: 'PROFESSOR', is_active: true })
    results.set('professor_careers.select', { data: [] })

    const res = await listSubjectsAssignableToProfessor('prof-1')

    expect(res).toEqual({ success: true, noCareers: true, subjects: [], total: 0 })
    expect(calls.some((c) => c.table === 'subjects')).toBe(false)
  })

  it('filters by career, free subjects and a sanitized search, limited to one page', async () => {
    asAdminWithProfessor({ role: 'PROFESSOR', is_active: true })
    results.set('subjects.select', {
      data: [
        { id: 's1', code: 'MAT1', name: 'Cálculo', subject_careers: [{ career_id: 'career-1' }] },
      ],
      count: 31,
    })

    const res = await listSubjectsAssignableToProfessor('prof-1', ' MAT,(1)% ')

    expect(res).toEqual({
      success: true,
      noCareers: false,
      subjects: [{ id: 's1', code: 'MAT1', name: 'Cálculo' }],
      total: 31,
    })
    const query = calls.find((c) => c.table === 'subjects')!
    expect(query.args.is).toEqual(['professor_id', null])
    expect(query.args.in).toEqual(['subject_careers.career_id', ['career-1']])
    expect(query.args.or).toEqual(['name.ilike.%MAT1%,code.ilike.%MAT1%'])
    expect(query.args.limit).toEqual([20])
    // Stable order: name, then id as the tie-breaker.
    expect(query.ops.filter((op) => op === 'order')).toHaveLength(2)
    expect(query.args.order).toEqual(['id'])
  })

  it('rejects non-admin callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'p1' } } })
    results.set('profiles.select', [{ data: { role: 'STUDENT' } }])
    expect((await listSubjectsAssignableToProfessor('prof-1')).success).toBe(false)
  })
})
