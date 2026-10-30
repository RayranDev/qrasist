import { describe, it, expect } from 'vitest'
import { buildRequestsHref, isUuid, parseRequestsParams, sanitizeRequestFilters } from './filters'

const UUID = '3f2b8c1e-9a4d-4e7b-8f6a-1c2d3e4f5a6b'

describe('isUuid', () => {
  it('accepts uuids and rejects anything else', () => {
    expect(isUuid(UUID)).toBe(true)
    expect(isUuid('abc')).toBe(false)
    expect(isUuid(`${UUID}'`)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(42)).toBe(false)
  })
})

describe('sanitizeRequestFilters', () => {
  it('strips characters that alter the PostgREST or() grammar', () => {
    expect(sanitizeRequestFilters({ q: ' ana,(x)%*\\ ' }).q).toBe('anax')
  })

  it('drops ids that are not uuids', () => {
    const filters = sanitizeRequestFilters({ career: 'drop table', subjectId: UUID })

    expect(filters.career).toBeUndefined()
    expect(filters.subjectId).toBe(UUID)
  })

  it('tolerates non-string input', () => {
    expect(sanitizeRequestFilters({ q: 42, career: null }).q).toBe('')
  })
})

describe('parseRequestsParams', () => {
  it('defaults to the subject view, page 1 and no filters', () => {
    expect(parseRequestsParams({})).toEqual({
      view: 'subject',
      page: 1,
      filters: { q: '', career: undefined, subjectId: undefined },
    })
  })

  it('reads view, search, career and page', () => {
    const state = parseRequestsParams({ view: 'student', q: 'ana', career: UUID, page: '3' })

    expect(state.view).toBe('student')
    expect(state.page).toBe(3)
    expect(state.filters.q).toBe('ana')
    expect(state.filters.career).toBe(UUID)
  })

  it('falls back on garbage', () => {
    const state = parseRequestsParams({ view: 'x', page: '-4', career: 'nope' })

    expect(state.view).toBe('subject')
    expect(state.page).toBe(1)
    expect(state.filters.career).toBeUndefined()
  })
})

describe('buildRequestsHref', () => {
  const base = '/admin/enrollment-requests'

  it('omits defaults', () => {
    expect(buildRequestsHref(base, { view: 'subject', page: 1, filters: { q: '' } })).toBe(base)
  })

  it('includes only what differs from the defaults', () => {
    const href = buildRequestsHref(base, {
      view: 'student',
      page: 2,
      filters: { q: 'ana pérez', career: UUID },
    })
    const url = new URL(href, 'http://x')

    expect(url.pathname).toBe(base)
    expect(url.searchParams.get('view')).toBe('student')
    expect(url.searchParams.get('q')).toBe('ana pérez')
    expect(url.searchParams.get('career')).toBe(UUID)
    expect(url.searchParams.get('page')).toBe('2')
  })
})
