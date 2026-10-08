import { describe, it, expect } from 'vitest'
import { parseBogotaLocalDateTime, validatePastSessionInput } from './pastSession'

const NOW = new Date('2026-03-10T15:00:00Z')

const base = {
  subjectId: 'subject-1',
  startsAt: '2026-03-02T08:00',
  modality: 'PRESENCIAL',
}

describe('parseBogotaLocalDateTime', () => {
  it('reads a datetime-local value as Bogota time (UTC-5)', () => {
    expect(parseBogotaLocalDateTime('2026-03-02T08:00')?.toISOString()).toBe(
      '2026-03-02T13:00:00.000Z'
    )
  })

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(parseBogotaLocalDateTime('2026-02-31T08:00')).toBeNull()
  })

  it('rejects garbage', () => {
    expect(parseBogotaLocalDateTime('mañana')).toBeNull()
    expect(parseBogotaLocalDateTime('')).toBeNull()
  })

  it('accepts a full ISO timestamp with zone', () => {
    expect(parseBogotaLocalDateTime('2026-03-02T13:00:00Z')?.toISOString()).toBe(
      '2026-03-02T13:00:00.000Z'
    )
  })
})

describe('validatePastSessionInput', () => {
  it('accepts a past class and normalizes the note', () => {
    const result = validatePastSessionInput({ ...base, note: '  Lista en papel  ' }, NOW)
    expect(result).toMatchObject({ ok: true, modality: 'PRESENCIAL', note: 'Lista en papel' })
  })

  it('stores an empty note as null', () => {
    const result = validatePastSessionInput({ ...base, note: '   ' }, NOW)
    expect(result).toMatchObject({ ok: true, note: null })
  })

  it('rejects a class in the future', () => {
    const result = validatePastSessionInput({ ...base, startsAt: '2026-03-11T08:00' }, NOW)
    expect(result.ok).toBe(false)
  })

  it('rejects an implausibly old date', () => {
    const result = validatePastSessionInput({ ...base, startsAt: '2002-03-02T08:00' }, NOW)
    expect(result.ok).toBe(false)
  })

  it('requires a valid modality', () => {
    expect(validatePastSessionInput({ ...base, modality: 'HIBRIDA' }, NOW).ok).toBe(false)
  })

  it('requires a subject', () => {
    expect(validatePastSessionInput({ ...base, subjectId: '' }, NOW).ok).toBe(false)
  })

  it('rejects a note above 500 characters', () => {
    expect(validatePastSessionInput({ ...base, note: 'x'.repeat(501) }, NOW).ok).toBe(false)
  })
})
