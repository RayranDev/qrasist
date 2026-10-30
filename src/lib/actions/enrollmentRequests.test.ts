import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  approveAllEnrollmentRequests,
  approveEnrollmentRequest,
  approveEnrollmentRequests,
  rejectEnrollmentRequest,
  rejectEnrollmentRequests,
} from './enrollmentRequests'
import { makeFakeDb } from '@/lib/enrollmentRequests/fakeDb'
import { APPROVE_ALL_MAX, BULK_REVIEW_MAX } from '@/lib/enrollmentRequests/constants'
import type { PendingRequest } from '@/lib/enrollmentRequests/grouping'

const mockGetUser = vi.fn()
const mockFetchPending = vi.fn()
const mockRevalidate = vi.fn()
let db: ReturnType<typeof makeFakeDb>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) =>
      (db.supabase as unknown as { from: (t: string) => unknown }).from(table),
    auth: { getUser: mockGetUser },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => mockRevalidate(path) }))
vi.mock('@/lib/audit/auditLog', () => ({ logAuditMany: vi.fn(), logAudit: vi.fn() }))
// approve-all resuelve las ids con la consulta de la lista: aquí se controla
// qué devuelve; su propio comportamiento se prueba en query.test.ts.
vi.mock('@/lib/enrollmentRequests/query', () => ({
  fetchPendingRequests: (...args: unknown[]) => mockFetchPending(...args),
}))

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const S1 = uid(101)
const S2 = uid(102)
const ME = uid(900)
const request = (n: number, subject = S1, status = 'pending') => ({
  id: uid(n),
  student_id: uid(1000 + n),
  subject_id: subject,
  status,
})

function seed(
  requests: ReturnType<typeof request>[],
  caller: { role: string; is_active: boolean } = { role: 'ADMIN', is_active: true }
) {
  db = makeFakeDb({
    caller,
    requests,
    subjects: [
      { id: S1, professor_id: ME },
      { id: S2, professor_id: uid(901) },
    ],
    subjectCareers: [
      { subject_id: S1, career_id: 'c1', is_active: true },
      { subject_id: S2, career_id: 'c1', is_active: true },
    ],
    studentCareers: requests.map((r) => ({
      student_id: r.student_id,
      career_id: 'c1',
      is_active: true,
    })),
  })
}

const asUser = (id: string | null) =>
  mockGetUser.mockResolvedValue({ data: { user: id ? { id } : null } })

const pending = (r: ReturnType<typeof request>): PendingRequest => ({
  id: r.id,
  requestedAt: '2026-10-01T10:00:00Z',
  studentId: r.student_id,
  studentName: 'Ana',
  studentCode: '1',
  subjectId: r.subject_id,
  subjectName: 'Materia',
  subjectCode: 'M',
})

beforeEach(() => {
  mockGetUser.mockReset()
  mockFetchPending.mockReset()
  mockRevalidate.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('approveEnrollmentRequest (single)', () => {
  it('rejects when the caller is neither admin nor the subject professor', async () => {
    seed([request(1, S2)], { role: 'PROFESSOR', is_active: true })
    asUser(ME)

    const result = await approveEnrollmentRequest(uid(1))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
    expect(db.state.enrollments).toHaveLength(0)
  })

  it('returns an error when the request was already claimed by another reviewer', async () => {
    seed([request(1)])
    asUser(ME)
    db.state.failures.requestsUpdate = () => {
      db.state.requests[0].status = 'rejected'
      return null
    }

    const result = await approveEnrollmentRequest(uid(1))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ya fue revisada/i)
    // No debe haber insertado el enrollment si no logró reclamar la solicitud.
    expect(db.state.enrollments).toHaveLength(0)
  })

  it('approves and enrolls the student', async () => {
    seed([request(1)])
    asUser(ME)

    const result = await approveEnrollmentRequest(uid(1))

    expect(result).toEqual({ success: true })
    expect(db.state.requests[0].status).toBe('approved')
    expect(db.state.enrollments).toHaveLength(1)
    expect(mockRevalidate).toHaveBeenCalledWith('/professor/subjects')
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/enrollment-requests')
  })

  it('reverts the claim when the enrollment insert fails', async () => {
    seed([request(1)])
    asUser(ME)
    db.state.failures.enrollmentsUpsert = { code: '42501', message: 'rls' }
    db.state.failures.enrollmentsInsert = () => ({ code: '42501', message: 'rls' })

    const result = await approveEnrollmentRequest(uid(1))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no se pudo aprobar/i)
    expect(db.state.requests[0].status).toBe('pending')
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    seed([request(1)])
    asUser(null)

    expect((await approveEnrollmentRequest(uid(1))).error).toMatch(/no autenticado/i)
  })
})

describe('rejectEnrollmentRequest (single)', () => {
  it('rejects when the caller is neither admin nor the subject professor', async () => {
    seed([request(1, S2)], { role: 'PROFESSOR', is_active: true })
    asUser(ME)

    const result = await rejectEnrollmentRequest(uid(1))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
  })

  it('allows the owning professor to reject the request', async () => {
    seed([request(1)], { role: 'PROFESSOR', is_active: true })
    asUser(ME)

    expect((await rejectEnrollmentRequest(uid(1))).success).toBe(true)
    expect(db.state.requests[0].status).toBe('rejected')
  })

  it('allows an admin to reject a request for a subject they do not own', async () => {
    seed([request(1, S2)])
    asUser(uid(777))

    expect((await rejectEnrollmentRequest(uid(1))).success).toBe(true)
  })

  it('denies a deactivated professor even if they own the subject', async () => {
    seed([request(1)], { role: 'PROFESSOR', is_active: false })
    asUser(ME)

    const result = await rejectEnrollmentRequest(uid(1))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
  })

  it('denies a deactivated admin', async () => {
    seed([request(1)], { role: 'ADMIN', is_active: false })
    asUser(uid(777))

    const result = await rejectEnrollmentRequest(uid(1))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
  })
})

describe('approveEnrollmentRequests (bulk)', () => {
  it('requires a session', async () => {
    seed([request(1)])
    asUser(null)

    const result = await approveEnrollmentRequests([uid(1)])

    expect(result).toMatchObject({ success: false, approved: [], failures: [] })
  })

  it('refuses an empty selection', async () => {
    seed([])
    asUser(ME)

    expect((await approveEnrollmentRequests([])).success).toBe(false)
    expect((await approveEnrollmentRequests(undefined as unknown as string[])).success).toBe(false)
  })

  it('caps one call at BULK_REVIEW_MAX requests and touches nothing when exceeded', async () => {
    const requests = Array.from({ length: BULK_REVIEW_MAX + 1 }, (_, i) => request(i + 1))
    seed(requests)
    asUser(ME)

    const result = await approveEnrollmentRequests(requests.map((r) => r.id))

    expect(result.success).toBe(false)
    expect(result.error).toContain(String(BULK_REVIEW_MAX))
    expect(db.calls).toHaveLength(0)
  })

  it('accepts exactly BULK_REVIEW_MAX requests', async () => {
    const requests = Array.from({ length: BULK_REVIEW_MAX }, (_, i) => request(i + 1))
    seed(requests)
    asUser(ME)

    const result = await approveEnrollmentRequests(requests.map((r) => r.id))

    expect(result.success).toBe(true)
    expect(result.approved).toHaveLength(BULK_REVIEW_MAX)
  })

  it('dedupes repeated ids before applying the cap', async () => {
    seed([request(1)])
    asUser(ME)

    const result = await approveEnrollmentRequests(Array(BULK_REVIEW_MAX + 50).fill(uid(1)))

    expect(result.success).toBe(true)
    expect(result.approved).toEqual([uid(1)])
    expect(db.state.enrollments).toHaveLength(1)
  })

  it('checks permission per request: a professor cannot approve other subjects', async () => {
    seed([request(1, S1), request(2, S2)], { role: 'PROFESSOR', is_active: true })
    asUser(ME)

    const result = await approveEnrollmentRequests([uid(1), uid(2)])

    expect(result.success).toBe(true)
    expect(result.approved).toEqual([uid(1)])
    expect(result.failures).toEqual([
      { id: uid(2), message: 'No tienes permiso para revisar esta solicitud.' },
    ])
    expect(db.state.requests.find((r) => r.id === uid(2))?.status).toBe('pending')
  })

  it('returns the per-id outcome of a partial failure and revalidates the pages', async () => {
    seed([request(1), request(2)])
    asUser(ME)
    db.state.studentCareers = [
      { student_id: uid(1001), career_id: 'c1', is_active: true },
      // el estudiante 2 no tiene carrera
    ]

    const result = await approveEnrollmentRequests([uid(1), uid(2)])

    expect(result.approved).toEqual([uid(1)])
    expect(result.failures).toEqual([
      { id: uid(2), message: 'El estudiante no tiene ninguna carrera asignada.' },
    ])
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/enrollment-requests')
  })

  it('does not revalidate when nothing was approved', async () => {
    seed([request(1, S2)], { role: 'PROFESSOR', is_active: true })
    asUser(ME)

    await approveEnrollmentRequests([uid(1)])

    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('reverts the claim of a request whose enrollment failed and reports it', async () => {
    seed([request(1), request(2)])
    asUser(ME)
    db.state.failures.enrollmentsUpsert = { code: '42501', message: 'rls' }
    db.state.failures.enrollmentsInsert = (row) =>
      row.student_id === uid(1002) ? { code: '42501', message: 'rls' } : null

    const result = await approveEnrollmentRequests([uid(1), uid(2)])

    expect(result.approved).toEqual([uid(1)])
    expect(result.failures).toEqual([{ id: uid(2), message: 'No se pudo aprobar la solicitud.' }])
    expect(db.state.requests.find((r) => r.id === uid(2))?.status).toBe('pending')
  })

  it('tolerates a student who was already enrolled (23505)', async () => {
    seed([request(1)])
    asUser(ME)
    db.state.enrollments = [{ student_id: uid(1001), subject_id: S1 }]

    const result = await approveEnrollmentRequests([uid(1)])

    expect(result.approved).toEqual([uid(1)])
    expect(result.failures).toEqual([])
  })
})

describe('rejectEnrollmentRequests (bulk)', () => {
  it('rejects a batch and enforces the cap', async () => {
    const requests = Array.from({ length: BULK_REVIEW_MAX + 1 }, (_, i) => request(i + 1))
    seed(requests)
    asUser(ME)

    expect((await rejectEnrollmentRequests(requests.map((r) => r.id))).success).toBe(false)

    const ok = await rejectEnrollmentRequests([uid(1), uid(2)])
    expect(ok.rejected).toEqual([uid(1), uid(2)])
  })

  it('checks permission per request', async () => {
    seed([request(1, S1), request(2, S2)], { role: 'PROFESSOR', is_active: true })
    asUser(ME)

    const result = await rejectEnrollmentRequests([uid(1), uid(2)])

    expect(result.rejected).toEqual([uid(1)])
    expect(result.failures[0].id).toBe(uid(2))
  })
})

describe('approveAllEnrollmentRequests', () => {
  it('resolves the ids server-side with the sanitized filters, scoped to everything for an admin', async () => {
    const requests = [request(1), request(2), request(3)]
    seed(requests)
    asUser(ME)
    mockFetchPending.mockResolvedValue({
      requests: requests.map(pending),
      total: 3,
      truncated: false,
      error: false,
    })

    const result = await approveAllEnrollmentRequests({
      q: ' ana,(x) ',
      career: 'not-a-uuid',
      subjectId: S1,
    })

    expect(mockFetchPending).toHaveBeenCalledTimes(1)
    const input = mockFetchPending.mock.calls[0][1]
    expect(input.scope).toEqual({})
    expect(input.filters).toEqual({ q: 'anax', career: undefined, subjectId: S1 })
    expect(result).toMatchObject({ success: true, total: 3, remaining: 0, truncated: false })
    expect(result.approved).toEqual(requests.map((r) => r.id))
    expect(db.state.requests.every((r) => r.status === 'approved')).toBe(true)
  })

  it('scopes a professor to their own subjects and still checks permission per request', async () => {
    const mine = request(1, S1)
    const other = request(2, S2)
    seed([mine, other], { role: 'PROFESSOR', is_active: true })
    asUser(ME)
    // Aunque la consulta devolviera una ajena, el permiso por solicitud la frena.
    mockFetchPending.mockResolvedValue({
      requests: [pending(mine), pending(other)],
      total: 2,
      truncated: false,
      error: false,
    })

    const result = await approveAllEnrollmentRequests({})

    expect(mockFetchPending.mock.calls[0][1].scope).toEqual({ professorId: ME })
    expect(result.approved).toEqual([mine.id])
    expect(result.failures).toEqual([
      { id: other.id, message: 'No tienes permiso para revisar esta solicitud.' },
    ])
  })

  it('approves at most APPROVE_ALL_MAX per operation, oldest first, and reports the rest', async () => {
    const total = APPROVE_ALL_MAX + 150
    const requests = Array.from({ length: total }, (_, i) => request(i + 1))
    seed(requests)
    asUser(ME)
    mockFetchPending.mockResolvedValue({
      requests: requests.map(pending),
      total,
      truncated: false,
      error: false,
    })

    const result = await approveAllEnrollmentRequests({})

    expect(result.approved).toHaveLength(APPROVE_ALL_MAX)
    expect(result.approved[0]).toBe(requests[0].id)
    expect(result.approved.at(-1)).toBe(requests[APPROVE_ALL_MAX - 1].id)
    expect(result.remaining).toBe(150)
    expect(result.total).toBe(total)
    expect(db.state.requests.filter((r) => r.status === 'pending')).toHaveLength(150)
    // Lotes de BULK_REVIEW_MAX: una consulta de lectura de solicitudes por lote.
    const loads = db.calls.filter((c) => c.table === 'enrollment_requests' && c.op === 'select')
    expect(loads).toHaveLength(APPROVE_ALL_MAX / BULK_REVIEW_MAX)
    expect(loads.every((c) => (c.filters[0].value as string[]).length <= BULK_REVIEW_MAX)).toBe(
      true
    )
  })

  it('passes along that the scan was truncated so the count is a lower bound', async () => {
    const requests = [request(1)]
    seed(requests)
    asUser(ME)
    mockFetchPending.mockResolvedValue({
      requests: requests.map(pending),
      total: 5000,
      truncated: true,
      error: false,
    })

    const result = await approveAllEnrollmentRequests({})

    expect(result.truncated).toBe(true)
    expect(result.remaining).toBe(4999)
  })

  it('reports per-id failures across batches', async () => {
    const requests = Array.from({ length: 3 }, (_, i) => request(i + 1))
    seed(requests)
    asUser(ME)
    db.state.studentCareers = db.state.studentCareers.slice(0, 2)
    mockFetchPending.mockResolvedValue({
      requests: requests.map(pending),
      total: 3,
      truncated: false,
      error: false,
    })

    const result = await approveAllEnrollmentRequests({})

    expect(result.approved).toHaveLength(2)
    expect(result.failures).toEqual([
      { id: uid(3), message: 'El estudiante no tiene ninguna carrera asignada.' },
    ])
  })

  it('does nothing when nothing matches', async () => {
    seed([])
    asUser(ME)
    mockFetchPending.mockResolvedValue({ requests: [], total: 0, truncated: false, error: false })

    const result = await approveAllEnrollmentRequests({})

    expect(result).toMatchObject({ success: true, approved: [], total: 0, remaining: 0 })
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('fails without approving anything when the list cannot be loaded', async () => {
    seed([request(1)])
    asUser(ME)
    mockFetchPending.mockResolvedValue({
      requests: [],
      total: 0,
      truncated: false,
      error: true,
    })

    const result = await approveAllEnrollmentRequests({})

    expect(result.success).toBe(false)
    expect(db.state.requests[0].status).toBe('pending')
  })

  it('requires a session', async () => {
    seed([request(1)])
    asUser(null)

    expect((await approveAllEnrollmentRequests({})).success).toBe(false)
    expect(mockFetchPending).not.toHaveBeenCalled()
  })
})
