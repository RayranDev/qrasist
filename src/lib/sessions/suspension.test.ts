import { describe, it, expect } from 'vitest'
import {
  dayOfWeekOf,
  isValidIsoDate,
  resolveSuspendedSessionTimes,
  validateSuspensionDay,
  validateSuspensionReason,
} from './suspension'

describe('validateSuspensionReason', () => {
  it('requires at least 5 characters after trimming', () => {
    expect(validateSuspensionReason('   ab  ')).toMatch(/al menos 5/)
    expect(validateSuspensionReason('Corte de energía')).toBeNull()
  })

  it('caps the length', () => {
    expect(validateSuspensionReason('x'.repeat(501))).toMatch(/no puede superar/)
    expect(validateSuspensionReason('x'.repeat(500))).toBeNull()
  })
})

describe('isValidIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidIsoDate('2026-03-02')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(isValidIsoDate('2026-3-2')).toBe(false)
    expect(isValidIsoDate('hoy')).toBe(false)
  })
})

describe('validateSuspensionDay', () => {
  const period = { start_date: '2026-01-26', end_date: '2026-06-06' }

  it('lets a professor suspend only today', () => {
    const base = { role: 'PROFESSOR' as const, today: '2026-03-02', period }
    expect(validateSuspensionDay({ ...base, date: '2026-03-02' })).toBeNull()
    expect(validateSuspensionDay({ ...base, date: '2026-03-03' })).toMatch(/hoy/)
    expect(validateSuspensionDay({ ...base, date: '2026-03-01' })).toMatch(/hoy/)
  })

  it('does not need a period for a professor suspending today', () => {
    expect(
      validateSuspensionDay({
        role: 'PROFESSOR',
        date: '2026-03-02',
        today: '2026-03-02',
        period: null,
      })
    ).toBeNull()
  })

  it('lets an admin pick any date inside the period, bounds included', () => {
    const base = { role: 'ADMIN' as const, today: '2026-03-02', period }
    expect(validateSuspensionDay({ ...base, date: '2026-01-26' })).toBeNull()
    expect(validateSuspensionDay({ ...base, date: '2026-06-06' })).toBeNull()
    expect(validateSuspensionDay({ ...base, date: '2026-04-15' })).toBeNull()
    expect(validateSuspensionDay({ ...base, date: '2026-01-25' })).toMatch(/fuera del período/)
    expect(validateSuspensionDay({ ...base, date: '2026-06-07' })).toMatch(/fuera del período/)
  })

  it('asks an admin for a period with dates (no period -> clear error)', () => {
    const base = { role: 'ADMIN' as const, today: '2026-03-02', date: '2026-03-02' }
    expect(validateSuspensionDay({ ...base, period: null })).toMatch(/período con fechas/)
    expect(
      validateSuspensionDay({ ...base, period: { start_date: null, end_date: null } })
    ).toMatch(/período con fechas/)
  })

  it('rejects malformed dates', () => {
    expect(
      validateSuspensionDay({
        role: 'ADMIN',
        date: '2026-02-30',
        today: '2026-03-02',
        period,
      })
    ).toMatch(/no es válida/)
  })
})

describe('resolveSuspendedSessionTimes', () => {
  const now = new Date('2026-03-02T13:20:00Z') // Monday 08:20 Bogota
  const blocks = [
    {
      day_of_week: 1,
      start_time: '10:00:00',
      end_time: '12:00:00',
      modality: 'PRESENCIAL' as const,
    },
    { day_of_week: 1, start_time: '08:00', end_time: '10:00', modality: 'VIRTUAL' as const },
    { day_of_week: 3, start_time: '14:00', end_time: '16:00', modality: 'PRESENCIAL' as const },
  ]

  it('spans from the first block start to the last block end of that weekday', () => {
    const times = resolveSuspendedSessionTimes({
      isoDate: '2026-03-02',
      dayOfWeek: dayOfWeekOf('2026-03-02'),
      blocks,
      now,
      today: '2026-03-02',
    })

    expect(times.date.toISOString()).toBe('2026-03-02T13:00:00.000Z') // 08:00 Bogota
    expect(times.classEndsAt.toISOString()).toBe('2026-03-02T17:00:00.000Z') // 12:00 Bogota
    expect(times.modality).toBe('VIRTUAL')
  })

  it('uses the current instant for today when no block matches', () => {
    const times = resolveSuspendedSessionTimes({
      isoDate: '2026-03-03', // Tuesday, no block
      dayOfWeek: dayOfWeekOf('2026-03-03'),
      blocks,
      now: new Date('2026-03-03T15:00:00Z'),
      today: '2026-03-03',
    })

    expect(times.date.toISOString()).toBe('2026-03-03T15:00:00.000Z')
    expect(times.classEndsAt.toISOString()).toBe('2026-03-03T15:00:00.000Z')
    expect(times.modality).toBeNull()
  })

  it('uses noon in Bogota for another day with no block', () => {
    const times = resolveSuspendedSessionTimes({
      isoDate: '2026-03-10',
      dayOfWeek: dayOfWeekOf('2026-03-10'),
      blocks: [],
      now,
      today: '2026-03-02',
    })

    expect(times.date.toISOString()).toBe('2026-03-10T17:00:00.000Z')
  })

  it('stays on the same Bogota day (never spills into the next UTC day)', () => {
    const times = resolveSuspendedSessionTimes({
      isoDate: '2026-03-04', // Wednesday 14:00-16:00 Bogota = 19:00-21:00 UTC
      dayOfWeek: dayOfWeekOf('2026-03-04'),
      blocks,
      now,
      today: '2026-03-02',
    })

    expect(times.date.toISOString()).toBe('2026-03-04T19:00:00.000Z')
    expect(times.classEndsAt.toISOString()).toBe('2026-03-04T21:00:00.000Z')
  })
})
