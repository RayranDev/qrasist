import { describe, it, expect } from 'vitest'
import { buildEnrollmentsHref } from './enrollmentsHref'

const BASE = '/admin/subjects/abc/enrollments'

describe('buildEnrollmentsHref', () => {
  it('returns the bare path when there is no state', () => {
    expect(buildEnrollmentsHref(BASE, {})).toBe(BASE)
    expect(buildEnrollmentsHref(BASE, { q: '  ', page: 1, epage: 1 })).toBe(BASE)
  })

  it('keeps the search and each list page independently', () => {
    expect(buildEnrollmentsHref(BASE, { q: ' 2021 ', page: 3, epage: 2 })).toBe(
      `${BASE}?q=2021&page=3&epage=2`
    )
    expect(buildEnrollmentsHref(BASE, { epage: 4 })).toBe(`${BASE}?epage=4`)
  })

  it('encodes special characters in the search', () => {
    expect(buildEnrollmentsHref(BASE, { q: 'Ana & Co' })).toBe(`${BASE}?q=Ana+%26+Co`)
  })
})
