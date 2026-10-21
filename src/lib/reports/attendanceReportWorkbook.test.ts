// @vitest-environment node
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildAttendanceReport, resolveReportRange } from './attendanceReport'
import { buildAttendanceReportWorkbook } from './attendanceReportWorkbook'

const cuts = [
  { id: 'c1', name: 'Corte 1', startDate: '2026-02-01', endDate: '2026-03-15', sequence: 1 },
]

function fixtureReport() {
  const days = ['2026-02-10', '2026-02-17', '2026-02-24', '2026-03-03', '2026-03-10']
  return buildAttendanceReport({
    subjects: [
      {
        id: 'sub-1',
        code: 'DER101',
        name: 'Derecho',
        professorId: 'p1',
        professorName: 'Ana',
        careerNames: ['Derecho'],
        policy: { maxPercentage: 20, totalPlannedSessions: 10 },
        cuts,
      },
    ],
    sessions: days.map((d, i) => ({
      id: `s${i}`,
      subjectId: 'sub-1',
      date: `${d}T17:00:00Z`,
      isActive: true,
      suspendedAt: null,
    })),
    enrollments: ['ok', 'risk', 'lost'].map((id) => ({
      subjectId: 'sub-1',
      studentId: id,
      studentCode: id.toUpperCase(),
      studentName: id === 'lost' ? '=HYPERLINK("http://x")' : `Alumno ${id}`,
    })),
    attendances: [
      ...days.map((_, i) => ({
        sessionId: `s${i}`,
        studentId: 'ok',
        status: 'PRESENT' as const,
        markedBy: null,
        manualReason: null,
      })),
      ...[0, 1, 2, 3].map((i) => ({
        sessionId: `s${i}`,
        studentId: 'risk',
        status: 'PRESENT' as const,
        markedBy: 'p1',
        manualReason: 'QR caído',
      })),
      {
        sessionId: 's0',
        studentId: 'lost',
        status: 'PRESENT' as const,
        markedBy: null,
        manualReason: null,
      },
    ],
    justifications: [],
    classStats: [
      { subjectId: 'sub-1', scheduled: 6, held: 5, suspended: 0, omitted: 1, omittedJustified: 0 },
    ],
    range: resolveReportRange(cuts, 'c1')!,
  })
}

describe('buildAttendanceReportWorkbook', () => {
  it('writes the expected sheets with colored status cells and readable values', async () => {
    const workbook = await buildAttendanceReportWorkbook(fixtureReport(), {
      periodName: '2026-1',
      scopeLabel: 'Corte 1',
      generatedAt: new Date('2026-10-20T20:00:00Z'),
    })
    const buffer = await workbook.xlsx.writeBuffer()

    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(buffer)
    expect(loaded.worksheets.map((s) => s.name)).toEqual([
      'Estudiantes',
      'Resumen por materia',
      'Docentes',
      'Observaciones y excusas',
      'Información',
    ])

    const sheet = loaded.getWorksheet('Estudiantes')!
    const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1)
    expect(header).toContain('% Asistencia')
    expect(header).toContain('Estado')

    const statusCol = header.indexOf('Estado') + 1
    const byStatus = new Map<string, ExcelJS.Cell>()
    sheet.eachRow((row, n) => {
      if (n > 1) byStatus.set(String(row.getCell(statusCol).value), row.getCell(statusCol))
    })
    expect([...byStatus.keys()].sort()).toEqual(['En riesgo', 'Normal', 'Perdida por fallas'])
    expect((byStatus.get('Normal')!.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFC6EFCE')
    expect((byStatus.get('En riesgo')!.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFFFEB9C')
    expect((byStatus.get('Perdida por fallas')!.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(
      'FFFFC7CE'
    )

    // Los nombres que parecen fórmulas se neutralizan.
    const names: string[] = []
    sheet.eachRow((row, n) => {
      if (n > 1) names.push(String(row.getCell(header.indexOf('Estudiante') + 1).value))
    })
    expect(names).toContain('\'=HYPERLINK("http://x")')

    const obsCol = header.indexOf('Observaciones') + 1
    const riskRow = [...Array(sheet.rowCount).keys()]
      .map((i) => sheet.getRow(i + 1))
      .find((r) => r.getCell(statusCol).value === 'En riesgo')!
    expect(String(riskRow.getCell(obsCol).value)).toContain('QR caído')

    const professors = loaded.getWorksheet('Docentes')!
    expect(professors.getRow(2).getCell(1).value).toBe('Ana')
    expect(professors.getRow(2).getCell(8).value).toBe(83.3)
    expect(loaded.getWorksheet('Observaciones y excusas')!.rowCount).toBeGreaterThan(1)
    const info: string[] = []
    loaded.getWorksheet('Información')!.eachRow((row) => info.push(String(row.getCell(2).value)))
    expect(info.join(' ')).toContain('penalización por tardanzas')
  })
})
