import { describe, it, expect, vi, beforeEach } from 'vitest'
import { changeJustificationDecision, bulkApproveJustifications } from './justifications'
import { MAX_BULK_APPROVE } from '@/lib/justifications/bulk'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockJustificationSingle = vi.fn()
const mockAdminSelect = vi.fn()
const mockAdminUpdate = vi.fn()
const mockAdminEq = vi.fn()
const mockAdminExisting = vi.fn()
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
        c.eq = vi.fn((...args: unknown[]) => {
          mockAdminEq(...args)
          return c
        })
        c.in = vi.fn(() => c)
        c.select = mockAdminSelect
        return c
      }),
      // Lookup de ids no aprobados (bulk): select(...).in(...)
      select: vi.fn(() => ({ in: mockAdminExisting })),
    })),
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ROW = {
  id: 'just-1',
  student_id: 'student-1',
  session_id: 'session-1',
  subject_id: 'subject-1',
  status: 'APPROVED',
  review_note: 'nota anterior',
}

function asAdmin() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockCheckAdmin.mockResolvedValue(true)
}

describe('changeJustificationDecision', () => {
  beforeEach(() => {
    for (const m of [
      mockGetUser,
      mockCheckAdmin,
      mockJustificationSingle,
      mockAdminSelect,
      mockAdminUpdate,
      mockAdminEq,
      mockAdminExisting,
      mockLogAudit,
    ]) {
      m.mockReset()
    }
    mockJustificationSingle.mockResolvedValue({ data: ROW })
    mockAdminSelect.mockResolvedValue({ data: [{ id: 'just-1' }], error: null })
  })

  it('rejects a non-admin without reading or writing anything', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockCheckAdmin.mockResolvedValue(false)

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'REJECTED',
      reason: 'motivo válido',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/coordinación/i)
    expect(mockJustificationSingle).not.toHaveBeenCalled()
    expect(mockAdminUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it.each(['', '   ', 'no'])('requires a reason of at least 5 characters (%j)', async (reason) => {
    asAdmin()

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'REJECTED',
      reason,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/motivo/i)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('changes APPROVED -> REJECTED, stores the reason as note and audits it', async () => {
    asAdmin()

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'REJECTED',
      reason: '  El comprobante no es válido  ',
    })

    expect(result.success).toBe(true)
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'REJECTED',
        reviewed_by: 'admin-1',
        review_note: 'El comprobante no es válido',
      })
    )
    // Claim atómico sobre el estado leído.
    expect(mockAdminEq).toHaveBeenCalledWith('status', 'APPROVED')
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'justification.change_decision',
        actorId: 'admin-1',
        entityId: 'just-1',
        details: expect.objectContaining({
          from: 'APPROVED',
          to: 'REJECTED',
          reason: 'El comprobante no es válido',
          previous_note: 'nota anterior',
        }),
      })
    )
  })

  it('changes REJECTED -> APPROVED', async () => {
    asAdmin()
    mockJustificationSingle.mockResolvedValue({ data: { ...ROW, status: 'REJECTED' } })

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'APPROVED',
      reason: 'Llegó la constancia médica',
    })

    expect(result.success).toBe(true)
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED', review_note: 'Llegó la constancia médica' })
    )
    expect(mockAdminEq).toHaveBeenCalledWith('status', 'REJECTED')
  })

  it.each(['APPROVED', 'REJECTED'])(
    'sends a %s justification back to PENDING clearing reviewer, date and note',
    async (from) => {
      asAdmin()
      mockJustificationSingle.mockResolvedValue({ data: { ...ROW, status: from } })

      const result = await changeJustificationDecision({
        justificationId: 'just-1',
        to: 'PENDING',
        reason: 'Hay que pedir más información',
      })

      expect(result.success).toBe(true)
      expect(mockAdminUpdate).toHaveBeenCalledWith({
        status: 'PENDING',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
      })
      expect(mockAdminEq).toHaveBeenCalledWith('status', from)
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            from,
            to: 'PENDING',
            reason: 'Hay que pedir más información',
          }),
        })
      )
    }
  )

  it('rejects a no-op change to the same status', async () => {
    asAdmin()

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'APPROVED',
      reason: 'motivo válido',
    })

    expect(result.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('rejects changing a PENDING justification (it must be reviewed instead)', async () => {
    asAdmin()
    mockJustificationSingle.mockResolvedValue({ data: { ...ROW, status: 'PENDING' } })

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'REJECTED',
      reason: 'motivo válido',
    })

    expect(result.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('rejects an unknown target status', async () => {
    asAdmin()

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'DELETED' as never,
      reason: 'motivo válido',
    })

    expect(result.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('reports a lost race and does not audit when the claim matches no row', async () => {
    asAdmin()
    mockAdminSelect.mockResolvedValue({ data: [], error: null })

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'REJECTED',
      reason: 'motivo válido',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cambió/i)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('returns a generic error when the update fails', async () => {
    asAdmin()
    mockAdminSelect.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'REJECTED',
      reason: 'motivo válido',
    })

    expect(result.success).toBe(false)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('returns not found when the justification does not exist', async () => {
    asAdmin()
    mockJustificationSingle.mockResolvedValue({ data: null })

    const result = await changeJustificationDecision({
      justificationId: 'just-1',
      to: 'REJECTED',
      reason: 'motivo válido',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no encontrada/i)
  })
})

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const claimedRow = (id: string) => ({
  id,
  student_id: 'student-1',
  session_id: `session-${id}`,
  subject_id: 'subject-1',
})

describe('bulkApproveJustifications', () => {
  beforeEach(() => {
    for (const m of [
      mockGetUser,
      mockCheckAdmin,
      mockAdminSelect,
      mockAdminUpdate,
      mockAdminEq,
      mockAdminExisting,
      mockLogAudit,
    ]) {
      m.mockReset()
    }
    mockAdminExisting.mockResolvedValue({ data: [], error: null })
  })

  it('rejects a non-admin without touching the database', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockCheckAdmin.mockResolvedValue(false)

    const result = await bulkApproveJustifications([uuid(1)])

    expect(result.success).toBe(false)
    expect(result.approved).toEqual([])
    expect(mockAdminUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('rejects an empty selection', async () => {
    asAdmin()

    const result = await bulkApproveJustifications([])

    expect(result.success).toBe(false)
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('rejects more than the cap and does not truncate silently', async () => {
    asAdmin()
    const ids = Array.from({ length: MAX_BULK_APPROVE + 1 }, (_, i) => uuid(i + 1))

    const result = await bulkApproveJustifications(ids)

    expect(result.success).toBe(false)
    expect(result.error).toContain(String(MAX_BULK_APPROVE))
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it('accepts exactly the cap', async () => {
    asAdmin()
    const ids = Array.from({ length: MAX_BULK_APPROVE }, (_, i) => uuid(i + 1))
    mockAdminSelect.mockResolvedValue({ data: ids.map(claimedRow), error: null })

    const result = await bulkApproveJustifications(ids)

    expect(result.success).toBe(true)
    expect(result.approved).toHaveLength(MAX_BULK_APPROVE)
  })

  it('approves with a PENDING claim and audits every approval', async () => {
    asAdmin()
    mockAdminSelect.mockResolvedValue({
      data: [claimedRow(uuid(1)), claimedRow(uuid(2))],
      error: null,
    })

    const result = await bulkApproveJustifications([uuid(1), uuid(2)])

    expect(result).toEqual({ success: true, approved: [uuid(1), uuid(2)], failures: [] })
    expect(mockAdminUpdate).toHaveBeenCalledTimes(1)
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED', reviewed_by: 'admin-1' })
    )
    expect(mockAdminEq).toHaveBeenCalledWith('status', 'PENDING')
    expect(mockLogAudit).toHaveBeenCalledTimes(2)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'justification.approve',
        actorId: 'admin-1',
        entityId: uuid(1),
        details: expect.objectContaining({ bulk: true }),
      })
    )
  })

  it('dedupes repeated ids', async () => {
    asAdmin()
    mockAdminSelect.mockResolvedValue({ data: [claimedRow(uuid(1))], error: null })

    const result = await bulkApproveJustifications([uuid(1), uuid(1), uuid(1)])

    expect(result.approved).toEqual([uuid(1)])
    expect(result.failures).toEqual([])
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  it('reports already-decided and missing ids as failures without auditing them', async () => {
    asAdmin()
    mockAdminSelect.mockResolvedValue({ data: [claimedRow(uuid(1))], error: null })
    // uuid(2) existe pero ya estaba decidida; uuid(3) no existe.
    mockAdminExisting.mockResolvedValue({ data: [{ id: uuid(2) }], error: null })

    const result = await bulkApproveJustifications([uuid(1), uuid(2), uuid(3)])

    expect(result.success).toBe(true)
    expect(result.approved).toEqual([uuid(1)])
    expect(result.failures).toEqual([
      { id: uuid(2), message: expect.stringMatching(/ya fue revisada/i) },
      { id: uuid(3), message: expect.stringMatching(/no encontrada/i) },
    ])
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  it('reports non-UUID ids as failures and never sends them to the database', async () => {
    asAdmin()
    mockAdminSelect.mockResolvedValue({ data: [claimedRow(uuid(1))], error: null })

    const result = await bulkApproveJustifications([uuid(1), 'not-a-uuid'])

    expect(result.approved).toEqual([uuid(1)])
    expect(result.failures).toEqual([{ id: 'not-a-uuid', message: expect.any(String) }])
  })

  it('returns an error and audits nothing when the update fails', async () => {
    asAdmin()
    mockAdminSelect.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await bulkApproveJustifications([uuid(1)])

    expect(result.success).toBe(false)
    expect(result.approved).toEqual([])
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})
