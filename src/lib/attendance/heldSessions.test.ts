import { describe, expect, it } from 'vitest'
import {
  buildHeldCounter,
  filterHeldSessionsFor,
  hasClassEnded,
  isSessionHeldFor,
} from './heldSessions'
import { computeAttendanceSummary } from '@/lib/utils/attendancePolicy'

const DEFAULT_MINUTES = 120
const START = '2026-10-21T13:00:00.000Z' // 08:00 Bogotá
const END = '2026-10-21T15:00:00.000Z'
const DURING = new Date('2026-10-21T14:00:00.000Z')
const AFTER = new Date('2026-10-21T15:00:01.000Z')
const NONE: ReadonlySet<string> = new Set()

describe('hasClassEnded', () => {
  it('is false while the class is running', () => {
    expect(hasClassEnded({ date: START, class_ends_at: END }, DEFAULT_MINUTES, DURING)).toBe(false)
  })

  it('is false at the exact end instant and true right after', () => {
    expect(hasClassEnded({ date: START, class_ends_at: END }, DEFAULT_MINUTES, new Date(END))).toBe(
      false
    )
    expect(hasClassEnded({ date: START, class_ends_at: END }, DEFAULT_MINUTES, AFTER)).toBe(true)
  })

  it('falls back to date + default minutes for legacy rows without class_ends_at', () => {
    expect(hasClassEnded({ date: START, class_ends_at: null }, DEFAULT_MINUTES, DURING)).toBe(false)
    expect(hasClassEnded({ date: START }, DEFAULT_MINUTES, AFTER)).toBe(true)
    // A shorter default makes the same legacy session count as ended earlier.
    expect(hasClassEnded({ date: START, class_ends_at: null }, 30, DURING)).toBe(true)
  })
})

describe('isSessionHeldFor', () => {
  const session = { id: 's1', date: START, class_ends_at: END }

  it('does not count an in-progress class the student has not attended', () => {
    expect(isSessionHeldFor(session, NONE, DURING, DEFAULT_MINUTES)).toBe(false)
  })

  it('counts an in-progress class immediately when the student already attended', () => {
    expect(isSessionHeldFor(session, new Set(['s1']), DURING, DEFAULT_MINUTES)).toBe(true)
  })

  it('does not credit attendance in another session', () => {
    expect(isSessionHeldFor(session, new Set(['other']), DURING, DEFAULT_MINUTES)).toBe(false)
  })

  it('counts an ended class regardless of attendance', () => {
    expect(isSessionHeldFor(session, NONE, AFTER, DEFAULT_MINUTES)).toBe(true)
  })

  it('uses the legacy fallback when class_ends_at is null', () => {
    const legacy = { id: 'old', date: START, class_ends_at: null }
    expect(isSessionHeldFor(legacy, NONE, DURING, DEFAULT_MINUTES)).toBe(false)
    expect(isSessionHeldFor(legacy, NONE, AFTER, DEFAULT_MINUTES)).toBe(true)
  })
})

describe('filterHeldSessionsFor', () => {
  it('keeps ended sessions plus attended in-progress ones', () => {
    const sessions = [
      { id: 'ended', date: '2026-10-20T13:00:00.000Z', class_ends_at: '2026-10-20T15:00:00.000Z' },
      { id: 'running-attended', date: START, class_ends_at: END },
      { id: 'running-missed', date: START, class_ends_at: END },
    ]
    const held = filterHeldSessionsFor(
      sessions,
      new Set(['running-attended']),
      DURING,
      DEFAULT_MINUTES
    )
    expect(held.map((s) => s.id)).toEqual(['ended', 'running-attended'])
  })
})

describe('buildHeldCounter', () => {
  const sessions = [
    {
      id: 'a1',
      subject_id: 'A',
      date: '2026-10-20T13:00:00.000Z',
      class_ends_at: '2026-10-20T15:00:00.000Z',
    },
    { id: 'a2', subject_id: 'A', date: START, class_ends_at: END }, // running
    { id: 'b1', subject_id: 'B', date: START, class_ends_at: null }, // running legacy
  ]

  it('counts ended classes for everyone and running ones only for who attended', () => {
    const held = buildHeldCounter(
      sessions,
      [
        { student_id: 'ana', session_id: 'a2' },
        { student_id: 'ana', session_id: 'a1' },
        { student_id: 'bob', session_id: 'a1' },
      ],
      DURING,
      DEFAULT_MINUTES
    )
    expect(held('ana', 'A')).toBe(2) // a1 ended + a2 attended
    expect(held('bob', 'A')).toBe(1) // a1 only; a2 still running and not attended
    expect(held('ana', 'B')).toBe(0)
  })

  it('counts everything once all classes ended', () => {
    const held = buildHeldCounter(
      sessions,
      [],
      new Date('2026-10-22T00:00:00.000Z'),
      DEFAULT_MINUTES
    )
    expect(held('anyone', 'A')).toBe(2)
    expect(held('anyone', 'B')).toBe(1)
  })

  it('ignores attendances on unknown sessions', () => {
    const held = buildHeldCounter(
      sessions,
      [{ student_id: 'ana', session_id: 'ghost' }],
      DURING,
      DEFAULT_MINUTES
    )
    expect(held('ana', 'A')).toBe(1)
  })
})

describe('risk outcome with one in-progress class (DEF-QA-05)', () => {
  const policy = { ruleType: 'PERCENTAGE' as const, maxPercentage: 20, totalPlannedSessions: 16 }
  const running = [{ id: 'only', date: START, class_ends_at: END }]

  it('is NORMAL before the student scans: the running class is not held yet', () => {
    const held = filterHeldSessionsFor(running, NONE, DURING, DEFAULT_MINUTES).length
    const summary = computeAttendanceSummary(held, 0, policy)
    expect(summary.sessionsHeld).toBe(0)
    expect(summary.absencesCount).toBe(0)
    expect(summary.status).toBe('NORMAL')
  })

  it('is NORMAL and fully credited right after the student scans', () => {
    const held = filterHeldSessionsFor(running, new Set(['only']), DURING, DEFAULT_MINUTES).length
    const summary = computeAttendanceSummary(held, 1, policy)
    expect(summary.sessionsHeld).toBe(1)
    expect(summary.attendancesCount).toBe(1)
    expect(summary.absencesCount).toBe(0)
    expect(summary.status).toBe('NORMAL')
  })

  it('becomes one absence (still NORMAL) once the class ended without scanning', () => {
    const held = filterHeldSessionsFor(running, NONE, AFTER, DEFAULT_MINUTES).length
    const summary = computeAttendanceSummary(held, 0, policy)
    expect(summary.absencesCount).toBe(1)
    expect(summary.remainingAbsences).toBe(2)
    expect(summary.status).toBe('NORMAL')
  })
})
