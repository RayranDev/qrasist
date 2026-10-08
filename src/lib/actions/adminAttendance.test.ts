import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPastSession } from './adminAttendance'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockSubjectMaybeSingle = vi.fn()
const mockSameDay = vi.fn()
const mockInsert = vi.fn()
const mockInsertSingle = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))
vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))
vi.mock('@/lib/settings/appSettings', () => ({
  getAppSettings: async () => ({ registrationWindowMinutes: 5, defaultClassMinutes: 120 }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.gte = vi.fn(() => c)
      if (table === 'subjects') {
        c.maybeSingle = mockSubjectMaybeSingle
      } else if (table === 'sessions') {
        c.lte = vi.fn(() => ({ limit: mockSameDay }))
      } else {
        throw new Error(`unexpected table: ${table}`)
      }
      return c
    }),
  })),
}))

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn(() => ({
      insert: vi.fn((row: unknown) => {
        mockInsert(row)
        return { select: vi.fn(() => ({ single: mockInsertSingle })) }
      }),
    })),
  }),
}))

const input = {
  subjectId: 'subject-1',
  startsAt: '2026-03-02T08:00',
  modality: 'PRESENCIAL',
  note: 'Lista en papel',
}

describe('createPastSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    mockSubjectMaybeSingle.mockResolvedValue({ data: { id: 'subject-1', name: 'Algoritmos' } })
    mockSameDay.mockResolvedValue({ data: [] })
    mockInsertSingle.mockResolvedValue({ data: { id: 'new-session' }, error: null })
  })

  it('rejects non-admins without touching anything', async () => {
    mockCheckAdmin.mockResolvedValue(false)

    const result = await createPastSession(input)

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('creates a closed session that still counts as held and audits it', async () => {
    const result = await createPastSession(input)

    expect(result).toEqual({ success: true, sessionId: 'new-session' })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        subject_id: 'subject-1',
        qr_token: null,
        is_active: true,
        expires_at: '2026-03-02T13:00:00.000Z',
        class_ends_at: '2026-03-02T15:00:00.000Z',
        note: 'Lista en papel',
      })
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'session.register_past', actorId: 'admin-1' })
    )
  })

  it('rejects a second class for the same subject on the same Bogota day', async () => {
    mockSameDay.mockResolvedValue({ data: [{ id: 'existing' }] })

    const result = await createPastSession(input)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ya existe una clase/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a future class', async () => {
    const result = await createPastSession({ ...input, startsAt: '2999-01-01T08:00' })

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
