import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSessionCaptureData } from './attendanceCapture'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockSession = vi.fn()
const mockAttendances = vi.fn()
const mockEnrollments = vi.fn()

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))

function chain(terminal: Record<string, unknown>) {
  const c: Record<string, unknown> = {}
  for (const method of ['select', 'eq']) c[method] = vi.fn(() => c)
  return Object.assign(c, terminal)
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'sessions') return chain({ maybeSingle: () => mockSession() })
      if (table === 'attendances') return chain({ order: () => mockAttendances() })
      if (table === 'enrollments') return chain({ eq: () => mockEnrollments() })
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

const CLASSROOM = { latitude: 4.6097, longitude: -74.0817 }

function sessionRow(modality: string | null) {
  return { data: { id: 's1', subject_id: 'sub1', modality, ...CLASSROOM }, error: null }
}

function attendance(id: string, studentId: string, ip: string | null, far = false) {
  return {
    id,
    student_id: studentId,
    status: 'PRESENT',
    scanned_at: '2026-03-02T13:59:00Z',
    ip_address: ip,
    latitude: far ? 4.6297 : 4.6098,
    longitude: -74.0817,
    student: { name: `Name ${studentId}`, student_code: `C-${studentId}` },
  }
}

describe('getSessionCaptureData', () => {
  beforeEach(() => {
    for (const m of [mockGetUser, mockCheckAdmin, mockSession, mockAttendances, mockEnrollments]) {
      m.mockReset()
    }
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    mockSession.mockResolvedValue(sessionRow('PRESENCIAL'))
    mockEnrollments.mockResolvedValue({ data: [{ student_id: 'a' }, { student_id: 'b' }] })
    mockAttendances.mockResolvedValue({
      data: [
        attendance('1', 'a', '1.1.1.1'),
        attendance('2', 'b', '1.1.1.1'),
        attendance('3', 'g', '9.9.9.9', true),
      ],
      error: null,
    })
  })

  it('rejects unauthenticated callers before reading anything', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await getSessionCaptureData('s1')

    expect(result.success).toBe(false)
    expect(mockSession).not.toHaveBeenCalled()
    expect(mockAttendances).not.toHaveBeenCalled()
  })

  it('rejects professors and students: only ADMIN gets IP and location', async () => {
    mockCheckAdmin.mockResolvedValue(false)

    const result = await getSessionCaptureData('s1')

    expect(result).toEqual({ success: false, error: expect.stringMatching(/permiso/) })
    expect(mockSession).not.toHaveBeenCalled()
    expect(mockAttendances).not.toHaveBeenCalled()
  })

  it('returns the captured data with the same flags the professor sees', async () => {
    const result = await getSessionCaptureData('s1')

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.applies).toBe(true)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toMatchObject({
      studentName: 'Name a',
      studentCode: 'C-a',
      isGuest: false,
      capture: { kind: 'captured', ip: '1.1.1.1', ipDiffers: false, farAway: false },
    })
    expect(result.rows[2]).toMatchObject({
      isGuest: true,
      capture: { ip: '9.9.9.9', ipDiffers: true, farAway: true },
    })
  })

  it('returns nothing for a virtual class, even if the rows still hold old values', async () => {
    mockSession.mockResolvedValue(sessionRow('VIRTUAL'))

    const result = await getSessionCaptureData('s1')

    expect(result).toEqual({ success: true, applies: false, rows: [] })
    expect(mockAttendances).not.toHaveBeenCalled()
  })

  it('treats a legacy class without modality as in person', async () => {
    mockSession.mockResolvedValue(sessionRow(null))

    const result = await getSessionCaptureData('s1')

    expect(result.success && result.applies).toBe(true)
  })

  it('reports a missing session', async () => {
    mockSession.mockResolvedValue({ data: null, error: null })

    expect(await getSessionCaptureData('nope')).toEqual({
      success: false,
      error: 'Sesión no encontrada.',
    })
  })
})
