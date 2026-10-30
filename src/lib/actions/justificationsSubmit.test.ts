import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitJustification } from './justifications'

const mockGetUser = vi.fn()
const mockExisting = vi.fn()
const mockResubmitSelect = vi.fn()
const mockUpdate = vi.fn()
const mockInsert = vi.fn()

vi.mock('./authGuards', () => ({ checkAdmin: vi.fn() }))
vi.mock('@/lib/audit/auditLog', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/settings/appSettings', () => ({
  getAppSettings: vi.fn(async () => ({ defaultClassMinutes: 90 })),
}))
vi.mock('@/lib/justifications/eligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/justifications/eligibility')>()),
  isSessionAlreadyHeld: () => true,
  isWithinJustificationWindow: () => true,
}))

// Eligibility reads (profile, session, enrollment, attendance) all succeed.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      const rows: Record<string, unknown> = {
        profiles: { role: 'STUDENT', is_active: true },
        sessions: {
          id: 'session-1',
          date: '2026-10-01T10:00:00Z',
          subject_id: 'subject-1',
          is_active: true,
          class_ends_at: null,
        },
        enrollments: { id: 'enr-1' },
        attendances: null,
      }
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.single = vi.fn(async () => ({ data: rows[table] }))
      c.maybeSingle = vi.fn(async () => ({ data: rows[table] }))
      return c
    }),
  })),
}))

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const c: Record<string, unknown> = {}
        c.eq = vi.fn(() => c)
        c.maybeSingle = mockExisting
        return c
      }),
      update: vi.fn((values: unknown) => {
        mockUpdate(values)
        const c: Record<string, unknown> = {}
        c.eq = vi.fn(() => c)
        c.select = mockResubmitSelect
        return c
      }),
      insert: mockInsert,
    })),
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const REASON = 'Cita médica en la EPS, constancia adjunta.'

describe('submitJustification resubmission', () => {
  beforeEach(() => {
    for (const m of [mockGetUser, mockExisting, mockResubmitSelect, mockUpdate, mockInsert]) {
      m.mockReset()
    }
    mockGetUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
    mockExisting.mockResolvedValue({ data: { id: 'just-1', status: 'REJECTED' } })
    mockResubmitSelect.mockResolvedValue({ data: [{ id: 'just-1' }], error: null })
  })

  it('moves a REJECTED justification back to PENDING', async () => {
    const result = await submitJustification({ sessionId: 'session-1', reason: REASON })

    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }))
  })

  it('fails instead of reporting success when the claim matches no row (admin flipped it)', async () => {
    mockResubmitSelect.mockResolvedValue({ data: [], error: null })

    const result = await submitJustification({ sessionId: 'session-1', reason: REASON })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cambió mientras la enviabas/i)
  })

  it('still reports the generic error when the update itself fails', async () => {
    mockResubmitSelect.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await submitJustification({ sessionId: 'session-1', reason: REASON })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No se pudo reenviar/)
  })
})
