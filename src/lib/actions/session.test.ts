import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { closeSession, createSession, refreshSessionQrToken } from './session'

const mockGetUser = vi.fn()
const mockCheckSubjectProfessor = vi.fn()
const mockSettingsMaybeSingle = vi.fn()
const mockSchedulesResult = vi.fn()
const mockInsert = vi.fn()
const mockInsertSingle = vi.fn()
const mockSessionSingle = vi.fn()
const mockAdminUpdate = vi.fn()
const mockSuspendedToday = vi.fn()
const mockKeptAttendances = vi.fn()
const mockMoveUpdate = vi.fn()
const mockLogAudit = vi.fn()

function chain(terminal: Record<string, unknown> = {}) {
  const c: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'not', 'gte', 'lte']) {
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
      if (table === 'attendances') {
        return {
          select: vi.fn(() => ({ in: vi.fn(async () => mockKeptAttendances()) })),
          update: vi.fn((values: unknown) => ({
            in: vi.fn(async (...args: unknown[]) => {
              mockMoveUpdate(values, ...args)
              return { error: null }
            }),
          })),
        }
      }
      if (table !== 'sessions') throw new Error(`unexpected admin table in test: ${table}`)
      return {
        insert: vi.fn((row: unknown) => {
          mockInsert(row)
          return { select: vi.fn(() => ({ single: mockInsertSingle })) }
        }),
        update: vi.fn((values: unknown) => {
          mockAdminUpdate(values)
          return { eq: vi.fn(async () => ({ error: null })) }
        }),
      }
    }),
  }),
}))

vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'sessions') {
        // `single` serves refresh/close; `lte` is the awaited tail of the
        // "is today's class suspended?" lookup in createSession.
        return chain({ single: mockSessionSingle, lte: () => mockSuspendedToday() })
      }
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
    mockSuspendedToday.mockReset()
    mockSuspendedToday.mockResolvedValue({ data: [] })
    mockKeptAttendances.mockReset()
    mockKeptAttendances.mockResolvedValue({ data: [] })
    mockMoveUpdate.mockReset()
    mockLogAudit.mockReset()

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

  it('refuses to open attendance when the class of the day was suspended', async () => {
    mockSuspendedToday.mockResolvedValue({ data: [{ id: 'suspended-1' }] })

    const result = await createSession('subject-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/suspendida/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('still allows a makeup class on a day whose regular class was suspended', async () => {
    mockSuspendedToday.mockResolvedValue({ data: [{ id: 'suspended-1' }] })

    const result = await createSession('subject-1', undefined, undefined, {
      isMakeup: true,
      makeupReason: 'Reposición de la clase suspendida',
    })

    expect(result.success).toBe(true)
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('moves the attendances kept in the suspended class into the makeup class, and audits it', async () => {
    mockSuspendedToday.mockResolvedValue({ data: [{ id: 'suspended-1' }] })
    mockKeptAttendances.mockResolvedValue({
      data: [
        { id: 'att-1', student_id: 'stu-1', session_id: 'suspended-1' },
        { id: 'att-2', student_id: 'stu-2', session_id: 'suspended-1' },
      ],
    })

    const result = await createSession('subject-1', undefined, undefined, {
      isMakeup: true,
      makeupReason: 'Reposición de la clase suspendida',
    })

    expect(result.success).toBe(true)
    // only session_id changes: scanned_at / ip / status stay as scanned
    expect(mockMoveUpdate).toHaveBeenCalledWith({ session_id: 'session-1' }, 'session_id', [
      'suspended-1',
    ])
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.relocate',
        entityId: 'session-1',
        subjectId: 'subject-1',
        details: expect.objectContaining({
          path: 'makeup_after_suspension',
          moved: 2,
          attendance_ids: ['att-1', 'att-2'],
        }),
      })
    )
  })

  it('moves nothing for a makeup on a day without a suspended class', async () => {
    const result = await createSession('subject-1', undefined, undefined, {
      isMakeup: true,
      makeupReason: 'Reposición por paro de transporte',
    })

    expect(result.success).toBe(true)
    expect(mockMoveUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('does not touch attendances when a regular class is refused on a suspended day', async () => {
    mockSuspendedToday.mockResolvedValue({ data: [{ id: 'suspended-1' }] })

    await createSession('subject-1')

    expect(mockMoveUpdate).not.toHaveBeenCalled()
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

describe('QR token refresh and manual close (service-role writes)', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockCheckSubjectProfessor.mockReset()
    mockSessionSingle.mockReset()
    mockAdminUpdate.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockCheckSubjectProfessor.mockResolvedValue(true)
    mockSessionSingle.mockResolvedValue({
      data: {
        id: 'session-1',
        subject_id: 'subject-1',
        qr_token: 'old',
        is_active: true,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    })
  })

  it('rotates the token through the service role for the owning professor', async () => {
    const result = await refreshSessionQrToken('session-1')

    expect(result.success).toBe(true)
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ previous_qr_token: 'old' })
    )
  })

  it('does not rotate or close for someone who does not own the subject', async () => {
    mockCheckSubjectProfessor.mockResolvedValue(false)

    expect((await refreshSessionQrToken('session-1')).success).toBe(false)
    expect((await closeSession('session-1')).success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('closes the QR window through the service role', async () => {
    const result = await closeSession('session-1')

    expect(result.success).toBe(true)
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ qr_token: null, previous_qr_token: null })
    )
  })
})
