import { describe, it, expect } from 'vitest'
import {
  buildAttendanceReport,
  buildClassList,
  buildStudentHistory,
  resolveReportRange,
  WHOLE_PERIOD_RANGE,
  type ReportAttendanceInput,
  type ReportEnrollmentInput,
  type ReportJustificationInput,
  type ReportSessionInput,
  type ReportSubjectInput,
} from './attendanceReport'
import type { CutInput } from '@/lib/attendance/cutsBreakdown'

const cut1: CutInput = {
  id: 'cut-1',
  name: 'Corte 1',
  startDate: '2026-02-01',
  endDate: '2026-03-15',
  sequence: 1,
}
const cut2: CutInput = {
  id: 'cut-2',
  name: 'Corte 2',
  startDate: '2026-03-16',
  endDate: '2026-04-30',
  sequence: 2,
}

function subject(overrides: Partial<ReportSubjectInput> = {}): ReportSubjectInput {
  return {
    id: 'sub-1',
    code: 'MAT101',
    name: 'Matemáticas',
    professorId: 'prof-1',
    professorName: 'Ana Docente',
    careerNames: ['Derecho'],
    policy: { ruleType: 'PERCENTAGE', maxPercentage: 20, totalPlannedSessions: 10 },
    cuts: [cut1, cut2],
    ...overrides,
  }
}

function session(id: string, date: string, overrides: Partial<ReportSessionInput> = {}) {
  return {
    id,
    subjectId: 'sub-1',
    date,
    isActive: true,
    suspendedAt: null,
    ...overrides,
  } satisfies ReportSessionInput
}

const enrollment = (studentId: string, name = studentId): ReportEnrollmentInput => ({
  subjectId: 'sub-1',
  studentId,
  studentCode: `C-${studentId}`,
  studentName: name,
})

const attendance = (
  sessionId: string,
  studentId: string,
  overrides: Partial<ReportAttendanceInput> = {}
): ReportAttendanceInput => ({
  sessionId,
  studentId,
  status: 'PRESENT',
  markedBy: null,
  manualReason: null,
  ...overrides,
})

const justification = (
  sessionId: string,
  studentId: string,
  overrides: Partial<ReportJustificationInput> = {}
): ReportJustificationInput => ({
  sessionId,
  studentId,
  subjectId: 'sub-1',
  status: 'APPROVED',
  reason: 'Incapacidad médica',
  ...overrides,
})

// 4 clases en el corte 1 y 2 en el corte 2 (mediodía en Bogotá = 17:00 UTC).
const sessions: ReportSessionInput[] = [
  session('s1', '2026-02-10T17:00:00Z'),
  session('s2', '2026-02-17T17:00:00Z'),
  session('s3', '2026-02-24T17:00:00Z'),
  session('s4', '2026-03-03T17:00:00Z'),
  session('s5', '2026-03-17T17:00:00Z'),
  session('s6', '2026-03-24T17:00:00Z'),
]

describe('resolveReportRange', () => {
  it('returns the whole period when no cut is requested', () => {
    expect(resolveReportRange([cut1, cut2])).toEqual(WHOLE_PERIOD_RANGE)
    expect(resolveReportRange([cut1, cut2], null)).toEqual(WHOLE_PERIOD_RANGE)
  })

  it('returns the cut dates, or null for an unknown cut', () => {
    expect(resolveReportRange([cut1, cut2], 'cut-2')).toEqual({
      cutId: 'cut-2',
      label: 'Corte 2',
      from: '2026-03-16',
      to: '2026-04-30',
    })
    expect(resolveReportRange([cut1], 'nope')).toBeNull()
  })
})

describe('buildAttendanceReport: counts', () => {
  it('counts present, late, justified and absences for the whole period', () => {
    const report = buildAttendanceReport({
      subjects: [subject()],
      sessions,
      enrollments: [enrollment('a')],
      attendances: [
        attendance('s1', 'a'),
        attendance('s2', 'a', { status: 'LATE' }),
        attendance('s5', 'a'),
      ],
      justifications: [justification('s3', 'a')],
    })

    const row = report.rows[0]
    expect(row).toMatchObject({
      sessionsHeld: 6,
      present: 2,
      late: 1,
      justified: 1,
      countedAbsences: 2, // s4 y s6 sin registro ni excusa
      attendancePct: 50, // 3 de 6
      absencePct: 33.3,
      career: 'Derecho',
      professorName: 'Ana Docente',
      studentCode: 'C-a',
    })
  })

  it('restricts counts and percentages to the selected cut but keeps the semester status', () => {
    const base = {
      subjects: [subject()],
      sessions,
      enrollments: [enrollment('a')],
      // Presente en todo el corte 1; ausente en las dos del corte 2.
      attendances: ['s1', 's2', 's3', 's4'].map((id) => attendance(id, 'a')),
      justifications: [],
    }
    const whole = buildAttendanceReport(base).rows[0]
    const cutOne = buildAttendanceReport({
      ...base,
      range: resolveReportRange([cut1, cut2], 'cut-1')!,
    }).rows[0]
    const cutTwo = buildAttendanceReport({
      ...base,
      range: resolveReportRange([cut1, cut2], 'cut-2')!,
    }).rows[0]

    expect(cutOne).toMatchObject({ sessionsHeld: 4, present: 4, attendancePct: 100 })
    expect(cutTwo).toMatchObject({
      sessionsHeld: 2,
      present: 0,
      attendancePct: 0,
      countedAbsences: 2,
    })
    // El estado es semestral y por lo tanto idéntico en los tres reportes.
    expect(cutOne.status).toBe(whole.status)
    expect(cutTwo.status).toBe(whole.status)
    expect(cutTwo.semesterAbsences).toBe(2)
  })

  it('reports null percentages when the range has no classes', () => {
    const report = buildAttendanceReport({
      subjects: [subject()],
      sessions: [session('s1', '2026-02-10T17:00:00Z')],
      enrollments: [enrollment('a')],
      attendances: [],
      justifications: [],
      range: resolveReportRange([cut1, cut2], 'cut-2')!,
    })
    expect(report.rows[0]).toMatchObject({
      sessionsHeld: 0,
      attendancePct: null,
      absencePct: null,
    })
    expect(report.subjectSummaries[0].avgAttendancePct).toBeNull()
  })

  it('assigns an evening class to the cut of its Bogota day', () => {
    // 20:00 Bogota del 15/03 = 01:00 UTC del 16/03: pertenece al corte 1.
    const report = buildAttendanceReport({
      subjects: [subject()],
      sessions: [session('late-night', '2026-03-16T01:00:00Z')],
      enrollments: [enrollment('a')],
      attendances: [],
      justifications: [],
      range: resolveReportRange([cut1, cut2], 'cut-1')!,
    })
    expect(report.rows[0].sessionsHeld).toBe(1)
  })
})

describe('buildAttendanceReport: ordering', () => {
  it('sorts rows by subject and then student name, with natural number order', () => {
    const report = buildAttendanceReport({
      subjects: [subject({ id: 'sub-2', code: 'B', name: 'Zeta' }), subject()],
      sessions: [],
      enrollments: [
        enrollment('x10', 'Alumno 10'),
        enrollment('x2', 'Alumno 2'),
        { ...enrollment('z'), subjectId: 'sub-2', studentName: 'Ana' },
      ],
      attendances: [],
      justifications: [],
    })
    expect(report.rows.map((r) => r.studentName)).toEqual(['Alumno 2', 'Alumno 10', 'Ana'])
    expect(report.subjectSummaries.map((s) => s.subjectCode)).toEqual(['B', 'MAT101'].sort())
  })
})

describe('buildAttendanceReport: held classes only', () => {
  it('excludes suspended and archived sessions and the attendances recorded on them', () => {
    const report = buildAttendanceReport({
      subjects: [subject()],
      sessions: [
        session('s1', '2026-02-10T17:00:00Z'),
        session('susp', '2026-02-17T17:00:00Z', {
          isActive: false,
          suspendedAt: '2026-02-16T12:00:00Z',
        }),
        session('arch', '2026-02-24T17:00:00Z', { isActive: false }),
      ],
      enrollments: [enrollment('a')],
      attendances: [attendance('s1', 'a'), attendance('susp', 'a'), attendance('arch', 'a')],
      justifications: [justification('susp', 'a')],
    })

    expect(report.rows[0]).toMatchObject({
      sessionsHeld: 1,
      present: 1,
      justified: 0,
      countedAbsences: 0,
    })
    expect(report.subjectSummaries[0]).toMatchObject({ sessionsHeld: 1, sessionsSuspended: 1 })
    expect(report.totals.sessionsSuspended).toBe(1)
  })

  it('ignores pending/rejected excuses and excuses on attended classes', () => {
    const report = buildAttendanceReport({
      subjects: [subject()],
      sessions: sessions.slice(0, 3),
      enrollments: [enrollment('a')],
      attendances: [attendance('s1', 'a')],
      justifications: [
        justification('s2', 'a', { status: 'PENDING' }),
        justification('s3', 'a', { status: 'REJECTED' }),
        justification('s1', 'a'), // ya asistió: no se cuenta dos veces
      ],
    })
    expect(report.rows[0]).toMatchObject({ justified: 0, countedAbsences: 2, excuses: [] })
  })
})

describe('buildAttendanceReport: status and policy', () => {
  it('converts lates into counted absences with latesPerAbsence', () => {
    const report = buildAttendanceReport({
      subjects: [
        subject({ policy: { maxPercentage: 20, totalPlannedSessions: 10, latesPerAbsence: 2 } }),
      ],
      sessions: sessions.slice(0, 4),
      enrollments: [enrollment('a')],
      attendances: ['s1', 's2', 's3', 's4'].map((id) => attendance(id, 'a', { status: 'LATE' })),
      justifications: [],
    })
    // 4 tardes / 2 = 2 faltas contadas aunque asistió a todo.
    expect(report.rows[0]).toMatchObject({
      late: 4,
      present: 0,
      countedAbsences: 2,
      attendancePct: 100,
    })
  })

  it('marks students as at risk or lost by the semester-wide policy', () => {
    const report = buildAttendanceReport({
      // Máx. 2 faltas permitidas (20% de 10).
      subjects: [subject()],
      sessions,
      enrollments: [enrollment('ok'), enrollment('risk'), enrollment('lost')],
      attendances: [
        ...sessions.map((s) => attendance(s.id, 'ok')),
        ...sessions.slice(0, 5).map((s) => attendance(s.id, 'risk')), // 1 falta -> queda 1 -> riesgo
        ...sessions.slice(0, 2).map((s) => attendance(s.id, 'lost')), // 4 faltas > 2
      ],
      justifications: [],
    })
    const byId = Object.fromEntries(report.rows.map((r) => [r.studentId, r]))
    expect(byId.ok.status).toBe('NORMAL')
    expect(byId.risk).toMatchObject({ status: 'WARNING', statusLabel: 'En riesgo' })
    expect(byId.lost).toMatchObject({
      status: 'FAILED_ATTENDANCE',
      statusLabel: 'Perdida por fallas',
    })

    expect(report.subjectSummaries[0]).toMatchObject({
      enrolled: 3,
      normal: 1,
      atRisk: 1,
      failed: 1,
    })
    expect(report.totals).toMatchObject({
      students: 3,
      enrollments: 3,
      atRiskStudents: 1,
      failedStudents: 1,
    })
  })
})

describe('buildAttendanceReport: observations and excuses', () => {
  it('lists manual marks with their reason and approved excuses within the range', () => {
    const report = buildAttendanceReport({
      subjects: [subject()],
      sessions,
      enrollments: [enrollment('a')],
      attendances: [
        attendance('s1', 'a'),
        attendance('s2', 'a', {
          markedBy: 'prof-1',
          manualReason: 'Falló el QR del aula',
          status: 'LATE',
        }),
        attendance('s5', 'a', { markedBy: 'admin-1', manualReason: null }),
      ],
      justifications: [justification('s3', 'a', { reason: 'Cita médica' })],
    })

    const row = report.rows[0]
    expect(row.observations).toEqual([
      { date: '2026-02-17T17:00:00Z', status: 'LATE', reason: 'Falló el QR del aula' },
      {
        date: '2026-03-17T17:00:00Z',
        status: 'PRESENT',
        reason: 'Marcada manualmente sin motivo registrado',
      },
    ])
    expect(row.excuses).toEqual([{ date: '2026-02-24T17:00:00Z', reason: 'Cita médica' }])

    const cutTwo = buildAttendanceReport({
      subjects: [subject()],
      sessions,
      enrollments: [enrollment('a')],
      attendances: [attendance('s2', 'a', { markedBy: 'prof-1', manualReason: 'x' })],
      justifications: [justification('s3', 'a')],
      range: resolveReportRange([cut1, cut2], 'cut-2')!,
    }).rows[0]
    expect(cutTwo.observations).toEqual([])
    expect(cutTwo.excuses).toEqual([])
  })

  it('includes the per-cut breakdown of the whole period, and none without cuts', () => {
    const input = {
      sessions,
      enrollments: [enrollment('a')],
      attendances: ['s1', 's2', 's5'].map((id) => attendance(id, 'a')),
      justifications: [],
    }
    const withCuts = buildAttendanceReport({ ...input, subjects: [subject()] }).rows[0]
    expect(withCuts.cuts.map((c) => [c.name, c.sessionsHeld, c.attended])).toEqual([
      ['Corte 1', 4, 2],
      ['Corte 2', 2, 1],
    ])

    // Período con fechas inválidas: usableCuts devuelve [] y nada falla.
    const noCuts = buildAttendanceReport({ ...input, subjects: [subject({ cuts: [] })] }).rows[0]
    expect(noCuts.cuts).toEqual([])
    expect(noCuts.sessionsHeld).toBe(6)
  })
})

describe('buildAttendanceReport: professors', () => {
  const stats = (overrides = {}) => ({
    subjectId: 'sub-1',
    scheduled: 10,
    held: 7,
    suspended: 1,
    omitted: 2,
    omittedJustified: 1,
    ...overrides,
  })

  it('computes compliance as (held + suspended) / scheduled from class stats', () => {
    const report = buildAttendanceReport({
      subjects: [subject()],
      sessions,
      enrollments: [],
      attendances: [],
      justifications: [],
      classStats: [stats()],
    })
    expect(report.professors).toEqual([
      expect.objectContaining({
        professorName: 'Ana Docente',
        subjects: ['MAT101 Matemáticas'],
        scheduled: 10,
        held: 7,
        suspended: 1,
        notRegistered: 2,
        notRegisteredJustified: 1,
        compliancePct: 80,
        subjectsWithoutSchedule: 0,
      }),
    ])
    expect(report.totals.complianceOverallPct).toBe(80)
  })

  it('sums several subjects of the same professor and caps compliance at 100', () => {
    const report = buildAttendanceReport({
      subjects: [subject(), subject({ id: 'sub-2', code: 'FIS102', name: 'Física' })],
      sessions: [],
      enrollments: [],
      attendances: [],
      justifications: [],
      classStats: [
        stats(),
        stats({
          subjectId: 'sub-2',
          scheduled: 4,
          held: 6,
          suspended: 0,
          omitted: 0,
          omittedJustified: 0,
        }),
      ],
    })
    expect(report.professors).toHaveLength(1)
    expect(report.professors[0]).toMatchObject({
      scheduled: 14,
      held: 13,
      suspended: 1,
      compliancePct: 100,
    })
  })

  it('counts held classes but not compliance for subjects without a weekly schedule', () => {
    const report = buildAttendanceReport({
      subjects: [subject(), subject({ id: 'sub-3', professorId: null, professorName: null })],
      sessions: [
        session('s1', '2026-02-10T17:00:00Z'),
        session('x1', '2026-02-10T17:00:00Z', { subjectId: 'sub-3' }),
        session('x2', '2026-02-11T17:00:00Z', {
          subjectId: 'sub-3',
          isActive: false,
          suspendedAt: '2026-02-10T00:00:00Z',
        }),
      ],
      enrollments: [],
      attendances: [],
      justifications: [],
      classStats: [stats({ held: 1, suspended: 0, scheduled: 2 })],
    })
    const unassigned = report.professors.find((p) => p.professorId === null)!
    expect(unassigned).toMatchObject({
      professorName: 'Sin asignar',
      held: 1,
      suspended: 1,
      scheduled: 0,
      compliancePct: null,
      subjectsWithoutSchedule: 1,
    })
    expect(report.professors.find((p) => p.professorId === 'prof-1')?.compliancePct).toBe(50)
  })
})

describe('buildAttendanceReport: filters', () => {
  const twoSubjects = {
    subjects: [subject(), subject({ id: 'sub-2', code: 'FIS102', professorId: 'prof-2' })],
    sessions: [
      session('s1', '2026-02-10T17:00:00Z'),
      session('t1', '2026-02-10T17:00:00Z', { subjectId: 'sub-2' }),
    ],
    enrollments: [enrollment('a'), { ...enrollment('a'), subjectId: 'sub-2' }, enrollment('b')],
    attendances: [attendance('s1', 'a'), attendance('t1', 'a')],
    justifications: [],
  }

  it('filters by subject, professor, student and status', () => {
    expect(buildAttendanceReport({ ...twoSubjects }).rows).toHaveLength(3)
    expect(
      buildAttendanceReport({ ...twoSubjects, filters: { subjectId: 'sub-2' } }).rows
    ).toHaveLength(1)
    expect(
      buildAttendanceReport({ ...twoSubjects, filters: { professorId: 'prof-1' } }).professors
    ).toHaveLength(1)
    expect(
      buildAttendanceReport({ ...twoSubjects, filters: { studentId: 'b' } }).rows.map(
        (r) => r.studentId
      )
    ).toEqual(['b'])

    const byStatus = buildAttendanceReport({
      ...twoSubjects,
      filters: { status: 'FAILED_ATTENDANCE' },
    })
    expect(byStatus.rows.map((r) => r.studentId)).toEqual([])
    expect(byStatus.subjectSummaries[0].enrolled).toBe(0)
  })
})

describe('buildClassList', () => {
  it('lists classes in the range with state, modality, makeup flag and attendees', () => {
    const list = buildClassList(
      [
        session('s1', '2026-02-10T17:00:00Z', { modality: 'PRESENCIAL' }),
        session('s2', '2026-02-17T17:00:00Z', {
          isActive: false,
          suspendedAt: '2026-02-16T00:00:00Z',
          suspensionReason: 'Paro',
        }),
        session('s3', '2026-02-24T17:00:00Z', { isActive: false }),
        session('s4', '2026-03-17T17:00:00Z', {
          modality: 'VIRTUAL',
          isMakeup: true,
          makeupReason: 'Reposición de paro',
        }),
      ],
      [attendance('s1', 'a'), attendance('s1', 'b'), attendance('s1', 'guest')],
      new Set(['a', 'b']),
      resolveReportRange([cut1, cut2], 'cut-1')!
    )

    expect(list.map((c) => [c.sessionId, c.state, c.attendees])).toEqual([
      ['s1', 'HELD', 2],
      ['s2', 'SUSPENDED', 0],
      ['s3', 'ARCHIVED', 0],
    ])
    expect(list[0].modality).toBe('PRESENCIAL')
    expect(list[1].suspensionReason).toBe('Paro')
  })
})

describe('buildStudentHistory', () => {
  it('builds dated entries with present/late/manual/justified/absent/suspended states', () => {
    const history = buildStudentHistory({
      studentId: 'a',
      subjects: [subject()],
      sessions: [
        session('s1', '2026-02-10T17:00:00Z'),
        session('s2', '2026-02-17T17:00:00Z'),
        session('s3', '2026-02-24T17:00:00Z'),
        session('s4', '2026-03-03T17:00:00Z'),
        session('s5', '2026-03-17T17:00:00Z', {
          isActive: false,
          suspendedAt: '2026-03-16T00:00:00Z',
          suspensionReason: 'Paro',
        }),
        session('s6', '2026-03-24T17:00:00Z', { isActive: false }),
      ],
      attendances: [
        attendance('s1', 'a'),
        attendance('s2', 'a', { status: 'LATE' }),
        attendance('s4', 'a', { markedBy: 'prof-1', manualReason: 'QR caído' }),
        attendance('s1', 'other'),
      ],
      justifications: [justification('s3', 'a'), justification('s3', 'other')],
    })

    expect(history).toHaveLength(1)
    const h = history[0]
    expect(h.entries.map((e) => [e.sessionId, e.state, e.manual])).toEqual([
      ['s1', 'PRESENT', false],
      ['s2', 'LATE', false],
      ['s3', 'JUSTIFIED', false],
      ['s4', 'PRESENT', true],
      ['s5', 'SUSPENDED', false],
    ])
    expect(h.entries[2].note).toBe('Incapacidad médica')
    expect(h.entries[3].note).toBe('QR caído')
    expect(h.entries[4].note).toBe('Paro')
    expect(h).toMatchObject({
      sessionsHeld: 4,
      attended: 3,
      late: 1,
      justified: 1,
      countedAbsences: 0,
      attendancePct: 75,
      status: 'NORMAL',
    })
    expect(h.cuts.map((c) => [c.name, c.sessionsHeld])).toEqual([
      ['Corte 1', 4],
      ['Corte 2', 0],
    ])
  })

  it('marks a missed held class as absent', () => {
    const [h] = buildStudentHistory({
      studentId: 'a',
      subjects: [subject({ cuts: [] })],
      sessions: [session('s1', '2026-02-10T17:00:00Z')],
      attendances: [],
      justifications: [],
    })
    expect(h.entries[0].state).toBe('ABSENT')
    expect(h.cuts).toEqual([])
    expect(h.countedAbsences).toBe(1)
  })
})
