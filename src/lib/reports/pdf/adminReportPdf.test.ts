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
    expect(all).toContain('cada columna con el nombre de un corte')
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
    expect(all).not.toContain('cada columna con el nombre de un corte')
    expect(all).toContain('% Asist.')
  })

  it('lays out five cuts (one with a legacy over-long name) without text leaving the page', async () => {
    const fiveCuts = [
      { id: 'k1', name: 'Corte 1', startDate: '2026-02-01', endDate: '2026-02-15', sequence: 1 },
      { id: 'k2', name: 'Corte 2', startDate: '2026-02-16', endDate: '2026-03-15', sequence: 2 },
      { id: 'k3', name: 'Corte 3', startDate: '2026-03-16', endDate: '2026-03-31', sequence: 3 },
      { id: 'k4', name: 'Corte 4', startDate: '2026-04-01', endDate: '2026-04-15', sequence: 4 },
      {
        id: 'k5',
        name: `Evaluación final integradora de todo el semestre ${'muy larga '.repeat(8)}`,
        startDate: '2026-04-16',
        endDate: '2026-04-30',
        sequence: 5,
      },
    ]
    const report = buildAttendanceReport({
      subjects: [{ ...subject, cuts: fiveCuts }],
      sessions,
      enrollments: enrollments.slice(0, 12),
      attendances,
      justifications,
    })
    const bytes = await renderAdminReportPdf(report, {
      periodName: '2026-1',
      scopeLabel: 'Todo el período',
    })

    const all = (await extractPages(bytes)).join('\n')
    for (const n of [1, 2, 3, 4]) expect(all).toContain(`% Corte ${n}`)
    // The long name is truncated with an ellipsis instead of overflowing.
    // (the narrow column wraps it mid-word, so only the start and the ellipsis are matched)
    expect(all).toContain('% Evaluaci')
    expect(all).toContain('muy larg...')
    expect(all).not.toContain('muy larga muy larga muy larga muy larga')
    expect(all).toContain('% Asist. (general)')

    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const pageWidth = page.view[2]
      const content = await page.getTextContent()
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue
        // Text must stay inside the page (36 pt margins are respected by the table layout).
        expect(item.transform[4]).toBeGreaterThanOrEqual(0)
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(pageWidth)
      }
    }
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
