import { describe, it, expect } from 'vitest'
import {
  buildRangeReport,
  RangeReportTooLargeError,
  type RangeReportInput,
} from './attendanceRangeReport'
import type {
  ReportAttendanceInput,
  ReportEnrollmentInput,
  ReportSessionInput,
  ReportSubjectInput,
} from './attendanceReport'

const subject: ReportSubjectInput = {
  id: 's1',
  code: 'MAT-101',
  name: 'Cálculo',
  professorId: 'p1',
  professorName: 'Luis Prof',
  careerNames: [],
  policy: {},
  cuts: [],
}

const enrollments: ReportEnrollmentInput[] = [
  { subjectId: 's1', studentId: 'b', studentCode: '002', studentName: 'Beto' },
  { subjectId: 's1', studentId: 'a', studentCode: '001', studentName: 'Ana' },
  { subjectId: 's1', studentId: 'c', studentCode: null, studentName: 'Carla' },
]

const session = (id: string, date: string, extra: Partial<ReportSessionInput> = {}) => ({
  id,
  subjectId: 's1',
  date,
  classEndsAt: null,
  isActive: true,
  suspendedAt: null,
  ...extra,
})

const attendance = (
  sessionId: string,
  studentId: string,
  status: 'PRESENT' | 'LATE' = 'PRESENT',
  scannedAt: string | null = null
): ReportAttendanceInput => ({
  sessionId,
  studentId,
  status,
  markedBy: null,
  manualReason: null,
  scannedAt,
})

const NOW = new Date('2026-10-20T12:00:00Z')

function build(overrides: Partial<RangeReportInput> = {}) {
  return buildRangeReport({
    subjects: [subject],
    enrollments,
    sessions: [],
    attendances: [],
    justifications: [],
    held: { now: NOW, defaultClassMinutes: 90 },
    from: '2026-10-05',
    to: '2026-10-09',
    ...overrides,
  })
}

describe('buildRangeReport', () => {
  it('derives absences from enrollments and keeps the scan time', () => {
    const report = build({
      sessions: [session('ses1', '2026-10-05T13:00:00Z')],
      attendances: [
        attendance('ses1', 'a', 'PRESENT', '2026-10-05T13:02:00Z'),
        attendance('ses1', 'b', 'LATE', '2026-10-05T13:20:00Z'),
      ],
    })
    expect(report.detail.map((r) => [r.studentName, r.status])).toEqual([
      ['Ana', 'PRESENT'],
      ['Beto', 'LATE'],
      ['Carla', 'ABSENT'],
    ])
    expect(report.detail[0].scannedAt).toBe('2026-10-05T13:02:00Z')
    expect(report.detail[2]).toMatchObject({
      statusLabel: 'Ausente',
      scannedAt: null,
      studentCode: 'N/A',
      professorName: 'Luis Prof',
      subjectCode: 'MAT-101',
    })
    expect(report.summary).toEqual([
      expect.objectContaining({
        enrolled: 3,
        sessionsHeld: 1,
        sessionsSuspended: 0,
        attendances: 2,
        late: 1,
        absent: 1,
        justified: 0,
        attendancePct: 66.7,
      }),
    ])
  })

  it('marks approved excuses as justified, not absent', () => {
    const report = build({
      sessions: [session('ses1', '2026-10-05T13:00:00Z')],
      justifications: [
        { sessionId: 'ses1', studentId: 'c', subjectId: 's1', status: 'APPROVED', reason: 'x' },
        { sessionId: 'ses1', studentId: 'a', subjectId: 's1', status: 'PENDING', reason: 'x' },
      ],
    })
    const byName = Object.fromEntries(report.detail.map((r) => [r.studentName, r.status]))
    expect(byName).toEqual({ Ana: 'ABSENT', Beto: 'ABSENT', Carla: 'JUSTIFIED' })
    expect(report.summary[0]).toMatchObject({ justified: 1, absent: 2, attendancePct: 0 })
  })

  it('lists suspended classes without counting them as absences', () => {
    const report = build({
      sessions: [session('ses2', '2026-10-06T13:00:00Z', { suspendedAt: '2026-10-01T10:00:00Z' })],
      // An attendance recorded on a suspended class must not be counted.
      attendances: [attendance('ses2', 'a')],
    })
    expect(report.detail.every((r) => r.status === 'SUSPENDED')).toBe(true)
    expect(report.detail).toHaveLength(3)
    expect(report.detail[0].statusLabel).toBe('Clase suspendida')
    expect(report.summary[0]).toMatchObject({
      sessionsHeld: 0,
      sessionsSuspended: 1,
      attendances: 0,
      absent: 0,
      attendancePct: null,
    })
  })

  it('ignores archived classes and classes outside the Bogota day range', () => {
    const report = build({
      sessions: [
        session('arch', '2026-10-05T13:00:00Z', { isActive: false }),
        // 10 Oct 02:00 UTC is 9 Oct 21:00 in Bogota: still inside `to`.
        session('late-night', '2026-10-10T02:00:00Z'),
        // 5 Oct 04:00 UTC is 4 Oct 23:00 in Bogota: before `from`.
        session('before', '2026-10-05T04:00:00Z'),
        session('after', '2026-10-10T13:00:00Z'),
      ],
    })
    expect(new Set(report.detail.map((r) => r.date))).toEqual(new Set(['2026-10-09']))
    expect(report.summary[0].sessionsHeld).toBe(1)
  })

  it('does not blame anyone for a class still in progress', () => {
    const inProgress = session('now', '2026-10-20T11:30:00Z')
    const nobody = build({ sessions: [inProgress], from: '2026-10-20', to: '2026-10-20' })
    // Nobody scanned yet: the class is not held and has no rows.
    expect(nobody.detail).toEqual([])
    expect(nobody.summary[0].sessionsHeld).toBe(0)

    const someone = build({
      sessions: [inProgress],
      attendances: [attendance('now', 'a')],
      from: '2026-10-20',
      to: '2026-10-20',
    })
    expect(someone.detail.map((r) => [r.studentName, r.status])).toEqual([['Ana', 'PRESENT']])
    expect(someone.summary[0]).toMatchObject({ sessionsHeld: 1, absent: 0 })
  })

  it('skips subjects with no classes in the range and orders rows by date, subject and student', () => {
    const other: ReportSubjectInput = { ...subject, id: 's2', code: 'ART-100', name: 'Arte' }
    const report = build({
      subjects: [subject, other],
      enrollments: [
        ...enrollments,
        { subjectId: 's2', studentId: 'z', studentCode: '9', studentName: 'Zoe' },
      ],
      sessions: [
        session('late', '2026-10-06T13:00:00Z'),
        { ...session('x', '2026-10-05T13:00:00Z'), subjectId: 's2' },
        session('y', '2026-10-05T13:00:00Z'),
      ],
    })
    expect(
      report.detail.slice(0, 4).map((r) => `${r.date}|${r.subjectCode}|${r.studentName}`)
    ).toEqual([
      '2026-10-05|ART-100|Zoe',
      '2026-10-05|MAT-101|Ana',
      '2026-10-05|MAT-101|Beto',
      '2026-10-05|MAT-101|Carla',
    ])
    expect(report.summary.map((s) => s.subjectCode)).toEqual(['ART-100', 'MAT-101'])

    const empty = build({ sessions: [] })
    expect(empty.summary).toEqual([])
  })

  it('uses a placeholder for subjects without a professor', () => {
    const report = build({
      subjects: [{ ...subject, professorName: null }],
      sessions: [session('ses1', '2026-10-05T13:00:00Z')],
    })
    expect(report.detail[0].professorName).toBe('Sin asignar')
  })

  it('only treats an in-progress class as held when a currently enrolled student scanned', () => {
    const inProgress = session('now', '2026-10-20T11:30:00Z')
    const ghostOnly = build({
      sessions: [inProgress],
      // 'ghost' scanned but is no longer enrolled in the subject.
      attendances: [attendance('now', 'ghost')],
      from: '2026-10-20',
      to: '2026-10-20',
    })
    expect(ghostOnly.detail).toEqual([])
    expect(ghostOnly.summary[0]).toMatchObject({ sessionsHeld: 0, attendances: 0 })

    const enrolledToo = build({
      sessions: [inProgress],
      attendances: [attendance('now', 'ghost'), attendance('now', 'a')],
      from: '2026-10-20',
      to: '2026-10-20',
    })
    expect(enrolledToo.summary[0]).toMatchObject({ sessionsHeld: 1, attendances: 1 })
  })

  it('aborts as soon as the detail exceeds maxDetailRows', () => {
    const input = {
      sessions: [session('ses1', '2026-10-05T13:00:00Z')],
      attendances: [],
    }
    // 3 enrolled students -> 3 rows: exactly at the cap is fine, one over aborts.
    expect(build({ ...input, maxDetailRows: 3 }).detail).toHaveLength(3)
    expect(() => build({ ...input, maxDetailRows: 2 })).toThrow(RangeReportTooLargeError)
  })
})

describe('buildRangeReport per cut', () => {
  const cuts = [
    { id: 'k0', name: 'Corte 0', startDate: '2026-09-01', endDate: '2026-09-30', sequence: 0 },
    { id: 'k1', name: 'Corte 1', startDate: '2026-10-01', endDate: '2026-10-06', sequence: 1 },
    { id: 'k2', name: 'Corte 2', startDate: '2026-10-07', endDate: '2026-10-31', sequence: 2 },
  ]
  const withCuts = { ...subject, cuts }
  const sessions = [
    session('ses1', '2026-10-05T13:00:00Z'), // Corte 1
    session('ses2', '2026-10-08T13:00:00Z'), // Corte 2
    session('ses3', '2026-10-09T13:00:00Z', {
      isActive: false,
      suspendedAt: '2026-10-01T10:00:00Z',
    }), // Corte 2, suspended
  ]
  const attendances = [attendance('ses1', 'a'), attendance('ses1', 'b'), attendance('ses2', 'a')]

  it('splits the range by cut and keeps the general figures', () => {
    const [row] = build({ subjects: [withCuts], sessions, attendances }).summary
    expect(row.cuts.map((c) => c.name)).toEqual(['Corte 1', 'Corte 2'])
    expect(row.cuts[0]).toMatchObject({
      sessionsHeld: 1,
      sessionsSuspended: 0,
      attendances: 2,
      absent: 1,
      attendancePct: 66.7,
    })
    expect(row.cuts[1]).toMatchObject({
      sessionsHeld: 1,
      sessionsSuspended: 1,
      attendances: 1,
      absent: 2,
      attendancePct: 33.3,
    })
    // General = sum of the cuts for this range.
    expect(row).toMatchObject({ sessionsHeld: 2, sessionsSuspended: 1, attendances: 3, absent: 3 })
    expect(row.attendancePct).toBe(50)
  })

  it('omits cuts that do not overlap the range and lists overlapping ones with zero classes', () => {
    const report = build({
      subjects: [withCuts],
      sessions: [session('ses1', '2026-10-05T13:00:00Z')],
      attendances: [attendance('ses1', 'a')],
    })
    const cutsOfRow = report.summary[0].cuts
    expect(cutsOfRow.map((c) => c.name)).not.toContain('Corte 0')
    const corte2 = cutsOfRow.find((c) => c.name === 'Corte 2')!
    expect(corte2).toMatchObject({
      sessionsHeld: 0,
      attendances: 0,
      absent: 0,
      attendancePct: null,
    })
  })

  it('only counts the part of a cut that falls inside the range', () => {
    // Corte 2 runs through Oct 31 but the range ends on Oct 9.
    const report = build({
      subjects: [withCuts],
      sessions: [...sessions, session('late', '2026-10-20T13:00:00Z')],
      attendances,
    })
    expect(report.summary[0].cuts[1].sessionsHeld).toBe(1)
  })

  it('tags each detail row with its cut', () => {
    const { detail } = build({ subjects: [withCuts], sessions, attendances })
    const cutBySession = new Map(detail.map((r) => [r.sessionDate.slice(0, 10), r.cutName]))
    expect(cutBySession.get('2026-10-05')).toBe('Corte 1')
    expect(cutBySession.get('2026-10-08')).toBe('Corte 2')
    expect(cutBySession.get('2026-10-09')).toBe('Corte 2')
  })

  it('puts classes outside every cut in "Sin corte asignado"', () => {
    const gap = [
      { id: 'k1', name: 'Corte 1', startDate: '2026-10-01', endDate: '2026-10-06', sequence: 1 },
    ]
    const report = build({
      subjects: [{ ...subject, cuts: gap }],
      sessions: [session('ses1', '2026-10-05T13:00:00Z'), session('out', '2026-10-08T13:00:00Z')],
      attendances: [attendance('ses1', 'a'), attendance('out', 'a')],
    })
    expect(report.summary[0].cuts.map((c) => [c.name, c.cutId, c.sessionsHeld])).toEqual([
      ['Corte 1', 'k1', 1],
      ['Sin corte asignado', null, 1],
    ])
    expect(report.detail.find((r) => r.sessionDate.startsWith('2026-10-08'))?.cutName).toBe(
      'Sin corte asignado'
    )
  })

  it('has no cut data for a subject without cuts', () => {
    const report = build({ sessions, attendances })
    expect(report.summary[0].cuts).toEqual([])
    expect(report.detail.every((r) => r.cutName === '')).toBe(true)
  })
})
