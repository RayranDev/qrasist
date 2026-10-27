import { describe, it, expect } from 'vitest'
import { buildStudentHistory, type ReportSessionInput } from './attendanceReport'

const subject = {
  id: 's1',
  code: 'MAT-101',
  name: 'Cálculo',
  professorId: 'p1',
  professorName: 'Luis',
  careerNames: [],
  // 4 faltas permitidas: el estado semestral se puede distinguir del del rango.
  policy: { ruleType: 'FIXED_COUNT' as const, maxCount: 4 },
  cuts: [],
}

const session = (id: string, date: string, extra: Partial<ReportSessionInput> = {}) => ({
  id,
  subjectId: 's1',
  date,
  classEndsAt: null,
  isActive: true,
  suspendedAt: null,
  ...extra,
})

const sessions = [
  session('a', '2026-09-01T13:00:00Z'),
  session('b', '2026-09-08T13:00:00Z'),
  session('c', '2026-10-05T13:00:00Z'),
  session('d', '2026-10-06T13:00:00Z', { suspendedAt: '2026-10-01T00:00:00Z', isActive: false }),
  session('e', '2026-10-07T13:00:00Z'),
]
const attendances = [
  {
    sessionId: 'a',
    studentId: 'st',
    status: 'PRESENT' as const,
    markedBy: null,
    manualReason: null,
  },
  { sessionId: 'c', studentId: 'st', status: 'LATE' as const, markedBy: null, manualReason: null },
]
const held = { now: new Date('2026-10-30T12:00:00Z'), defaultClassMinutes: 90 }

function history(range?: { from: string | null; to: string | null }) {
  return buildStudentHistory({
    studentId: 'st',
    subjects: [subject],
    sessions,
    attendances,
    justifications: [],
    held,
    range,
  })[0]
}

describe('buildStudentHistory range', () => {
  it('lists absences and a per-subject percentage without a range', () => {
    const h = history()
    expect(h.sessionsHeld).toBe(4)
    expect(h.attended).toBe(2)
    expect(h.attendancePct).toBe(50)
    expect(h.entries.map((e) => [e.sessionId, e.state])).toEqual([
      ['a', 'PRESENT'],
      ['b', 'ABSENT'],
      ['c', 'LATE'],
      ['d', 'SUSPENDED'],
      ['e', 'ABSENT'],
    ])
  })

  it('limits entries, counts and percentage to the range but keeps the semester status', () => {
    const full = history()
    const h = history({ from: '2026-10-01', to: '2026-10-31' })
    expect(h.entries.map((e) => e.sessionId)).toEqual(['c', 'd', 'e'])
    expect(h.sessionsHeld).toBe(2)
    expect(h.attended).toBe(1)
    expect(h.late).toBe(1)
    expect(h.attendancePct).toBe(50)
    expect(h.status).toBe(full.status)
    expect(h.maxAbsencesAllowed).toBe(full.maxAbsencesAllowed)
  })

  it('uses Bogota civil days for the range edges', () => {
    // 2026-09-08 13:00Z is 08:00 in Bogota, so a range ending 2026-09-08 includes it.
    const h = history({ from: '2026-09-02', to: '2026-09-08' })
    expect(h.entries.map((e) => e.sessionId)).toEqual(['b'])
  })

  it('supports open-ended ranges and returns zero counts for an empty one', () => {
    expect(history({ from: '2026-10-06', to: null }).entries.map((e) => e.sessionId)).toEqual([
      'd',
      'e',
    ])
    const empty = history({ from: '2027-01-01', to: '2027-01-31' })
    expect(empty).toMatchObject({ sessionsHeld: 0, attended: 0, attendancePct: null })
    expect(empty.entries).toEqual([])
  })
})
