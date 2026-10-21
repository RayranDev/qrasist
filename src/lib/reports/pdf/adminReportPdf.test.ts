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
    expect(all).toContain('Ángela Muñoz')
    // La marca manual con caracteres no codificables se degrada, no rompe.
    expect(all).toContain('Falló el QR del aula cžš ?')
    expect(all).toContain('Incapacidad médica')
    expect(all).toContain(`Página ${pages.length} de ${pages.length}`)
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
