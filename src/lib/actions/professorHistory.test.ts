import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteSession, reactivateSession } from './professorHistory'

const mockGetUser = vi.fn()
const mockSessionSingle = vi.fn()
const mockAuthorize = vi.fn()
const mockAdminUpdate = vi.fn()
const mockAdminUpdateEq = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('./attendanceEditGuard', () => ({
  authorizeAttendanceEdit: (...args: unknown[]) => mockAuthorize(...args),
}))

vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => {
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.single = mockSessionSingle
      return c
    }),
  })),
}))

// Writes must use the service-role client (migration 028 removed the
// professor write policy on `sessions`).
vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table !== 'sessions') throw new Error(`unexpected admin table: ${table}`)
      return {
        update: vi.fn((values: unknown) => {
          mockAdminUpdate(values)
          return { eq: mockAdminUpdateEq }
        }),
      }
    }),
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const SESSION = {
  id: 'session-1',
  subject_id: 'subject-1',
  date: '2026-03-02T13:00:00Z',
  class_ends_at: '2026-03-02T15:00:00Z',
  is_active: true,
}

describe('archive / reactivate session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockSessionSingle.mockResolvedValue({ data: SESSION })
    mockAuthorize.mockResolvedValue({ ok: true, role: 'PROFESSOR' })
    mockAdminUpdateEq.mockResolvedValue({ error: null })
  })

  it('archives during the class through the service role and audits it', async () => {
    const result = await deleteSession('session-1')

    expect(result.success).toBe(true)
    expect(mockAdminUpdate).toHaveBeenCalledWith({ is_active: false })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session.archive',
        actorId: 'prof-1',
        details: expect.objectContaining({ actor_role: 'PROFESSOR' }),
      })
    )
  })

  it('refuses a professor once the class has ended (history rewrite), writing nothing', async () => {
    mockAuthorize.mockResolvedValue({
      ok: false,
      code: 'CLASS_ENDED',
      error: 'Solo coordinación puede modificar asistencias de clases pasadas.',
    })

    const archive = await deleteSession('session-1')
    const reactivate = await reactivateSession('session-1')

    expect(archive.success).toBe(false)
    expect(reactivate.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('refuses a professor who does not own the subject', async () => {
    mockAuthorize.mockResolvedValue({ ok: false, code: 'FORBIDDEN', error: 'No tienes permiso' })

    const result = await deleteSession('session-1')

    expect(result.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('lets an admin reactivate an archived past class and audits the role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockSessionSingle.mockResolvedValue({ data: { ...SESSION, is_active: false } })
    mockAuthorize.mockResolvedValue({ ok: true, role: 'ADMIN' })

    const result = await reactivateSession('session-1')

    expect(result.success).toBe(true)
    expect(mockAdminUpdate).toHaveBeenCalledWith({ is_active: true })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session.reactivate',
        details: expect.objectContaining({ actor_role: 'ADMIN' }),
      })
    )
  })

  it('does not re-archive an already archived session', async () => {
    mockSessionSingle.mockResolvedValue({ data: { ...SESSION, is_active: false } })

    const result = await deleteSession('session-1')

    expect(result.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('reports an unknown session', async () => {
    mockSessionSingle.mockResolvedValue({ data: null })

    const result = await deleteSession('nope')

    expect(result.success).toBe(false)
    expect(mockAuthorize).not.toHaveBeenCalled()
  })
})
