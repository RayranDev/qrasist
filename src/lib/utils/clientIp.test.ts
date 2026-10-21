import { describe, it, expect } from 'vitest'
import { getClientIp, sanitizeCoords } from './clientIp'

const h = (values: Record<string, string>) => ({ get: (k: string) => values[k] ?? null })

describe('getClientIp', () => {
  it('uses the first entry of x-forwarded-for', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '190.1.2.3, 10.0.0.1, 10.0.0.2' }))).toBe('190.1.2.3')
  })
  it('falls back to x-real-ip, then unknown', () => {
    expect(getClientIp(h({ 'x-real-ip': ' 181.5.6.7 ' }))).toBe('181.5.6.7')
    expect(getClientIp(h({}))).toBe('unknown')
  })
})

describe('sanitizeCoords', () => {
  it('keeps valid coordinates', () => {
    expect(sanitizeCoords({ latitude: 4.6, longitude: -74.07 })).toEqual({
      latitude: 4.6,
      longitude: -74.07,
    })
  })
  it('drops non-numeric, non-finite or out-of-range values', () => {
    expect(sanitizeCoords({ latitude: '4.6', longitude: -74 })).toBeNull()
    expect(sanitizeCoords({ latitude: NaN, longitude: -74 })).toBeNull()
    expect(sanitizeCoords({ latitude: 95, longitude: -74 })).toBeNull()
    expect(sanitizeCoords({ latitude: 4, longitude: 200 })).toBeNull()
    expect(sanitizeCoords(undefined)).toBeNull()
  })
})
