import { describe, it, expect } from 'vitest'
import { safeRedirectPath } from './safeRedirect'

describe('safeRedirectPath', () => {
  it('allows a plain relative path', () => {
    expect(safeRedirectPath('/reset-password')).toBe('/reset-password')
  })

  it('allows a relative path with query string', () => {
    expect(safeRedirectPath('/student/subjects?highlight=abc')).toBe(
      '/student/subjects?highlight=abc'
    )
  })

  it('falls back when next is missing', () => {
    expect(safeRedirectPath(null, '/login')).toBe('/login')
    expect(safeRedirectPath(undefined, '/login')).toBe('/login')
    expect(safeRedirectPath('', '/login')).toBe('/login')
  })

  it('rejects absolute URLs (open redirect)', () => {
    expect(safeRedirectPath('https://evil.com', '/login')).toBe('/login')
    expect(safeRedirectPath('http://evil.com/phish', '/login')).toBe('/login')
  })

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirectPath('//evil.com', '/login')).toBe('/login')
  })

  it('rejects backslash tricks that browsers treat as absolute', () => {
    expect(safeRedirectPath('/\\evil.com', '/login')).toBe('/login')
  })

  it('rejects values without a leading slash', () => {
    expect(safeRedirectPath('evil.com', '/login')).toBe('/login')
    expect(safeRedirectPath('javascript:alert(1)', '/login')).toBe('/login')
  })

  it('uses "/" as the default fallback', () => {
    expect(safeRedirectPath('not-a-path')).toBe('/')
  })
})
