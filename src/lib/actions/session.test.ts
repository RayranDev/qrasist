import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSession } from './session'

const mockGetUser = vi.fn()
const mockCheckSubjectProfessor = vi.fn()
const mockSettingsMaybeSingle = vi.fn()
const mockSchedulesResult = vi.fn()
const mockInsert = vi.fn()
const mockInsertSingle = vi.fn()

function chain(terminal: Record<string, unknown> = {}) {
  const c: Record<string, unknown> = {}
  for (const method of ['select', 'eq']) {
    c[method] = vi.fn(() => c)
  }
  return Object.assign(c, terminal)
}

vi.mock('./authGuards', () => ({
  checkSubjectProfessor: (...args: unknown[]) => mockCheckSubjectProfessor(...args),
}))

// Since migration 028 professors have no write policy on `sessions`, so the
// insert must go through the service-role client, never the user client.
vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table !== 'sessions') throw new Error(`unexpected admin table in test: ${table}`)
      return {
        insert: vi.fn((row: unknown) => {
          mockInsert(row)
          return { select: vi.fn(() => ({ single: mockInsertSingle })) }
        }),
      }
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'app_settings') return chain({ maybeSingle: mockSettingsMaybeSingle })
      if (table === 'subject_schedules') {
        // awaited directly after .eq(...)
        const c = chain()
        c.eq = vi.fn(() => mockSchedulesResult())
        return c
      }
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

const NOW = new Date('2026-03-02T13:20:00Z') // Monday 08:20 in Bogota

describe('createSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockGetUser.mockReset()
    mockCheckSubjectProfessor.mockReset()
    mockSettingsMaybeSingle.mockReset()
    mockSchedulesResult.mockReset()
    mockInsert.mockReset()
    mockInsertSingle.mockReset()

    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockCheckSubjectProfessor.mockResolvedValue(true)
    mockSettingsMaybeSingle.mockResolvedValue({
      data: { registration_window_minutes: 5, default_class_minutes: 120 },
    })
    mockSchedulesResult.mockResolvedValue({ data: [] })
    mockInsertSingle.mockResolvedValue({
      data: { id: 'session-1', qr_token: 'abc', expires_at: 'x' },
      error: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects an out-of-range rotation without touching the database', async () => {
    const result = await createSession('subject-1', undefined, 500)

    expect(result.success).toBe(false)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('rejects a non-finite rotation', async () => {
    const result = await createSession('subject-1', undefined, NaN)

    expect(result.success).toBe(false)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the caller does not own the subject', async () => {
    mockCheckSubjectProfessor.mockResolvedValue(false)

    const result = await createSession('subject-1')

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('takes the registration window from app_settings, not from the caller', async () => {
    mockSettingsMaybeSingle.mockResolvedValue({
      data: { registration_window_minutes: 8, default_class_minutes: 120 },
    })

    const result = await createSession('subject-1')

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(result.registrationWindowMinutes).toBe(8)
    const row = mockInsert.mock.calls[0][0]
    expect(row.duration_minutes).toBe(8)
    expect(row.expires_at).toBe('2026-03-02T13:28:00.000Z')
  })

  it('falls back to the default 5 minute window when settings are unavailable', async () => {
    mockSettingsMaybeSingle.mockResolvedValue({ data: null })

    await createSession('subject-1')

    expect(mockInsert.mock.calls[0][0].expires_at).toBe('2026-03-02T13:25:00.000Z')
  })

  it('ends the class at the schedule block end when the session starts inside a block', async () => {
    mockSchedulesResult.mockResolvedValue({
      data: [{ day_of_week: 1, start_time: '08:00:00', end_time: '10:00:00' }],
    })

    await createSession('subject-1')

    expect(mockInsert.mock.calls[0][0].class_ends_at).toBe('2026-03-02T15:00:00.000Z')
  })

  it('ends the class default_class_minutes after the start when no block matches', async () => {
    mockSettingsMaybeSingle.mockResolvedValue({
      data: { registration_window_minutes: 5, default_class_minutes: 90 },
    })

    await createSession('subject-1')

    expect(mockInsert.mock.calls[0][0].class_ends_at).toBe('2026-03-02T14:50:00.000Z')
  })

  describe('modality and makeup reason', () => {
    it('rejects a makeup session with no reason at all, without touching the database', async () => {
      const result = await createSession('subject-1', undefined, 20, { isMakeup: true })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/motivo/i)
      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('rejects a makeup session whose reason is below the minimum length', async () => {
      const result = await createSession('subject-1', undefined, 20, {
        isMakeup: true,
        makeupReason: 'abc',
      })

      expect(result.success).toBe(false)
      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('does not require a reason when the session is not a makeup', async () => {
      const result = await createSession('subject-1', undefined, 20, {
        modality: 'VIRTUAL',
        isMakeup: false,
      })

      expect(result.success).toBe(true)
    })

    it('accepts a makeup session once the reason meets the minimum length', async () => {
      const result = await createSession('subject-1', undefined, 20, {
        modality: 'PRESENCIAL',
        isMakeup: true,
        makeupReason: 'Clase reprogramada por paro',
      })

      expect(result.success).toBe(true)
      expect(mockInsert.mock.calls[0][0].makeup_reason).toBe('Clase reprogramada por paro')
    })
  })
})
