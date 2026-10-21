// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildAttendanceReport, buildClassList, resolveReportRange } from '../attendanceReport'
import { renderProfessorReportPdf } from './professorReportPdf'
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

describe('professor report PDF', () => {
  it('renders students with per-cut percentages, classes and annex', async () => {
    const report = buildAttendanceReport({
      subjects: [subject],
      sessions,
      enrollments,
      attendances,
      justifications,
    })
    const bytes = await renderProfessorReportPdf(report, {
      subjectCode: subject.code,
      subjectName: subject.name,
      professorName: 'Ángela Muñoz',
      periodName: '2026-1',
      scopeLabel: 'Todo el período',
      cuts,
      classes: buildClassList(
        sessions,
        attendances,
        new Set(enrollments.map((e) => e.studentId)),
        resolveReportRange(cuts)!
      ),
    })

    expect(pdfBytesToBuffer(bytes).subarray(0, 5).toString()).toBe('%PDF-')
    const all = (await extractPages(bytes)).join('\n')
    expect(all).toContain('Reporte de asistencia de la materia')
    expect(all).toContain('DER101')
    expect(all).toContain('% Corte 1')
    expect(all).toContain('% Corte 2')
    expect(all).toContain('Suspensión: Paro de transporte')
    expect(all).toContain('Reposición: Reposición del paro')
    expect(all).toContain('Virtual')
    expect(all).toContain('Marca manual')
    expect(all).toContain('Excusa aprobada')
  })
})
