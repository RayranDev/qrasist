import { describe, it, expect } from 'vitest'
import { buildSubjectsViewKey } from './subjectsViewKey'

const base = { status: 'active', q: 'calc', career: 'c1', level: 2, professor: 'p1' }

describe('buildSubjectsViewKey', () => {
  it('is stable for the same view', () => {
    expect(buildSubjectsViewKey({ ...base })).toBe(buildSubjectsViewKey({ ...base }))
  })

  it('ignores the page: pagination does not change the view', () => {
    const withPage = { ...base, page: 3 } as typeof base
    expect(buildSubjectsViewKey(withPage)).toBe(buildSubjectsViewKey(base))
  })

  it.each([
    ['status', { status: 'inactive' }],
    ['search', { q: 'fisica' }],
    ['career', { career: 'c2' }],
    ['level', { level: 3 }],
    ['professor', { professor: 'unassigned' }],
  ])('changes when the %s changes', (_name, patch) => {
    expect(buildSubjectsViewKey({ ...base, ...patch })).not.toBe(buildSubjectsViewKey(base))
  })

  it('does not collide when values shift between fields', () => {
    expect(buildSubjectsViewKey({ status: 'active', q: 'a|b' })).not.toBe(
      buildSubjectsViewKey({ status: 'active', q: 'a', career: 'b' })
    )
  })
})
