import { describe, it, expect } from 'vitest'
import {
  canProfessorEditSession,
  computeClassEndsAt,
  getEffectiveClassEnd,
  type ScheduleBlockTime,
} from './classWindow'

// 2026-03-02 is a Monday. Bogota is UTC-5, so 08:00 Bogota = 13:00Z.
const MONDAY_BLOCK: ScheduleBlockTime = {
  day_of_week: 1,
  start_time: '08:00:00',
  end_time: '10:00:00',
}

describe('computeClassEndsAt', () => {
  it('ends at the schedule block end when the session starts inside the block', () => {
    const start = new Date('2026-03-02T13:20:00Z') // 08:20 Bogota
    const end = computeClassEndsAt({
      start,
      schedules: [MONDAY_BLOCK],
      defaultClassMinutes: 120,
    })
    expect(end.toISOString()).toBe('2026-03-02T15:00:00.000Z') // 10:00 Bogota
  })

  it('treats an early opening (within tolerance) as inside the block', () => {
    const start = new Date('2026-03-02T12:50:00Z') // 07:50 Bogota
    const end = computeClassEndsAt({ start, schedules: [MONDAY_BLOCK], defaultClassMinutes: 120 })
    expect(end.toISOString()).toBe('2026-03-02T15:00:00.000Z')
  })

  it('falls back to start + default minutes when the day has no matching block', () => {
    const start = new Date('2026-03-03T13:00:00Z') // Tuesday
    const end = computeClassEndsAt({ start, schedules: [MONDAY_BLOCK], defaultClassMinutes: 90 })
    expect(end.toISOString()).toBe('2026-03-03T14:30:00.000Z')
  })

  it('falls back when the session starts after the block already ended', () => {
    const start = new Date('2026-03-02T16:00:00Z') // 11:00 Bogota, block ended 10:00
    const end = computeClassEndsAt({ start, schedules: [MONDAY_BLOCK], defaultClassMinutes: 60 })
    expect(end.toISOString()).toBe('2026-03-02T17:00:00.000Z')
  })

  it('falls back when the session starts far before the block', () => {
    const start = new Date('2026-03-02T11:00:00Z') // 06:00 Bogota
    const end = computeClassEndsAt({ start, schedules: [MONDAY_BLOCK], defaultClassMinutes: 60 })
    expect(end.toISOString()).toBe('2026-03-02T12:00:00.000Z')
  })

  it('uses the Bogota calendar day, not the UTC day', () => {
    // 21:00 Monday Bogota = 02:00Z Tuesday. The Monday block must not match
    // by UTC day, and a Tuesday block must not match either.
    const eveningBlock: ScheduleBlockTime = {
      day_of_week: 1,
      start_time: '18:00',
      end_time: '22:00',
    }
    const start = new Date('2026-03-03T02:00:00Z')
    const end = computeClassEndsAt({ start, schedules: [eveningBlock], defaultClassMinutes: 120 })
    expect(end.toISOString()).toBe('2026-03-03T03:00:00.000Z') // 22:00 Bogota Monday
  })

  it('never ends before the registration window closes', () => {
    const start = new Date('2026-03-02T14:58:00Z') // 09:58 Bogota, 2 minutes before block end
    const minimumEnd = new Date(start.getTime() + 5 * 60_000)
    const end = computeClassEndsAt({
      start,
      schedules: [MONDAY_BLOCK],
      defaultClassMinutes: 120,
      minimumEnd,
    })
    expect(end.toISOString()).toBe(minimumEnd.toISOString())
  })

  it('picks the latest end when blocks overlap', () => {
    const start = new Date('2026-03-02T13:30:00Z')
    const end = computeClassEndsAt({
      start,
      schedules: [MONDAY_BLOCK, { day_of_week: 1, start_time: '08:30', end_time: '11:00' }],
      defaultClassMinutes: 120,
    })
    expect(end.toISOString()).toBe('2026-03-02T16:00:00.000Z')
  })

  it('ignores blocks with malformed times', () => {
    const start = new Date('2026-03-02T13:30:00Z')
    const end = computeClassEndsAt({
      start,
      schedules: [{ day_of_week: 1, start_time: 'x', end_time: 'y' }],
      defaultClassMinutes: 45,
    })
    expect(end.toISOString()).toBe('2026-03-02T14:15:00.000Z')
  })
})

describe('getEffectiveClassEnd / canProfessorEditSession', () => {
  const date = '2026-03-02T13:00:00Z'

  it('uses class_ends_at when present', () => {
    const session = { date, class_ends_at: '2026-03-02T15:00:00Z' }
    expect(getEffectiveClassEnd(session, 120).toISOString()).toBe('2026-03-02T15:00:00.000Z')
  })

  it('falls back to date + default minutes for legacy sessions', () => {
    const session = { date, class_ends_at: null }
    expect(getEffectiveClassEnd(session, 120).toISOString()).toBe('2026-03-02T15:00:00.000Z')
  })

  it('lets the professor edit up to and including the class end', () => {
    const session = { date, class_ends_at: '2026-03-02T15:00:00Z' }
    expect(canProfessorEditSession(session, 120, new Date('2026-03-02T14:59:59Z'))).toBe(true)
    expect(canProfessorEditSession(session, 120, new Date('2026-03-02T15:00:00Z'))).toBe(true)
  })

  it('blocks the professor once the class has ended', () => {
    const session = { date, class_ends_at: '2026-03-02T15:00:00Z' }
    expect(canProfessorEditSession(session, 120, new Date('2026-03-02T15:00:01Z'))).toBe(false)
  })

  it('blocks a legacy session once date + default minutes has passed', () => {
    const session = { date, class_ends_at: null }
    expect(canProfessorEditSession(session, 120, new Date('2026-03-02T15:01:00Z'))).toBe(false)
    expect(canProfessorEditSession(session, 120, new Date('2026-03-02T14:00:00Z'))).toBe(true)
  })
})
