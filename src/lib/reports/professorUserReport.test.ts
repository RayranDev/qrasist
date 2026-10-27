import { describe, it, expect } from 'vitest'
import { buildProfessorUserReport } from './professorUserReport'
import type {
  ReportAttendanceInput,
  ReportEnrollmentInput,
  ReportSessionInput,
  ReportSubjectInput,
} from './attendanceReport'

const subject = (id: string, code: string, name: string): ReportSubjectInput => ({
  id,
  code,
  name,
  professorId: 'p1',
  professorName: 'Luis Prof',
  careerNames: [],
  policy: {},
  periodName: '2026-2',
  cuts: [],
})

const session = (
  id: string,
  subjectId: string,
  date: string,
  extra: Partial<ReportSessionInput> = {}
): ReportSessionInput => ({
  id,
  subjectId,
  date,
  classEndsAt: null,
  isActive: true,
  suspendedAt: null,
  ...extra,
})

const enrollment = (subjectId: string, studentId: string): ReportEnrollmentInput => ({
  subjectId,
  studentId,
  studentCode: studentId,
  studentName: studentId.toUpperCase(),
})

const attendance = (sessionId: string, studentId: string): ReportAttendanceInput => ({
  sessionId,
  studentId,
  status: 'PRESENT',
  markedBy: null,
  manualReason: null,
})

const held = { now: new Date('2026-10-30T12:00:00Z'), defaultClassMinutes: 90 }

describe('buildProfessorUserReport', () => {
  const base = {
    subjects: [subject('s2', 'ZOO-200', 'Zoología'), subject('s1', 'ART-100', 'Arte')],
    enrollments: [enrollment('s1', 'a'), enrollment('s1', 'b'), enrollment('s2', 'c')],
    sessions: [
      session('x1', 's1', '2026-10-05T13:00:00Z', { modality: 'VIRTUAL' }),
      session('x2', 's1', '2026-10-06T13:00:00Z', {
        suspendedAt: '2026-10-01T10:00:00Z',
        suspensionReason: 'Paro de transporte',
        isActive: false,
      }),
      session('x3', 's1', '2026-10-07T13:00:00Z', { isActive: false }),
      session('y1', 's2', '2026-10-05T15:00:00Z', {
        isMakeup: true,
        makeupReason: 'Reposición del festivo',
      }),
    ],
    attendances: [attendance('x1', 'a'), attendance('x1', 'b'), attendance('y1', 'c')],
    classStats: [
      { subjectId: 's1', scheduled: 5, held: 1, suspended: 1, omitted: 3, omittedJustified: 1 },
    ],
    from: null,
    to: null,
    held,
  }

  it('counts held, suspended and omitted classes per subject', () => {
    const { subjects } = buildProfessorUserReport(base)
    expect(subjects.map((s) => s.subjectCode)).toEqual(['ART-100', 'ZOO-200'])
    expect(subjects[0]).toMatchObject({
      enrolled: 2,
      scheduled: 5,
      held: 1,
      suspended: 1,
      omitted: 3,
      omittedJustified: 1,
      avgAttendancePct: 100,
      periodName: '2026-2',
    })
    // Subject without a weekly schedule: no scheduled/omitted figures, held still counted.
    expect(subjects[1]).toMatchObject({
      scheduled: null,
      omitted: null,
      omittedJustified: null,
      held: 1,
      suspended: 0,
    })
  })

  it('lists every class with its state and attendance against enrolled', () => {
    const { classes } = buildProfessorUserReport(base)
    expect(classes.map((c) => [c.sessionId, c.state, c.attendees, c.enrolled])).toEqual([
      ['x1', 'HELD', 2, 2],
      ['y1', 'HELD', 1, 1],
      ['x2', 'SUSPENDED', 0, 2],
      ['x3', 'ARCHIVED', 0, 2],
    ])
    expect(classes.find((c) => c.sessionId === 'x2')?.note).toBe('Paro de transporte')
    expect(classes.find((c) => c.sessionId === 'y1')).toMatchObject({
      isMakeup: true,
      note: 'Reposición del festivo',
    })
    expect(classes.find((c) => c.sessionId === 'x1')?.modality).toBe('VIRTUAL')
  })

  it('does not count attendances of students who are no longer enrolled', () => {
    const { classes } = buildProfessorUserReport({
      ...base,
      attendances: [...base.attendances, attendance('x1', 'ghost')],
    })
    expect(classes.find((c) => c.sessionId === 'x1')?.attendees).toBe(2)
  })

  it('limits classes and held counts to the Bogota day range', () => {
    const { subjects, classes } = buildProfessorUserReport({
      ...base,
      from: '2026-10-06',
      to: '2026-10-06',
    })
    expect(classes.map((c) => c.sessionId)).toEqual(['x2'])
    expect(subjects[0]).toMatchObject({ held: 0, suspended: 1 })
  })

  describe('per cut', () => {
    const cuts = [
      { id: 'k1', name: 'Corte 1', startDate: '2026-10-01', endDate: '2026-10-05', sequence: 1 },
      { id: 'k2', name: 'Corte 2', startDate: '2026-10-06', endDate: '2026-10-31', sequence: 2 },
    ]
    const withCuts = {
      ...base,
      subjects: [
        { ...subject('s1', 'ART-100', 'Arte'), cuts },
        subject('s2', 'ZOO-200', 'Zoología'),
      ],
      sessions: [...base.sessions, session('x4', 's1', '2026-10-12T13:00:00Z')],
      attendances: [...base.attendances, attendance('x4', 'a')],
      cutClassStats: [
        {
          cutId: 'k1',
          stats: [
            {
              subjectId: 's1',
              scheduled: 1,
              held: 1,
              suspended: 0,
              omitted: 0,
              omittedJustified: 0,
            },
          ],
        },
        {
          cutId: 'k2',
          stats: [
            {
              subjectId: 's1',
              scheduled: 4,
              held: 1,
              suspended: 1,
              omitted: 2,
              omittedJustified: 1,
            },
          ],
        },
      ],
    }

    it('breaks a subject with cuts into held, suspended, omitted and attendance per cut', () => {
      const { subjects } = buildProfessorUserReport(withCuts)
      expect(subjects[0].cuts).toEqual([
        {
          cutId: 'k1',
          name: 'Corte 1',
          sequence: 1,
          scheduled: 1,
          held: 1,
          suspended: 0,
          omitted: 0,
          omittedJustified: 0,
          avgAttendancePct: 100,
        },
        {
          cutId: 'k2',
          name: 'Corte 2',
          sequence: 2,
          scheduled: 4,
          held: 1,
          suspended: 1,
          omitted: 2,
          omittedJustified: 1,
          // a attended the only held class of the cut, b did not.
          avgAttendancePct: 50,
        },
      ])
      // The general row still covers the whole scope.
      expect(subjects[0]).toMatchObject({ held: 2, suspended: 1 })
    })

    it('adds "Sin corte asignado" for held classes before the first cut and between cuts, so everything reconciles', () => {
      const gappy = [
        { id: 'k1', name: 'Corte 1', startDate: '2026-10-01', endDate: '2026-10-05', sequence: 1 },
        { id: 'k2', name: 'Corte 2', startDate: '2026-10-12', endDate: '2026-10-31', sequence: 2 },
      ]
      const input = {
        ...withCuts,
        subjects: [{ ...subject('s1', 'ART-100', 'Arte'), cuts: gappy }],
        sessions: [
          ...withCuts.sessions.filter((s) => s.subjectId === 's1'),
          session('pre', 's1', '2026-09-28T13:00:00Z'), // before the first cut
          session('gap', 's1', '2026-10-08T13:00:00Z'), // between cuts
        ],
        // a attends only the class before the first cut.
        attendances: [...withCuts.attendances, attendance('pre', 'a')],
        cutClassStats: [],
      }
      const [row] = buildProfessorUserReport(input).subjects
      const unassigned = row.cuts.find((c) => c.cutId === null)!
      expect(unassigned).toMatchObject({
        name: 'Sin corte asignado',
        sequence: null,
        held: 2,
        // The suspended class of Oct 6 also sits in the gap.
        suspended: 1,
        scheduled: null,
        omitted: null,
        avgAttendancePct: 25,
      })
      // Last, after the real cuts.
      expect(row.cuts.map((c) => c.name)).toEqual(['Corte 1', 'Corte 2', 'Sin corte asignado'])
      // Cuts + unassigned add up to the general figure (no date range).
      expect(row.cuts.reduce((sum, c) => sum + c.held, 0)).toBe(row.held)
    })

    it('adds no unassigned row when every held class falls inside a cut', () => {
      const { subjects } = buildProfessorUserReport(withCuts)
      expect(subjects[0].cuts.some((c) => c.cutId === null)).toBe(false)
    })

    it('leaves subjects without cuts with no cut breakdown', () => {
      const { subjects } = buildProfessorUserReport(withCuts)
      expect(subjects[1].cuts).toEqual([])
    })

    it('keeps the cut figures semester-wide when the report has a narrower range', () => {
      const whole = buildProfessorUserReport(withCuts).subjects[0]
      const ranged = buildProfessorUserReport({
        ...withCuts,
        from: '2026-10-12',
        to: '2026-10-12',
      }).subjects[0]
      expect(ranged.cuts).toEqual(whole.cuts)
      expect(ranged).toMatchObject({ held: 1, suspended: 0 })
    })

    it('reports a cut without schedule data as unscheduled instead of inventing figures', () => {
      const { subjects } = buildProfessorUserReport({ ...withCuts, cutClassStats: [] })
      expect(subjects[0].cuts.map((c) => [c.scheduled, c.omitted])).toEqual([
        [null, null],
        [null, null],
      ])
      expect(subjects[0].cuts.map((c) => c.held)).toEqual([1, 1])
    })
  })

  it('returns empty lists for a professor without subjects', () => {
    expect(
      buildProfessorUserReport({
        subjects: [],
        sessions: [],
        enrollments: [],
        attendances: [],
        classStats: [],
        from: null,
        to: null,
      })
    ).toEqual({ subjects: [], classes: [] })
  })
})
