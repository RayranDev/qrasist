// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildAttendanceReport, resolveReportRange } from '../attendanceReport'
import { renderAdminReportPdf } from './adminReportPdf'
import {
  attendances,
  cuts,
  enrollments,
  extractPages,
  justifications,
  pdfBytesToBuffer,
  sessions,
  subject,
} from './reportFixtures'

describe('admin report PDF', () => {
  const range = resolveReportRange(cuts, 'c1')!

  it('renders a landscape multi-page report with the institutional header and status colors', async () => {
    const report = buildAttendanceReport({
      subjects: [subject],
      sessions,
      enrollments,
      attendances,
      justifications,
      classStats: [
        {
          subjectId: 'sub-1',
          scheduled: 12,
          held: 9,
          suspended: 1,
          omitted: 2,
          omittedJustified: 1,
        },
      ],
      range,
    })
    const bytes = await renderAdminReportPdf(report, {
      periodName: '2026-1',
      scopeLabel: 'Corte 1 (01/02/2026 - 15/03/2026)',
      generatedAt: new Date('2026-10-20T20:45:00Z'),
    })

    expect(pdfBytesToBuffer(bytes).subarray(0, 5).toString()).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(8000)

    const pages = await extractPages(bytes)
    const all = pages.join('\n')
    expect(pages.length).toBeGreaterThan(2)
    expect(pages[0]).toContain('Corporación Universitaria Republicana')
    expect(pages[0]).toContain('Reporte de asistencia por corte')
    expect(pages[0]).toContain('Período: 2026-1')
    expect(pages[0]).toContain('Corte 1')
    expect(pages[0]).toContain('Generado:')
    expect(all).toContain('Niño Peña Ñandú')
    expect(all).toContain('Perdida por fallas')
    expect(all).toContain('En riesgo')
    expect(all).toContain('Cumplimiento docente')
    expect(all).toContain('penalización por tardanzas')
    expect(all).toContain('Ángela Muñoz')
    // La marca manual con caracteres no codificables se degrada, no rompe.
    expect(all).toContain('Falló el QR del aula cžš ?')
    expect(all).toContain('Incapacidad médica')
    expect(all).toContain(`Página ${pages.length} de ${pages.length}`)
  })

  it('shows per-cut columns before the general figure for a subject with cuts', async () => {
    const report = buildAttendanceReport({
      subjects: [subject],
      sessions,
      enrollments: enrollments.slice(0, 3),
      attendances,
      justifications,
    })
    const pages = await extractPages(
      await renderAdminReportPdf(report, { periodName: '2026-1', scopeLabel: 'Todo el período' })
    )
    const all = pages.join('\n')
    expect(all).toContain('% Corte 1')
    expect(all).toContain('% Corte 2')
    expect(all).toContain('% Asist. (general)')
    expect(all).toContain('cada columna "% corte"')
    const table = all.slice(all.indexOf('solo muestran la cifra general.'))
    expect(table.indexOf('% Corte 2')).toBeGreaterThan(-1)
    expect(table.indexOf('% Corte 2')).toBeLessThan(table.indexOf('% Asist. (general)'))
  })

  it('labels the general column as range when the report is scoped to one cut', async () => {
    const report = buildAttendanceReport({
      subjects: [subject],
      sessions,
      enrollments: enrollments.slice(0, 3),
      attendances,
      justifications,
      range,
    })
    const all = (
      await extractPages(
        await renderAdminReportPdf(report, { periodName: '2026-1', scopeLabel: 'Corte 1' })
      )
    ).join('\n')
    expect(all).toContain('% Asist. (rango)')
    expect(all).not.toContain('% Asist. (general)')
  })

  it('keeps the plain table (no cut columns, no cut note) for a subject without cuts', async () => {
    const report = buildAttendanceReport({
      subjects: [{ ...subject, cuts: [] }],
      sessions,
      enrollments: enrollments.slice(0, 3),
      attendances,
      justifications,
    })
    const all = (
      await extractPages(
        await renderAdminReportPdf(report, { periodName: '2026-1', scopeLabel: 'Todo el período' })
      )
    ).join('\n')
    expect(all).not.toContain('% Corte')
    expect(all).not.toContain('(general)')
    expect(all).not.toContain('cada columna "% corte"')
    expect(all).toContain('% Asist.')
  })

  it('renders for a period with no subjects', async () => {
    const report = buildAttendanceReport({
      subjects: [],
      sessions: [],
      enrollments: [],
      attendances: [],
      justifications: [],
    })
    const bytes = await renderAdminReportPdf(report, {
      periodName: 'vacío',
      scopeLabel: 'Todo el período',
    })
    const pages = await extractPages(bytes)
    expect(pages.join(' ')).toContain('No hay materias para este período y filtros.')
  })
})
