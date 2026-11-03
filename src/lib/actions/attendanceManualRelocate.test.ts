import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markAttendanceManually } from './attendanceManual'

// Manual mark that collides with the one-attendance-per-day lock: the existing row
// of the same day is relocated into the target class. When the target class is
// virtual that row must not keep the IP and location captured in the origin class.

const mockGetUser = vi.fn()
const mockSessionSingle = vi.fn()
const mockExistingMaybeSingle = vi.fn()
const mockSameDayMaybeSingle = vi.fn()
const mockUpdate = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('./attendanceEditGuard', () => ({
  authorizeAttendanceEdit: async () => ({ ok: true, role: 'ADMIN' }),
}))
vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function chain(terminal: Record<string, unknown>) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'lte']) c[m] = vi.fn(() => c)
  return Object.assign(c, terminal)
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'sessions') return chain({ single: () => mockSessionSingle() })
      if (table === 'enrollments')
        return chain({ maybeSingle: async () => ({ data: { id: 'e1' } }) })
      throw new Error(`unexpected table ${table}`)
    }),
  })),
}))

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn(() => ({
      // 1st lookup: this session + student (nothing). 2nd: the same-day row in another session.
      select: vi.fn(() => {
        const c = chain({})
        c.maybeSingle = vi.fn(async () => {
          const first = mockExistingMaybeSingle.mock.calls.length === 0
          return first ? mockExistingMaybeSingle() : mockSameDayMaybeSingle()
        })
        return c
      }),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: async () => ({ data: null, error: { code: '23505' } }),
        })),
      })),
      update: vi.fn((values: unknown) => {
        mockUpdate(values)
        return { eq: vi.fn(async () => ({ error: null })) }
      }),
    })),
  }),
}))

const sessionRow = (modality: string | null) => ({
  data: {
    id: 'target',
    date: '2026-03-02T13:00:00Z',
    subject_id: 'sub-1',
    class_ends_at: null,
    suspended_at: null,
    modality,
  },
})

const sameDayRow = (ip: string | null) => ({
  data: {
    id: 'att-1',
    session_id: 'origin',
    status: 'PRESENT',
    scanned_at: '2026-03-02T13:01:00Z',
    ip_address: ip,
  },
})

async function relocateInto(modality: string | null, ip: string | null) {
  mockSessionSingle.mockResolvedValue(sessionRow(modality))
  mockExistingMaybeSingle.mockResolvedValue({ data: null })
  mockSameDayMaybeSingle.mockResolvedValue(sameDayRow(ip))
  return markAttendanceManually({
    sessionId: 'target',
    studentId: 'stu-1',
    status: 'PRESENT',
    reason: 'Corrección de coordinación',
  })
}

describe('markAttendanceManually: relocating an existing attendance', () => {
  beforeEach(() => {
    for (const m of [
      mockGetUser,
      mockSessionSingle,
      mockExistingMaybeSingle,
      mockSameDayMaybeSingle,
      mockUpdate,
      mockLogAudit,
    ]) {
      m.mockReset()
    }
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  })

  it('clears IP and coordinates when the target class is virtual, and keeps the IP out of the audit', async () => {
    const result = await relocateInto('VIRTUAL', '203.0.113.7')

    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'target',
        ip_address: null,
        latitude: null,
        longitude: null,
      })
    )
    const audit = mockLogAudit.mock.calls[0][0] as { details: Record<string, unknown> }
    expect(audit.details.original_ip_address).toBeNull()
    expect(JSON.stringify(mockLogAudit.mock.calls)).not.toContain('203.0.113.7')
  })

  it('keeps the manual marker when the target class is virtual', async () => {
    await relocateInto('VIRTUAL', 'manual')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: 'manual', latitude: null, longitude: null })
    )
  })

  it('leaves the capture columns alone when the target class is in person or legacy', async () => {
    for (const modality of ['PRESENCIAL', null]) {
      mockUpdate.mockReset()
      mockLogAudit.mockReset()
      mockExistingMaybeSingle.mockReset()

      await relocateInto(modality, '203.0.113.7')

      const values = mockUpdate.mock.calls[0][0] as Record<string, unknown>
      expect(values).not.toHaveProperty('ip_address')
      expect(values).not.toHaveProperty('latitude')
      const audit = mockLogAudit.mock.calls[0][0] as { details: Record<string, unknown> }
      expect(audit.details.original_ip_address).toBe('203.0.113.7')
    }
  })
})
