import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isLocationCaptureRequired } from './attendancePreflight'

const TOKEN = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'
const NOW = new Date('2026-03-02T13:59:00Z')

const mockGetUser = vi.fn()
const mockProfile = vi.fn()
const mockSessionLookup = vi.fn()
const mockRateLimit = vi.fn()

function chain(terminal: Record<string, unknown>) {
  const c: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'or']) c[method] = vi.fn(() => c)
  return Object.assign(c, terminal)
}

vi.mock('@/lib/utils/rateLimiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table === 'sessions') return chain({ single: () => mockSessionLookup() })
      throw new Error(`unexpected admin table in test: ${table}`)
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return chain({ single: () => mockProfile() })
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

function session(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      is_active: true,
      qr_token: TOKEN,
      expires_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
      modality: 'PRESENCIAL',
      ...overrides,
    },
    error: null,
  }
}

describe('isLocationCaptureRequired', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    for (const m of [mockGetUser, mockProfile, mockSessionLookup, mockRateLimit]) m.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'student-1' } }, error: null })
    mockProfile.mockResolvedValue({ data: { role: 'STUDENT', is_active: true } })
    mockRateLimit.mockResolvedValue({ allowed: true })
    mockSessionLookup.mockResolvedValue(session())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is true for an in-person class and for a legacy class without modality', async () => {
    expect(await isLocationCaptureRequired(TOKEN)).toBe(true)
    mockSessionLookup.mockResolvedValue(session({ modality: null }))
    expect(await isLocationCaptureRequired(TOKEN)).toBe(true)
  })

  it('is false for a virtual class', async () => {
    mockSessionLookup.mockResolvedValue(session({ modality: 'VIRTUAL' }))
    expect(await isLocationCaptureRequired(TOKEN)).toBe(false)
  })

  it('is false for any failure, so the real error comes from registerAttendance', async () => {
    expect(await isLocationCaptureRequired('not-a-uuid')).toBe(false)

    mockSessionLookup.mockResolvedValue({ data: null, error: { message: 'no rows' } })
    expect(await isLocationCaptureRequired(TOKEN)).toBe(false)

    mockSessionLookup.mockResolvedValue(session({ is_active: false }))
    expect(await isLocationCaptureRequired(TOKEN)).toBe(false)

    mockSessionLookup.mockResolvedValue(session({ qr_token: null }))
    expect(await isLocationCaptureRequired(TOKEN)).toBe(false)

    mockSessionLookup.mockResolvedValue(
      session({ expires_at: new Date(NOW.getTime() - 1000).toISOString() })
    )
    expect(await isLocationCaptureRequired(TOKEN)).toBe(false)

    mockSessionLookup.mockRejectedValue(new Error('db down'))
    expect(await isLocationCaptureRequired(TOKEN)).toBe(false)
  })

  it('is false for unauthenticated callers and for accounts that cannot register attendance', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'no session' } })
    expect(await isLocationCaptureRequired(TOKEN)).toBe(false)

    for (const profile of [
      { role: 'PROFESSOR', is_active: true },
      { role: 'ADMIN', is_active: true },
      { role: 'STUDENT', is_active: false },
    ]) {
      mockProfile.mockResolvedValue({ data: profile })
      expect(await isLocationCaptureRequired(TOKEN)).toBe(false)
    }
    expect(mockSessionLookup).not.toHaveBeenCalled()
  })

  it('has its own per-user limit and never keys a limit by IP', async () => {
    await isLocationCaptureRequired(TOKEN)
    expect(mockRateLimit).toHaveBeenCalledTimes(1)
    expect(mockRateLimit).toHaveBeenCalledWith('scan-preflight:user:student-1', {
      maxAttempts: 20,
      windowMs: 60_000,
    })

    mockRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 9 })
    mockSessionLookup.mockClear()
    expect(await isLocationCaptureRequired(TOKEN)).toBe(false)
    expect(mockSessionLookup).not.toHaveBeenCalled()
  })
})
