import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRoleChangeImpact, updateUserRole } from './admin'

interface CallEntry {
  table: string
  ops: string[]
  args: Record<string, unknown[]>
}

type Result = { data?: unknown; error?: unknown; count?: number | null }

const calls: CallEntry[] = []
const mockGetUser = vi.fn()
const mockLogAudit = vi.fn()
// Results for `from(table)` chains, keyed by "table.firstOp". Arrays are consumed in
// order (profiles.select is read twice: admin check, then the previous role).
const results = new Map<string, Result | Result[]>()

function resolveResult(entry: CallEntry): Result {
  const key = `${entry.table}.${entry.ops[0]}`
  const configured = results.get(key)
  if (Array.isArray(configured)) return configured.shift() ?? { data: null, error: null }
  return configured ?? { data: null, error: null, count: 0 }
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

function asAdmin(previousRole: string | null) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  results.set('profiles.select', [
    { data: { role: 'ADMIN' } }, // verifyAdminAccess
    { data: previousRole ? { role: previousRole } : null }, // previous role
  ])
}

const tablesTouched = (op: string) =>
  calls.filter((c) => c.ops.includes(op)).map((c) => `${c.table}`)

describe('updateUserRole', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    mockGetUser.mockReset()
    mockLogAudit.mockReset()
  })

  it('rejects non-admin callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'p1' } } })
    results.set('profiles.select', [{ data: { role: 'PROFESSOR' } }])

    const res = await updateUserRole('u1', 'PROFESSOR')

    expect(res.success).toBe(false)
    expect(tablesTouched('update')).toEqual([])
  })

  it('keeps the self-demotion guard', async () => {
    asAdmin('ADMIN')
    const res = await updateUserRole('admin-1', 'STUDENT')
    expect(res.success).toBe(false)
    expect(tablesTouched('update')).toEqual([])
  })

  it('removes enrollments and cancels pending requests when a student is promoted', async () => {
    asAdmin('STUDENT')
    results.set('profiles.update', { error: null })
    results.set('enrollment_requests.update', { data: [{ id: 'r1' }], error: null })
    results.set('enrollments.delete', {
      data: [{ subject_id: 's1' }, { subject_id: 's2' }],
      error: null,
    })

    const res = await updateUserRole('u1', 'PROFESSOR', { unenroll: false })

    expect(res).toEqual({ success: true, enrollmentsRemoved: 2 })
    expect(tablesTouched('delete')).toEqual(['enrollments'])
    const requestUpdate = calls.find((c) => c.table === 'enrollment_requests')
    expect(requestUpdate?.args.update?.[0]).toMatchObject({
      status: 'rejected',
      reviewed_by: 'admin-1',
    })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.role_change',
        details: expect.objectContaining({
          role_before: 'STUDENT',
          role_after: 'PROFESSOR',
          enrollments_removed: 2,
          enrollment_subject_ids: ['s1', 's2'],
          pending_requests_cancelled: 1,
          unenroll_confirmed: false,
        }),
      })
    )
  })

  it('does not touch enrollments when the previous role was not STUDENT', async () => {
    asAdmin('PROFESSOR')
    results.set('profiles.update', { error: null })

    const res = await updateUserRole('u1', 'STUDENT')

    expect(res.success).toBe(true)
    expect(tablesTouched('delete')).toEqual([])
    expect(calls.some((c) => c.table === 'enrollment_requests')).toBe(false)
    const details = mockLogAudit.mock.calls[0][0].details
    expect(details).toEqual({ role_before: 'PROFESSOR', role_after: 'STUDENT' })
  })

  it('reverts the role when the enrollment cleanup fails', async () => {
    asAdmin('STUDENT')
    results.set('profiles.update', [{ error: null }, { error: null }])
    results.set('enrollment_requests.update', { data: [], error: null })
    results.set('enrollments.delete', { data: null, error: { message: 'boom' } })

    const res = await updateUserRole('u1', 'PROFESSOR')

    expect(res.success).toBe(false)
    const profileUpdates = calls
      .filter((c) => c.table === 'profiles' && c.ops[0] === 'update')
      .map((c) => c.args.update?.[0])
    expect(profileUpdates).toEqual([{ role: 'PROFESSOR' }, { role: 'STUDENT' }])
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})

describe('getRoleChangeImpact', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    mockGetUser.mockReset()
  })

  it('lists enrollments and pending requests for a student leaving the role', async () => {
    asAdmin('STUDENT')
    results.set('enrollments.select', {
      data: [{ subject: { code: 'MAT1', name: 'Cálculo' } }, { subject: null }],
      count: 12,
      error: null,
    })
    results.set('enrollment_requests.select', { count: 2, error: null })

    const res = await getRoleChangeImpact('u1', 'PROFESSOR')

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.impact.currentRole).toBe('STUDENT')
    expect(res.impact.enrollments).toEqual({
      total: 12,
      subjects: [{ code: 'MAT1', name: 'Cálculo' }],
    })
    expect(res.impact.pendingRequests).toBe(2)
    expect(res.impact.taughtSubjects.total).toBe(0)
  })

  it('lists taught subjects for a professor leaving the role', async () => {
    asAdmin('PROFESSOR')
    results.set('subjects.select', {
      data: [{ code: 'FIS1', name: 'Física' }],
      count: 1,
      error: null,
    })

    const res = await getRoleChangeImpact('u1', 'STUDENT')

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.impact.taughtSubjects).toEqual({
      total: 1,
      subjects: [{ code: 'FIS1', name: 'Física' }],
    })
    expect(calls.some((c) => c.table === 'enrollments')).toBe(false)
  })

  it('returns an empty impact when nothing is lost', async () => {
    asAdmin('ADMIN')

    const res = await getRoleChangeImpact('u1', 'PROFESSOR')

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.impact.enrollments.total).toBe(0)
    expect(res.impact.taughtSubjects.total).toBe(0)
  })

  it('rejects non-admin callers and invalid roles', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'p1' } } })
    results.set('profiles.select', [{ data: { role: 'STUDENT' } }])
    expect((await getRoleChangeImpact('u1', 'PROFESSOR')).success).toBe(false)

    asAdmin('STUDENT')
    expect((await getRoleChangeImpact('u1', 'HACKER' as unknown as 'ADMIN')).success).toBe(false)
  })
})
