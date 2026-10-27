// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildStudentHistory } from '../attendanceReport'
import { renderStudentReportPdf } from './studentReportPdf'
import {
  attendances,
  extractPages,
  justifications,
  pdfBytesToBuffer,
  sessions,
  subject,
} from './reportFixtures'

describe('student report PDF', () => {
  it('renders the dated history with states, manual marks and per-cut breakdown', async () => {
    const history = buildStudentHistory({
      studentId: 'st-0',
      subjects: [subject],
      sessions,
      attendances,
      justifications,
    })
    const bytes = await renderStudentReportPdf(history, {
      studentName: 'Niño Peña Ñandú',
      studentCode: '20260000',
      generatedAt: new Date('2026-10-20T20:45:00Z'),
    })

    expect(pdfBytesToBuffer(bytes).subarray(0, 5).toString()).toBe('%PDF-')
    const pages = await extractPages(bytes)
    const all = pages.join('\n')
    expect(pages[0]).toContain('Historial de asistencia')
    expect(pages[0]).toContain('Niño Peña Ñandú (20260000)')
    expect(all).toContain('Introducción al Derecho')
    expect(all).toContain('Presente')
    expect(all).toContain('Tarde')
    expect(all).toContain('Suspendida')
    expect(all).toContain('Manual')
    expect(all).toContain('Código QR')
    expect(all).toContain('Corte 1')
    expect(all).toContain('Paro de transporte')
  })

  it('labels range figures apart from semester figures only when a range is given', async () => {
    const history = buildStudentHistory({
      studentId: 'st-0',
      subjects: [subject],
      sessions,
      attendances,
      justifications,
    })
    const meta = {
      studentName: 'Ana',
      studentCode: '1',
      generatedAt: new Date('2026-10-20T20:45:00Z'),
    }

    const plain = (await extractPages(await renderStudentReportPdf(history, meta))).join(' ')
    expect(plain).not.toContain('(rango)')
    expect(plain).not.toContain('Estado semestral')
    expect(plain).not.toContain('Máx. semestre')

    const ranged = (
      await extractPages(
        await renderStudentReportPdf(history, { ...meta, scopeLabel: '01/10/2026 - 31/10/2026' })
      )
    ).join(' ')
    expect(ranged).toContain('Alcance: 01/10/2026 - 31/10/2026')
    expect(ranged).toContain('Faltas (rango)')
    expect(ranged).toContain('Máx. semestre')
    expect(ranged).toContain('Estado semestral')
    expect(ranged).toContain('Corte (semestre)')
  })
})
