import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getActiveSubjectsCount, updateGlobalAbsencePolicy } from './adminAcademicPolicy'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockCount = vi.fn()
const mockUpdate = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))
vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table !== 'subjects') throw new Error(`unexpected table: ${table}`)
      return {
        select: vi.fn(() => ({ eq: vi.fn(async () => mockCount()) })),
        update: vi.fn((payload: unknown, options: unknown) => ({
          eq: vi.fn(async () => mockUpdate(payload, options)),
        })),
      }
    }),
  })),
}))

const policy = {
  absenceRuleType: 'PERCENTAGE',
  maxAbsencePercentage: 20,
  totalPlannedSessions: 16,
}

describe('updateGlobalAbsencePolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    mockCount.mockResolvedValue({ count: 37, error: null })
    mockUpdate.mockResolvedValue({ count: 37, error: null })
  })

  it('refuses non-admins before touching any subject', async () => {
    mockCheckAdmin.mockResolvedValue(false)
    const result = await updateGlobalAbsencePolicy({ ...policy, applyToAllActiveSubjects: true })
    expect(result).toEqual({ success: false, error: 'No autorizado' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('does not overwrite anything without the confirmed subject count', async () => {
    const result = await updateGlobalAbsencePolicy({ ...policy, applyToAllActiveSubjects: true })
    expect(result.success).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('does not overwrite when the active subject count changed since the confirmation', async () => {
    mockCount.mockResolvedValue({ count: 38, error: null })
    const result = await updateGlobalAbsencePolicy({
      ...policy,
      applyToAllActiveSubjects: true,
      confirmedSubjectsCount: 37,
    })
    expect(result).toMatchObject({ success: false, currentCount: 38 })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('overwrites and audits when the confirmed count matches', async () => {
    const result = await updateGlobalAbsencePolicy({
      ...policy,
      applyToAllActiveSubjects: true,
      confirmedSubjectsCount: 37,
    })
    expect(result).toEqual({ success: true, countUpdated: 37 })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'policy.update_global_absence',
        details: expect.objectContaining({ applied_to_count: 37 }),
      })
    )
  })

  it('changes nothing when apply-to-all is off', async () => {
    const result = await updateGlobalAbsencePolicy({ ...policy, applyToAllActiveSubjects: false })
    expect(result).toEqual({ success: true, countUpdated: 0 })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('getActiveSubjectsCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    mockCount.mockResolvedValue({ count: 37, error: null })
  })

  it('returns the exact server-side count for admins', async () => {
    expect(await getActiveSubjectsCount()).toEqual({ success: true, count: 37 })
  })

  it('rejects non-admins', async () => {
    mockCheckAdmin.mockResolvedValue(false)
    expect(await getActiveSubjectsCount()).toEqual({ success: false, error: 'No autorizado' })
  })

  it('reports a failed count instead of returning 0', async () => {
    mockCount.mockResolvedValue({ count: null, error: { message: 'boom' } })
    const result = await getActiveSubjectsCount()
    expect(result.success).toBe(false)
  })
})
