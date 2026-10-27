// @vitest-environment node
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildRangeReport } from './attendanceRangeReport'
import { buildRangeWorkbook } from './attendanceRangeWorkbook'

const subject = {
  id: 's1',
  code: 'MAT-101',
  name: 'Cálculo',
  professorId: 'p1',
  professorName: 'Luis Prof',
  careerNames: [],
  policy: {},
  cuts: [],
}

const report = buildRangeReport({
  subjects: [subject],
  sessions: [
    {
      id: 'x1',
      subjectId: 's1',
      date: '2026-10-05T13:00:00Z',
      isActive: true,
      suspendedAt: null,
    },
    {
      id: 'x2',
      subjectId: 's1',
      date: '2026-10-06T13:00:00Z',
      isActive: false,
      suspendedAt: '2026-10-01T10:00:00Z',
    },
  ],
  enrollments: [
    { subjectId: 's1', studentId: 'a', studentCode: '001', studentName: 'Ana' },
    {
      subjectId: 's1',
      studentId: 'b',
      studentCode: '002',
      studentName: '=HYPERLINK("http://evil","x")',
    },
  ],
  attendances: [
    {
      sessionId: 'x1',
      studentId: 'a',
      status: 'LATE',
      markedBy: null,
      manualReason: null,
      scannedAt: '2026-10-05T13:20:00Z',
    },
  ],
  justifications: [],
  held: { now: new Date('2026-10-20T12:00:00Z'), defaultClassMinutes: 90 },
  from: '2026-10-05',
  to: '2026-10-09',
})

async function readBack() {
  const original = await buildRangeWorkbook(report, {
    scopeLabel: '05/10/2026 - 09/10/2026',
    filtersLabel: 'Materia: MAT-101 Cálculo',
    generatedAt: new Date('2026-10-20T20:45:00Z'),
  })
  const buffer = await original.xlsx.writeBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  return workbook
}

function headerOf(sheet: ExcelJS.Worksheet): string[] {
  return (sheet.getRow(1).values as unknown[]).slice(1).map(String)
}

/** A re-read workbook has no column keys, so cells are found through the header row. */
function cell(sheet: ExcelJS.Worksheet, row: ExcelJS.Row | number, header: string) {
  const index = headerOf(sheet).indexOf(header) + 1
  expect(index, `missing column ${header}`).toBeGreaterThan(0)
  return (typeof row === 'number' ? sheet.getRow(row) : row).getCell(index)
}

describe('buildRangeWorkbook', () => {
  it('has the detail, summary and info sheets in that order', async () => {
    const workbook = await readBack()
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      'Detalle',
      'Resumen por materia',
      'Información',
    ])
  })

  it('writes the detail headers and one row per enrolled student and class', async () => {
    const sheet = (await readBack()).getWorksheet('Detalle') as ExcelJS.Worksheet
    expect(headerOf(sheet)).toEqual([
      'Fecha',
      'Hora de la Clase',
      'Código Materia',
      'Materia',
      'Docente',
      'Código Estudiante',
      'Estudiante',
      'Estado',
      'Hora de Registro',
    ])
    // 2 students x (1 held + 1 suspended) class.
    expect(sheet.rowCount).toBe(1 + 4)

    const rows = sheet.getRows(2, 4) as ExcelJS.Row[]
    const byStatus = rows.map((r) => String(cell(sheet, r, 'Estado').value))
    // Ordered by date, then subject, then student name (the "=..." name sorts first).
    expect(byStatus).toEqual(['Ausente', 'Tarde', 'Clase suspendida', 'Clase suspendida'])

    const late = rows[1]
    expect(cell(sheet, late, 'Fecha').value).toBe('05/10/2026')
    expect(cell(sheet, late, 'Código Materia').value).toBe('MAT-101')
    expect(cell(sheet, late, 'Docente').value).toBe('Luis Prof')
    expect(cell(sheet, late, 'Estudiante').value).toBe('Ana')
    // Scan time is the Bogota hour, not UTC (13:20Z = 8:20 a. m.).
    expect(String(cell(sheet, late, 'Hora de Registro').value)).toMatch(/8:20/)
    expect(cell(sheet, rows[0], 'Hora de Registro').value ?? '').toBe('')
  })

  it('paints the status cell by state', async () => {
    const sheet = (await readBack()).getWorksheet('Detalle') as ExcelJS.Worksheet
    const fill = (rowNumber: number) =>
      (cell(sheet, rowNumber, 'Estado').fill as ExcelJS.FillPattern).fgColor?.argb
    expect(fill(2)).toBe('FFFFC7CE') // Ausente
    expect(fill(3)).toBe('FFFFEB9C') // Tarde
    expect(fill(4)).toBe('FFEDEDED') // Clase suspendida
  })

  it('neutralizes formula injection in text cells', async () => {
    const sheet = (await readBack()).getWorksheet('Detalle') as ExcelJS.Worksheet
    const names = (sheet.getColumn(headerOf(sheet).indexOf('Estudiante') + 1).values as unknown[])
      .slice(2)
      .map(String)
    const injected = names.find((n) => n.includes('HYPERLINK'))
    expect(injected).toBeDefined()
    expect(injected?.startsWith("'=")).toBe(true)
    expect(names.some((n) => n.startsWith('='))).toBe(false)
  })

  it('summarizes per subject with held, suspended and attendance percentage', async () => {
    const sheet = (await readBack()).getWorksheet('Resumen por materia') as ExcelJS.Worksheet
    expect(headerOf(sheet)).toEqual([
      'Código Materia',
      'Materia',
      'Docente',
      'Inscritos',
      'Clases Dictadas',
      'Clases Suspendidas',
      'Asistencias',
      'Tardanzas',
      'Justificadas',
      'Ausencias',
      '% Asistencia',
    ])
    const row = sheet.getRow(2)
    expect(cell(sheet, row, 'Código Materia').value).toBe('MAT-101')
    expect(cell(sheet, row, 'Inscritos').value).toBe(2)
    expect(cell(sheet, row, 'Clases Dictadas').value).toBe(1)
    expect(cell(sheet, row, 'Clases Suspendidas').value).toBe(1)
    expect(cell(sheet, row, 'Asistencias').value).toBe(1)
    expect(cell(sheet, row, 'Tardanzas').value).toBe(1)
    expect(cell(sheet, row, 'Ausencias').value).toBe(1)
    expect(cell(sheet, row, '% Asistencia').value).toBe(50)
  })

  it('records scope, filters and generation time in the info sheet', async () => {
    const sheet = (await readBack()).getWorksheet('Información') as ExcelJS.Worksheet
    const fields = new Map<string, string>()
    sheet.eachRow((row, n) => {
      if (n > 1) fields.set(String(row.getCell(1).value), String(row.getCell(2).value))
    })
    expect(fields.get('Rango')).toBe('05/10/2026 - 09/10/2026')
    expect(fields.get('Filtros')).toBe('Materia: MAT-101 Cálculo')
    expect(fields.has('Generado (hora de Bogotá)')).toBe(true)
  })
})
