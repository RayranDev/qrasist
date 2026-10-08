import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reviewJustification } from './justifications'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockJustificationSingle = vi.fn()
const mockAdminSelect = vi.fn()
const mockAdminUpdate = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))

vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table !== 'absence_justifications') throw new Error(`unexpected table: ${table}`)
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.single = mockJustificationSingle
      return c
    }),
  })),
}))

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn(() => ({
      update: vi.fn((values: unknown) => {
        mockAdminUpdate(values)
        const c: Record<string, unknown> = {}
        c.eq = vi.fn(() => c)
        c.select = mockAdminSelect
        return c
      }),
    })),
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const PENDING = {
  id: 'just-1',
  student_id: 'student-1',
  session_id: 'session-1',
  subject_id: 'subject-1',
  status: 'PENDING',
}

describe('reviewJustification', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockCheckAdmin.mockReset()
    mockJustificationSingle.mockReset()
    mockAdminSelect.mockReset()
    mockAdminUpdate.mockReset()
    mockLogAudit.mockReset()
    mockJustificationSingle.mockResolvedValue({ data: PENDING })
    mockAdminSelect.mockResolvedValue({ data: [{ id: 'just-1' }], error: null })
  })

  it('rejects a professor, even the subject owner, without reading or writing anything', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockCheckAdmin.mockResolvedValue(false)

    const result = await reviewJustification({ justificationId: 'just-1', decision: 'APPROVED' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/coordinación/i)
    expect(mockJustificationSingle).not.toHaveBeenCalled()
    expect(mockAdminUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('lets an admin approve and records the audit entry', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)

    const result = await reviewJustification({ justificationId: 'just-1', decision: 'APPROVED' })

    expect(result.success).toBe(true)
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED', reviewed_by: 'admin-1' })
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'justification.approve', actorId: 'admin-1' })
    )
  })

  it('requires a note of at least 5 characters to reject', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)

    const result = await reviewJustification({
      justificationId: 'just-1',
      decision: 'REJECTED',
      note: 'no',
    })

    expect(result.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('does not review a justification that was already reviewed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    mockJustificationSingle.mockResolvedValue({ data: { ...PENDING, status: 'APPROVED' } })

    const result = await reviewJustification({
      justificationId: 'just-1',
      decision: 'REJECTED',
      note: 'motivo válido',
    })

    expect(result.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })
})
