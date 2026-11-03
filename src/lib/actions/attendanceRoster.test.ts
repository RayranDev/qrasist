import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSessionRoster } from './attendanceManual'

// The roster feeds the live panel that the professor projects in the
// classroom: it must never carry IP or location.

const mockGetUser = vi.fn()
const mockAttendanceSelect = vi.fn()

vi.mock('./attendanceEditGuard', () => ({
  authorizeAttendanceEdit: async () => ({ ok: true, role: 'PROFESSOR' }),
}))

vi.mock('@/lib/audit/auditLog', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/supabase/adminClient', () => ({ getSupabaseAdmin: () => ({}) }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'sessions') {
        const c: Record<string, unknown> = {}
        c.select = vi.fn(() => c)
        c.eq = vi.fn(() => c)
        c.single = async () => ({
          data: {
            id: 's1',
            subject_id: 'sub1',
            date: '2026-03-02T13:00:00Z',
            class_ends_at: null,
            suspended_at: null,
          },
        })
        return c
      }
      if (table === 'enrollments') {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ student_id: 'a', student: { id: 'a', name: 'Ana', student_code: '1' } }],
            }),
          }),
        }
      }
      if (table === 'attendances') {
        return {
          select: (columns: string) => {
            mockAttendanceSelect(columns)
            return {
              eq: async () => ({
                data: [
                  {
                    id: 'att-1',
                    student_id: 'a',
                    status: 'PRESENT',
                    scanned_at: '2026-03-02T13:05:00Z',
                    marked_by: null,
                    // what the DB would return if the select asked for it
                    ip_address: '203.0.113.7',
                    latitude: 4.6,
                    longitude: -74.1,
                  },
                ],
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

describe('getSessionRoster', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockAttendanceSelect.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
  })

  it('does not select IP or location columns', async () => {
    await getSessionRoster('s1')

    const columns = mockAttendanceSelect.mock.calls[0][0] as string
    expect(columns).not.toMatch(/ip_address|latitude|longitude/)
  })

  it('returns roster rows without IP or location', async () => {
    const result = await getSessionRoster('s1')

    expect(result.success).toBe(true)
    expect(Object.keys(result.roster?.[0] ?? {}).sort()).toEqual([
      'attendanceId',
      'isManual',
      'name',
      'scannedAt',
      'status',
      'studentCode',
      'studentId',
    ])
  })
})
