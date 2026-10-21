import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { registerAttendance } from './attendance'

const TOKEN = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'
const NOW = new Date('2026-03-02T13:59:00Z') // Monday 08:59 in Bogota

const mockGetUser = vi.fn()
const mockProfile = vi.fn()
const mockSubject = vi.fn()
const mockEnrollment = vi.fn()
const mockExistingToday = vi.fn()
const mockSessionLookup = vi.fn()
const mockAdminInsert = vi.fn()
const mockInsertResult = vi.fn()
const mockUserAttendanceWrite = vi.fn()
const mockRateLimit = vi.fn()

function chain(terminal: Record<string, unknown>) {
  const c: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'gte', 'lte', 'or']) {
    c[method] = vi.fn(() => c)
  }
  return Object.assign(c, terminal)
}

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => '203.0.113.7' })),
}))

vi.mock('@/lib/utils/rateLimiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))

// The attendance INSERT must go through the service role: after migration
// 031 `attendances` has no INSERT policy, and the session lookup reads
// qr_token, which user JWTs cannot select.
vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table === 'sessions') return chain({ single: () => mockSessionLookup() })
      if (table === 'attendances') {
        return {
          insert: vi.fn(async (row: unknown) => {
            mockAdminInsert(row)
            return mockInsertResult()
          }),
        }
      }
      throw new Error(`unexpected admin table in test: ${table}`)
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return chain({ single: () => mockProfile() })
      if (table === 'subjects') return chain({ single: () => mockSubject() })
      if (table === 'enrollments') return chain({ maybeSingle: () => mockEnrollment() })
      if (table === 'attendances') {
        // Only the duplicate-day lookup is allowed here; any write attempt
        // with the user client is a regression.
        const c = chain({ maybeSingle: () => mockExistingToday() })
        c.insert = vi.fn(() => mockUserAttendanceWrite('insert'))
        c.update = vi.fn(() => mockUserAttendanceWrite('update'))
        c.delete = vi.fn(() => mockUserAttendanceWrite('delete'))
        return c
      }
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

function openSession(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'session-1',
      subject_id: 'subject-1',
      date: new Date(NOW.getTime() - 60_000).toISOString(),
      expires_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
      is_active: true,
      qr_token: TOKEN,
      ...overrides,
    },
    error: null,
  }
}

describe('registerAttendance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    for (const mock of [
      mockGetUser,
      mockProfile,
      mockSubject,
      mockEnrollment,
      mockExistingToday,
      mockSessionLookup,
      mockAdminInsert,
      mockInsertResult,
      mockUserAttendanceWrite,
      mockRateLimit,
    ]) {
      mock.mockReset()
    }
    mockGetUser.mockResolvedValue({ data: { user: { id: 'student-1' } }, error: null })
    mockProfile.mockResolvedValue({ data: { role: 'STUDENT', is_active: true } })
    mockRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    mockSessionLookup.mockResolvedValue(openSession())
    mockSubject.mockResolvedValue({
      data: { name: 'Algoritmos', code: 'ALG', is_active: true, late_after_minutes: null },
    })
    mockEnrollment.mockResolvedValue({ data: { id: 'enrollment-1' } })
    mockExistingToday.mockResolvedValue({ data: null })
    mockInsertResult.mockReturnValue({ error: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('inserts the attendance with the service role, deriving ids from the server side', async () => {
    const result = await registerAttendance(TOKEN, { latitude: 4.6, longitude: -74.1 })

    expect(result.ok).toBe(true)
    expect(mockAdminInsert).toHaveBeenCalledTimes(1)
    expect(mockAdminInsert).toHaveBeenCalledWith({
      session_id: 'session-1',
      student_id: 'student-1',
      ip_address: '203.0.113.7',
      latitude: 4.6,
      longitude: -74.1,
      status: 'PRESENT',
    })
    expect(mockUserAttendanceWrite).not.toHaveBeenCalled()
  })

  it('formats the confirmation time in America/Bogota, not UTC', async () => {
    const result = await registerAttendance(TOKEN)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 13:59 UTC is 08:59 in Bogota.
    expect(result.data.time).toMatch(/^08:59\sa\.\sm\.$/)
    expect(result.data.time).not.toMatch(/01:59/)
  })

  it('marks the scan as LATE once the subject threshold has passed', async () => {
    mockSubject.mockResolvedValue({
      data: { name: 'Algoritmos', code: 'ALG', is_active: true, late_after_minutes: 0 },
    })

    const result = await registerAttendance(TOKEN)

    expect(result.ok && result.data.isLate).toBe(true)
    expect(mockAdminInsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'LATE' }))
  })

  it('registers a non-enrolled student as a guest', async () => {
    mockEnrollment.mockResolvedValue({ data: null })

    const result = await registerAttendance(TOKEN)

    expect(result.ok && result.data.isGuest).toBe(true)
    expect(mockAdminInsert).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed token without querying or inserting', async () => {
    const result = await registerAttendance('not-a-uuid')

    expect(result).toMatchObject({ ok: false, code: 'INVALID' })
    expect(mockSessionLookup).not.toHaveBeenCalled()
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects a token that does not belong to any session', async () => {
    mockSessionLookup.mockResolvedValue({ data: null, error: { message: 'no rows' } })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'INVALID' })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects an expired registration window', async () => {
    mockSessionLookup.mockResolvedValue(
      openSession({ expires_at: new Date(NOW.getTime() - 1000).toISOString() })
    )

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'EXPIRED' })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects a closed session (token cleared)', async () => {
    mockSessionLookup.mockResolvedValue(openSession({ qr_token: null }))

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'EXPIRED' })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects an archived session', async () => {
    mockSessionLookup.mockResolvedValue(openSession({ is_active: false }))

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'INACTIVE' })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects an archived subject', async () => {
    mockSubject.mockResolvedValue({
      data: { name: 'Algoritmos', code: 'ALG', is_active: false, late_after_minutes: null },
    })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'INACTIVE' })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects a second scan for a different session of the same subject on the same day', async () => {
    mockExistingToday.mockResolvedValue({
      data: {
        id: 'attendance-1',
        session_id: 'session-0',
        scanned_at: new Date(NOW.getTime() - 10_000).toISOString(),
        status: 'PRESENT',
      },
    })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'DUPLICATE' })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects a second scan for the same session once the retry window has passed', async () => {
    mockExistingToday.mockResolvedValue({
      data: {
        id: 'attendance-1',
        session_id: 'session-1',
        scanned_at: new Date(NOW.getTime() - 3 * 60_000).toISOString(),
        status: 'PRESENT',
      },
    })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'DUPLICATE' })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('answers a recent resend for the same session with the original registration', async () => {
    // Original scan at 08:58:30 Bogota; the resend arrives 30 s later.
    mockExistingToday.mockResolvedValue({
      data: {
        id: 'attendance-1',
        session_id: 'session-1',
        scanned_at: new Date(NOW.getTime() - 30_000).toISOString(),
        status: 'PRESENT',
      },
    })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({
      ok: true,
      data: { subjectName: 'Algoritmos', subjectCode: 'ALG', isGuest: false, isLate: false },
    })
    if (!result.ok) return
    expect(result.data.time).toMatch(/^08:58\sa\.\sm\.$/)
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('keeps the LATE status and guest flag when answering a resend', async () => {
    mockEnrollment.mockResolvedValue({ data: null })
    mockExistingToday.mockResolvedValue({
      data: {
        id: 'attendance-1',
        session_id: 'session-1',
        scanned_at: new Date(NOW.getTime() - 5_000).toISOString(),
        status: 'LATE',
      },
    })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: true, data: { isGuest: true, isLate: true } })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('maps a unique-violation from the insert to DUPLICATE', async () => {
    mockInsertResult.mockReturnValue({ error: { code: '23505' } })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'DUPLICATE' })
  })

  it('answers a concurrent double submit (unique-violation) with the winner registration', async () => {
    mockInsertResult.mockReturnValue({ error: { code: '23505' } })
    // The pre-check sees nothing; after the lost race the winner row exists.
    mockExistingToday.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({
      data: {
        id: 'attendance-1',
        session_id: 'session-1',
        scanned_at: new Date(NOW.getTime() - 1_000).toISOString(),
        status: 'PRESENT',
      },
    })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: true, data: { subjectCode: 'ALG', isLate: false } })
    expect(mockAdminInsert).toHaveBeenCalledTimes(1)
  })

  it('reports a SERVER_ERROR when the insert fails for another reason', async () => {
    mockInsertResult.mockReturnValue({ error: { code: '42501' } })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'SERVER_ERROR' })
  })

  it('does not let professors, admins or deactivated students register attendance', async () => {
    for (const profile of [
      { role: 'PROFESSOR', is_active: true },
      { role: 'ADMIN', is_active: true },
      { role: 'STUDENT', is_active: false },
    ]) {
      mockProfile.mockResolvedValue({ data: profile })

      const result = await registerAttendance(TOKEN)

      expect(result.ok).toBe(false)
    }
    expect(mockSessionLookup).not.toHaveBeenCalled()
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated callers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' })
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('keeps a strict per-user limit and a classroom-sized per-IP limit', async () => {
    await registerAttendance(TOKEN)

    expect(mockRateLimit).toHaveBeenCalledWith('scan:user:student-1', {
      maxAttempts: 10,
      windowMs: 60_000,
    })
    // ~40 students share the campus NAT and scan within the same minute.
    expect(mockRateLimit).toHaveBeenCalledWith('scan:ip:203.0.113.7', {
      maxAttempts: 200,
      windowMs: 60_000,
    })
  })

  it('stops at the rate limiter before touching the database', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 12 })

    const result = await registerAttendance(TOKEN)

    expect(result).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(mockSessionLookup).not.toHaveBeenCalled()
  })
})
