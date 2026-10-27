import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPeriodCut, updatePeriodCut } from './periodCuts'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockAdminFrom = vi.fn()

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => {
      throw new Error('validation must fail before any period lookup')
    }),
  })),
}))
vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({ from: mockAdminFrom }),
}))

const dates = { startDate: '2026-02-01', endDate: '2026-03-15' }

describe('period cut name validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
  })

  it('rejects a name longer than 60 characters when creating', async () => {
    const result = await createPeriodCut('p1', { name: 'x'.repeat(61), ...dates })
    expect(result).toEqual({
      success: false,
      error: 'El nombre del corte no puede superar los 60 caracteres',
    })
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('rejects a name longer than 60 characters when updating', async () => {
    const result = await updatePeriodCut('c1', { name: 'x'.repeat(61), ...dates })
    expect(result.success).toBe(false)
    expect(result.error).toContain('60 caracteres')
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('measures the trimmed name, so padding does not count', async () => {
    // Passes name validation (and then fails on the mocked period lookup, which is expected).
    await expect(
      createPeriodCut('p1', { name: `  ${'x'.repeat(60)}  `, ...dates })
    ).rejects.toThrow('validation must fail before any period lookup')
  })
})
