// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildProfessorUserReport } from '../professorUserReport'
import type { ReportSubjectInput } from '../attendanceReport'
import { renderProfessorUserReportPdf } from './professorUserReportPdf'
import { extractPages } from './reportFixtures'

const cuts = [
  { id: 'k1', name: 'Corte 1', startDate: '2026-02-01', endDate: '2026-03-15', sequence: 1 },
  { id: 'k2', name: 'Corte 2', startDate: '2026-03-16', endDate: '2026-04-30', sequence: 2 },
]

const subject = (id: string, name: string, withCuts: boolean): ReportSubjectInput => ({
  id,
  code: id.toUpperCase(),
  name,
  professorId: 'p1',
  professorName: 'Ana',
  careerNames: [],
  policy: {},
  periodName: '2026-1',
  cuts: withCuts ? cuts : [],
})

function report(withCuts: boolean) {
  return buildProfessorUserReport({
    subjects: [subject('mat', 'Materia', withCuts)],
    sessions: [
      {
        id: 's1',
        subjectId: 'mat',
        date: '2026-02-10T17:00:00Z',
        isActive: true,
        suspendedAt: null,
      },
      {
        id: 's2',
        subjectId: 'mat',
        date: '2026-03-17T17:00:00Z',
        isActive: true,
        suspendedAt: null,
      },
    ],
    enrollments: [{ subjectId: 'mat', studentId: 'st', studentCode: 'S1', studentName: 'Alumno' }],
    attendances: [],
    classStats: [],
    from: null,
    to: null,
  })
}

describe('professor user report PDF', () => {
  it('adds a per-cut section with the general row when the subject has cuts', async () => {
    const pages = await extractPages(
      await renderProfessorUserReportPdf(report(true), {
        professorName: 'Ana',
        scopeLabel: 'Todo el historial',
      })
    )
    const all = pages.join('\n')
    expect(all).toContain('Resumen por corte')
    expect(all).toContain('Corte 1')
    expect(all).toContain('Corte 2')
    expect(all).toContain('General (período)')
    expect(all.indexOf('Corte 2')).toBeLessThan(all.indexOf('General (período)'))
  })

  it('labels the general row as range for a ranged report', async () => {
    const all = (
      await extractPages(
        await renderProfessorUserReportPdf(report(true), {
          professorName: 'Ana',
          scopeLabel: '01/02/2026 - 28/02/2026',
          ranged: true,
        })
      )
    ).join('\n')
    expect(all).toContain('General (rango)')
    expect(all).not.toContain('General (período)')
  })

  it('has no per-cut section when no subject has cuts', async () => {
    const all = (
      await extractPages(
        await renderProfessorUserReportPdf(report(false), {
          professorName: 'Ana',
          scopeLabel: 'Todo el historial',
        })
      )
    ).join('\n')
    expect(all).not.toContain('Resumen por corte')
    expect(all).not.toContain('General (')
    expect(all).toContain('Resumen por materia')
  })
})
