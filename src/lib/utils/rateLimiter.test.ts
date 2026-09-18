import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, clearAllRateLimits } from './rateLimiter'

describe('rateLimiter', () => {
  beforeEach(() => {
    clearAllRateLimits()
  })

  it('should allow requests within limit', () => {
    const key = 'test-ip-1'
    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(key, { maxAttempts: 5 })
      expect(res.allowed).toBe(true)
    }
  })

  it('should block requests exceeding limit', () => {
    const key = 'test-ip-2'
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, { maxAttempts: 3 })
    }

    const blockedRes = checkRateLimit(key, { maxAttempts: 3 })
    expect(blockedRes.allowed).toBe(false)
    expect(blockedRes.remaining).toBe(0)
    expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0)
  })
})
