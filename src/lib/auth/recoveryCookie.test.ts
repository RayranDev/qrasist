import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import { verifyRecoveryCookieValue } from './recoveryCookie'

const SECRET = 'test-service-role-secret'

function sign(userId: string, expiresAt: number): string {
  return createHmac('sha256', SECRET).update(`${userId}.${expiresAt}`).digest('hex')
}

function validCookieFor(userId: string, ttlMs = 10 * 60 * 1000): string {
  const expiresAt = Date.now() + ttlMs
  return `${expiresAt}.${sign(userId, expiresAt)}`
}

describe('verifyRecoveryCookieValue', () => {
  const originalSecret = process.env.SUPABASE_SERVICE_ROLE_KEY

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET
  })

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSecret
  })

  it('accepts a correctly signed, unexpired cookie for the right user', () => {
    const value = validCookieFor('user-1')
    expect(verifyRecoveryCookieValue(value, 'user-1')).toBe(true)
  })

  it('rejects when there is no cookie value', () => {
    expect(verifyRecoveryCookieValue(undefined, 'user-1')).toBe(false)
  })

  it('rejects a malformed value with no separator', () => {
    expect(verifyRecoveryCookieValue('garbage', 'user-1')).toBe(false)
  })

  it('rejects an expired cookie even with a valid signature', () => {
    const expiresAt = Date.now() - 1000
    const value = `${expiresAt}.${sign('user-1', expiresAt)}`
    expect(verifyRecoveryCookieValue(value, 'user-1')).toBe(false)
  })

  it('rejects a cookie signed for a different user (cannot be replayed across accounts)', () => {
    const value = validCookieFor('user-1')
    expect(verifyRecoveryCookieValue(value, 'user-2')).toBe(false)
  })

  it('rejects a forged cookie that was not produced with the real secret', () => {
    const expiresAt = Date.now() + 10 * 60 * 1000
    const forged = `${expiresAt}.${'a'.repeat(64)}`
    expect(verifyRecoveryCookieValue(forged, 'user-1')).toBe(false)
  })

  it('rejects a tampered expiry (signature no longer matches)', () => {
    const expiresAt = Date.now() + 10 * 60 * 1000
    const realSignature = sign('user-1', expiresAt)
    const tamperedExpiry = expiresAt + 60 * 60 * 1000 // intenta extender la validez
    const value = `${tamperedExpiry}.${realSignature}`
    expect(verifyRecoveryCookieValue(value, 'user-1')).toBe(false)
  })

  it('rejects a non-numeric expiry', () => {
    expect(verifyRecoveryCookieValue('not-a-number.abcd', 'user-1')).toBe(false)
  })
})
