import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markAttendanceManually, removeAttendanceMark } from './attendanceManual'

const mockGetUser = vi.fn()
const mockSessionSingle = vi.fn()
const mockEnrollmentMaybeSingle = vi.fn()
const mockAttendanceSingle = vi.fn()
const mockAuthorizeAttendanceEdit = vi.fn()

const mockAdminExistingMaybeSingle = vi.fn()
const mockAdminInsert = vi.fn()
const mockAdminInsertSingle = vi.fn()
const mockAdminUpdateEq = vi.fn()
const mockAdminDeleteEq = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('./attendanceEditGuard', () => ({
  authorizeAttendanceEdit: (...args: unknown[]) => mockAuthorizeAttendanceEdit(...args),
}))

vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'sessions') {
        const c: Record<string, unknown> = {}
        c.select = vi.fn(() => c)
        c.eq = vi.fn(() => c)
        c.single = mockSessionSingle
        return c
      }
      if (table === 'enrollments') {
        const c: Record<string, unknown> = {}
        c.select = vi.fn(() => c)
        c.eq = vi.fn(() => c)
        c.maybeSingle = mockEnrollmentMaybeSingle
        return c
      }
      if (table === 'attendances') {
        const c: Record<string, unknown> = {}
        c.select = vi.fn(() => c)
        c.eq = vi.fn(() => c)
        c.single = mockAttendanceSingle
        return c
      }
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table !== 'attendances') throw new Error(`unexpected admin table in test: ${table}`)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: mockAdminExistingMaybeSingle })),
          })),
        })),
        insert: vi.fn((...args: unknown[]) => {
          mockAdminInsert(...args)
          return { select: vi.fn(() => ({ single: mockAdminInsertSingle })) }
        }),
        update: vi.fn(() => ({ eq: mockAdminUpdateEq })),
        delete: vi.fn(() => ({ eq: mockAdminDeleteEq })),
      }
    }),
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const FORBIDDEN = {
  ok: false,
  code: 'FORBIDDEN',
  error: 'No tienes permiso sobre esta sesión.',
} as const

const CLASS_ENDED = {
  ok: false,
  code: 'CLASS_ENDED',
  error: 'Solo coordinación puede modificar asistencias de clases pasadas.',
} as const

describe('markAttendanceManually', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockSessionSingle.mockReset()
    mockEnrollmentMaybeSingle.mockReset()
    mockAuthorizeAttendanceEdit.mockReset()
    mockAdminExistingMaybeSingle.mockReset()
    mockAdminInsert.mockReset()
    mockAdminInsertSingle.mockReset()
    mockAdminUpdateEq.mockReset()
    mockLogAudit.mockReset()
  })

  it('rejects when the reason is shorter than 5 characters, without touching the database', async () => {
    const result = await markAttendanceManually({
      sessionId: 'session-1',
      studentId: 'student-1',
      status: 'PRESENT',
      reason: 'hi',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/motivo/i)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('denies an intruder professor who does not own the subject and does not touch attendances', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'intruder-1' } } })
    mockSessionSingle.mockResolvedValue({
      data: { id: 'session-1', date: '2026-01-01T10:00:00Z', subject_id: 'subject-1' },
    })
    mockAuthorizeAttendanceEdit.mockResolvedValue(FORBIDDEN)

    const result = await markAttendanceManually({
      sessionId: 'session-1',
      studentId: 'student-1',
      status: 'PRESENT',
      reason: 'Llegó tarde por transporte',
    })

    expect(result.success).toBe(false)
    expect(mockEnrollmentMaybeSingle).not.toHaveBeenCalled()
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('rejects marking a student who is not enrolled in the subject', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockSessionSingle.mockResolvedValue({
      data: { id: 'session-1', date: '2026-01-01T10:00:00Z', subject_id: 'subject-1' },
    })
    mockAuthorizeAttendanceEdit.mockResolvedValue({ ok: true, role: 'PROFESSOR' })
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: null })

    const result = await markAttendanceManually({
      sessionId: 'session-1',
      studentId: 'stranger-1',
      status: 'LATE',
      reason: 'Corrección de asistencia',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no está inscrito/i)
    expect(mockAdminInsert).not.toHaveBeenCalled()
  })

  it('inserts a new manual attendance for an authorized professor and an enrolled student', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockSessionSingle.mockResolvedValue({
      data: { id: 'session-1', date: '2026-01-01T10:00:00Z', subject_id: 'subject-1' },
    })
    mockAuthorizeAttendanceEdit.mockResolvedValue({ ok: true, role: 'PROFESSOR' })
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: 'enrollment-1' } })
    mockAdminExistingMaybeSingle.mockResolvedValue({ data: null })
    mockAdminInsertSingle.mockResolvedValue({ data: { id: 'attendance-new-1' }, error: null })

    const result = await markAttendanceManually({
      sessionId: 'session-1',
      studentId: 'student-1',
      status: 'LATE',
      reason: 'Llegó después del cierre del QR',
    })

    expect(result.success).toBe(true)
    expect(mockAdminInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-1',
        student_id: 'student-1',
        status: 'LATE',
        marked_by: 'prof-1',
        scanned_at: '2026-01-01T10:00:00Z',
      })
    )
  })

  it('updates the existing row instead of inserting when one already exists for this session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockSessionSingle.mockResolvedValue({
      data: { id: 'session-1', date: '2026-01-01T10:00:00Z', subject_id: 'subject-1' },
    })
    mockAuthorizeAttendanceEdit.mockResolvedValue({ ok: true, role: 'PROFESSOR' })
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: 'enrollment-1' } })
    mockAdminExistingMaybeSingle.mockResolvedValue({ data: { id: 'attendance-1' } })
    mockAdminUpdateEq.mockResolvedValue({ error: null })

    const result = await markAttendanceManually({
      sessionId: 'session-1',
      studentId: 'student-1',
      status: 'PRESENT',
      reason: 'Corrección: sí asistió',
    })

    expect(result.success).toBe(true)
    expect(mockAdminInsert).not.toHaveBeenCalled()
    expect(mockAdminUpdateEq).toHaveBeenCalled()
  })

  it('refuses a professor once the class has ended, without touching attendances', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockSessionSingle.mockResolvedValue({
      data: {
        id: 'session-1',
        date: '2026-01-01T10:00:00Z',
        subject_id: 'subject-1',
        class_ends_at: '2026-01-01T12:00:00Z',
      },
    })
    mockAuthorizeAttendanceEdit.mockResolvedValue(CLASS_ENDED)

    const result = await markAttendanceManually({
      sessionId: 'session-1',
      studentId: 'student-1',
      status: 'PRESENT',
      reason: 'Corrección tardía de asistencia',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/coordinación/i)
    expect(mockEnrollmentMaybeSingle).not.toHaveBeenCalled()
    expect(mockAdminInsert).not.toHaveBeenCalled()
    expect(mockAuthorizeAttendanceEdit).toHaveBeenCalledWith(
      expect.anything(),
      'prof-1',
      expect.objectContaining({ class_ends_at: '2026-01-01T12:00:00Z', subject_id: 'subject-1' })
    )
  })

  it('lets an admin correct a past session and records the actor role in the audit trail', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockSessionSingle.mockResolvedValue({
      data: { id: 'session-1', date: '2026-01-01T10:00:00Z', subject_id: 'subject-1' },
    })
    mockAuthorizeAttendanceEdit.mockResolvedValue({ ok: true, role: 'ADMIN' })
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: 'enrollment-1' } })
    mockAdminExistingMaybeSingle.mockResolvedValue({ data: null })
    mockAdminInsertSingle.mockResolvedValue({ data: { id: 'attendance-new-1' }, error: null })

    const result = await markAttendanceManually({
      sessionId: 'session-1',
      studentId: 'student-1',
      status: 'PRESENT',
      reason: 'Constancia médica validada',
    })

    expect(result.success).toBe(true)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'attendance.mark',
        details: expect.objectContaining({ actor_role: 'ADMIN' }),
      })
    )
  })
})

describe('removeAttendanceMark', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockAttendanceSingle.mockReset()
    mockAuthorizeAttendanceEdit.mockReset()
    mockAdminDeleteEq.mockReset()
  })

  it('rejects when the reason is shorter than 5 characters', async () => {
    const result = await removeAttendanceMark({ attendanceId: 'att-1', reason: 'no' })

    expect(result.success).toBe(false)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('denies an intruder professor who does not own the subject', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'intruder-1' } } })
    mockAttendanceSingle.mockResolvedValue({
      data: { id: 'att-1', session: { subject_id: 'subject-1' } },
    })
    mockAuthorizeAttendanceEdit.mockResolvedValue(FORBIDDEN)

    const result = await removeAttendanceMark({
      attendanceId: 'att-1',
      reason: 'Escaneo por error',
    })

    expect(result.success).toBe(false)
    expect(mockAdminDeleteEq).not.toHaveBeenCalled()
  })

  it('refuses a professor once the class has ended, without deleting anything', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockAttendanceSingle.mockResolvedValue({
      data: {
        id: 'att-1',
        student_id: 'student-1',
        session_id: 'session-1',
        status: 'PRESENT',
        session: {
          subject_id: 'subject-1',
          date: '2026-01-01T10:00:00Z',
          class_ends_at: '2026-01-01T12:00:00Z',
        },
      },
    })
    mockAuthorizeAttendanceEdit.mockResolvedValue(CLASS_ENDED)

    const result = await removeAttendanceMark({
      attendanceId: 'att-1',
      reason: 'Se quiere borrar luego',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/coordinación/i)
    expect(mockAdminDeleteEq).not.toHaveBeenCalled()
  })
})
