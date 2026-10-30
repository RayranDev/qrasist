import { describe, it, expect } from 'vitest'
import { evaluateStudentEnrollable } from './enrollmentGuards'

describe('evaluateStudentEnrollable', () => {
  it('passes when subject and student share a career', () => {
    expect(evaluateStudentEnrollable(['c1', 'c2'], ['c2', 'c3'])).toEqual({ ok: true })
  })

  it('fails when the subject has no career', () => {
    const result = evaluateStudentEnrollable([], ['c1'])

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ error: expect.stringMatching(/materia no pertenece/i) })
  })

  it('fails when the student has no career', () => {
    const result = evaluateStudentEnrollable(['c1'], [])

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/ninguna carrera/i) })
  })

  it('fails when careers do not overlap', () => {
    const result = evaluateStudentEnrollable(['c1'], ['c2'])

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no pertenece a la carrera/i),
    })
  })
})
