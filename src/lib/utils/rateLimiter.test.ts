import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRateLimit } from './rateLimiter'

const mockRpc = vi.fn()

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: vi.fn(() => ({ rpc: mockRpc })),
}))

describe('checkRateLimit', () => {
  beforeEach(() => {
    mockRpc.mockReset()
  })

  it('allows the attempt when the RPC returns true', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })

    const res = await checkRateLimit('test-ip-1', { maxAttempts: 5 })

    expect(res.allowed).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'test-ip-1',
      p_max: 5,
      p_window_seconds: 60,
    })
  })

  it('blocks the attempt and reports retryAfterSeconds when the RPC returns false', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })

    const res = await checkRateLimit('test-ip-2', { maxAttempts: 3, windowMs: 60_000 })

    expect(res.allowed).toBe(false)
    expect(res.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('fails open (allows) when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } })

    const res = await checkRateLimit('test-ip-3')

    expect(res.allowed).toBe(true)
  })

  it('fails open (allows) when the RPC call throws', async () => {
    mockRpc.mockRejectedValue(new Error('network down'))

    const res = await checkRateLimit('test-ip-4')

    expect(res.allowed).toBe(true)
  })
})
