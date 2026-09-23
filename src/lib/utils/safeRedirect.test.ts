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

  it('rejects backslash tricks that browsers/URL parsers treat as protocol-relative', () => {
    // El parser WHATWG normaliza "\" a "/" en esquemas especiales, así
    // que "/\evil.com" termina siendo "//evil.com" (host = evil.com).
    expect(safeRedirectPath('/\\evil.com', '/login')).toBe('/login')
  })

  it('rejects values without a leading slash', () => {
    expect(safeRedirectPath('evil.com', '/login')).toBe('/login')
    expect(safeRedirectPath('javascript:alert(1)', '/login')).toBe('/login')
  })

  it('uses "/" as the default fallback', () => {
    expect(safeRedirectPath('not-a-path')).toBe('/')
  })

  // --- Bypass real: el parser de URL borra tabs/saltos de línea del
  // input ANTES de parsear, así que "/\n/evil.com" se convertía en
  // "//evil.com" (protocol-relative) y terminaba en otro host.
  it('rejects a literal newline that the URL parser would strip into a protocol-relative URL', () => {
    expect(safeRedirectPath('/\n/evil.com', '/login')).toBe('/login')
  })

  it('rejects a literal tab for the same reason', () => {
    expect(safeRedirectPath('/\t/evil.com', '/login')).toBe('/login')
  })

  it('rejects a literal carriage return for the same reason', () => {
    expect(safeRedirectPath('/\r/evil.com', '/login')).toBe('/login')
  })

  it('rejects a %0A-decoded newline the same way as a literal one', () => {
    // Simula lo que llega si algo en el camino decodifica el query
    // param (ej. "%2F%0A%2Fevil.com" -> "/\n/evil.com") antes de
    // pasarlo -- no depende de que el caller nunca decodifique.
    const decoded = decodeURIComponent('%2F%0A%2Fevil.com')
    expect(safeRedirectPath(decoded, '/login')).toBe('/login')
  })

  it('rejects other stray control characters even without a special meaning to the URL parser', () => {
    expect(safeRedirectPath('/foo\u0000bar', '/login')).toBe('/login')
    expect(safeRedirectPath('/foo\u007Fbar', '/login')).toBe('/login')
  })

  it('normalizes dot-segments within the same origin instead of rejecting them', () => {
    expect(safeRedirectPath('/a/../b')).toBe('/b')
  })
})
