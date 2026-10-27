import { describe, expect, it } from 'vitest'
import { sanitizeSearchTerm } from './searchTerm'

describe('sanitizeSearchTerm', () => {
  it('returns an empty string for missing input', () => {
    expect(sanitizeSearchTerm(undefined)).toBe('')
    expect(sanitizeSearchTerm(null)).toBe('')
    expect(sanitizeSearchTerm('   ')).toBe('')
  })

  it('trims surrounding whitespace and keeps the inner text', () => {
    expect(sanitizeSearchTerm('  Cálculo II  ')).toBe('Cálculo II')
    expect(sanitizeSearchTerm('MAT-101')).toBe('MAT-101')
  })

  it('drops characters that alter the .or() filter grammar', () => {
    expect(sanitizeSearchTerm('a,b')).toBe('ab')
    expect(sanitizeSearchTerm('name.eq.x),(id.neq.y')).toBe('name.eq.xid.neq.y')
  })

  it('drops LIKE wildcards and escapes', () => {
    expect(sanitizeSearchTerm('50%')).toBe('50')
    expect(sanitizeSearchTerm('a*b\\c')).toBe('abc')
  })

  it('caps the length', () => {
    expect(sanitizeSearchTerm('x'.repeat(300))).toHaveLength(100)
    expect(sanitizeSearchTerm('x'.repeat(300), 80)).toHaveLength(80)
  })
})
