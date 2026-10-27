import { describe, it, expect } from 'vitest'
import { MAX_ASSIGN_SUBJECTS, normalizeSubjectIds } from './assignSubjects'

describe('normalizeSubjectIds', () => {
  it('rejects anything that is not an array', () => {
    expect(normalizeSubjectIds(undefined).ok).toBe(false)
    expect(normalizeSubjectIds('abc').ok).toBe(false)
    expect(normalizeSubjectIds({ length: 1 }).ok).toBe(false)
  })

  it('rejects an empty selection once blanks and non-strings are dropped', () => {
    expect(normalizeSubjectIds([])).toEqual({
      ok: false,
      error: 'Selecciona al menos una materia.',
    })
    expect(normalizeSubjectIds(['  ', '', 7, null]).ok).toBe(false)
  })

  it('trims and de-duplicates ids keeping the first occurrence order', () => {
    expect(normalizeSubjectIds([' a ', 'b', 'a', 'c', 'b'])).toEqual({
      ok: true,
      ids: ['a', 'b', 'c'],
    })
  })

  it('enforces the maximum batch size', () => {
    const many = Array.from({ length: MAX_ASSIGN_SUBJECTS + 1 }, (_, i) => `s${i}`)
    expect(normalizeSubjectIds(many).ok).toBe(false)
    expect(normalizeSubjectIds(many.slice(0, MAX_ASSIGN_SUBJECTS)).ok).toBe(true)
  })
})
