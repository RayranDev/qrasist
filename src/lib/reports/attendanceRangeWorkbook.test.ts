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

describe('buildRangeWorkbook per cut', () => {
  const cuts = [
    { id: 'k1', name: 'Corte 1', startDate: '2026-10-01', endDate: '2026-10-06', sequence: 1 },
    { id: 'k2', name: 'Corte 2', startDate: '2026-10-07', endDate: '2026-10-31', sequence: 2 },
  ]
  const plain = { ...subject, id: 's2', code: 'FIS-102', name: 'Física' }
  const mixed = buildRangeReport({
    subjects: [{ ...subject, cuts }, plain],
    sessions: ['s1', 's2'].flatMap((subjectId) => [
      {
        id: `${subjectId}-a`,
        subjectId,
        date: '2026-10-05T13:00:00Z',
        isActive: true,
        suspendedAt: null,
      },
      {
        id: `${subjectId}-b`,
        subjectId,
        date: '2026-10-08T13:00:00Z',
        isActive: true,
        suspendedAt: null,
      },
    ]),
    enrollments: ['s1', 's2'].map((subjectId) => ({
      subjectId,
      studentId: 'a',
      studentCode: '001',
      studentName: 'Ana',
    })),
    // Ana attends only the first class of each subject.
    attendances: ['s1-a', 's2-a'].map((sessionId) => ({
      sessionId,
      studentId: 'a',
      status: 'PRESENT' as const,
      markedBy: null,
      manualReason: null,
      scannedAt: null,
    })),
    justifications: [],
    held: { now: new Date('2026-10-20T12:00:00Z'), defaultClassMinutes: 90 },
    from: '2026-10-05',
    to: '2026-10-09',
  })

  async function load(r: typeof mixed) {
    const wb = await buildRangeWorkbook(r, {
      scopeLabel: '05/10/2026 - 09/10/2026',
      generatedAt: new Date('2026-10-20T20:45:00Z'),
    })
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    return loaded
  }

  function rowsOf(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
    const header = headerOf(sheet)
    const out: Record<string, unknown>[] = []
    sheet.eachRow((row, n) => {
      if (n > 1)
        out.push(Object.fromEntries(header.map((h, i) => [h, row.getCell(i + 1).value ?? ''])))
    })
    return out
  }

  it('shows each cut and then the general figures, empty for subjects without cuts', async () => {
    const sheet = (await load(mixed)).getWorksheet('Resumen por materia') as ExcelJS.Worksheet
    const header = headerOf(sheet)
    expect(header.indexOf('Corte 2 · % Asistencia')).toBeLessThan(
      header.indexOf('% Asistencia (general)')
    )
    const rows = rowsOf(sheet)
    const withCuts = rows.find((r) => r['Código Materia'] === 'MAT-101')
    const withoutCuts = rows.find((r) => r['Código Materia'] === 'FIS-102')
    expect(withCuts).toMatchObject({
      'Código Materia': 'MAT-101',
      'Corte 1 · Clases': 1,
      'Corte 1 · Asistencias': 1,
      'Corte 1 · % Asistencia': 100,
      'Corte 2 · Clases': 1,
      'Corte 2 · Asistencias': 0,
      'Corte 2 · % Asistencia': 0,
      'Clases Dictadas (general)': 2,
      '% Asistencia (general)': 50,
    })
    expect(withoutCuts).toMatchObject({
      'Código Materia': 'FIS-102',
      'Corte 1 · Clases': '',
      'Corte 2 · % Asistencia': '',
      'Clases Dictadas (general)': 2,
      '% Asistencia (general)': 50,
    })
  })

  it('adds a Corte column to the detail, empty for subjects without cuts', async () => {
    const sheet = (await load(mixed)).getWorksheet('Detalle') as ExcelJS.Worksheet
    const rows = rowsOf(sheet)
    const cutOf = (code: string, date: string) =>
      rows.find((r) => r['Código Materia'] === code && r['Fecha'] === date)?.['Corte']
    expect(cutOf('MAT-101', '05/10/2026')).toBe('Corte 1')
    expect(cutOf('MAT-101', '08/10/2026')).toBe('Corte 2')
    expect(cutOf('FIS-102', '05/10/2026')).toBe('')
  })

  it('keeps headers unique when two periods have a cut with the same name', async () => {
    const cutIn = (id: string) => [
      { id, name: 'Corte 1', startDate: '2026-10-01', endDate: '2026-10-31', sequence: 1 },
    ]
    const two = buildRangeReport({
      subjects: [
        { ...subject, id: 's1', code: 'MAT-101', cuts: cutIn('a1'), periodName: '2026-1' },
        { ...subject, id: 's2', code: 'FIS-102', cuts: cutIn('b1'), periodName: '2026-2' },
      ],
      sessions: ['s1', 's2'].map((subjectId) => ({
        id: `${subjectId}-a`,
        subjectId,
        date: '2026-10-05T13:00:00Z',
        isActive: true,
        suspendedAt: null,
      })),
      enrollments: ['s1', 's2'].map((subjectId) => ({
        subjectId,
        studentId: 'a',
        studentCode: '001',
        studentName: 'Ana',
      })),
      attendances: [],
      justifications: [],
      held: { now: new Date('2026-10-20T12:00:00Z'), defaultClassMinutes: 90 },
      from: '2026-10-05',
      to: '2026-10-09',
    })
    const sheet = (await load(two)).getWorksheet('Resumen por materia') as ExcelJS.Worksheet
    const header = headerOf(sheet)
    expect(new Set(header).size).toBe(header.length)
    expect(header).toContain('Corte 1 (2026-1) · Clases')
    expect(header).toContain('Corte 1 (2026-2) · Clases')
    const rows = rowsOf(sheet)
    const first = rows.find((r) => r['Código Materia'] === 'MAT-101')
    const second = rows.find((r) => r['Código Materia'] === 'FIS-102')
    expect(first).toMatchObject({ 'Corte 1 (2026-1) · Clases': 1, 'Corte 1 (2026-2) · Clases': '' })
    expect(second).toMatchObject({
      'Corte 1 (2026-1) · Clases': '',
      'Corte 1 (2026-2) · Clases': 1,
    })
  })

  it('does not add cut columns, the Corte column or the note when no subject has cuts', async () => {
    const loaded = await load(report)
    expect(headerOf(loaded.getWorksheet('Detalle') as ExcelJS.Worksheet)).not.toContain('Corte')
    expect(headerOf(loaded.getWorksheet('Resumen por materia') as ExcelJS.Worksheet)).toEqual([
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
    const fields: string[] = []
    ;(loaded.getWorksheet('Información') as ExcelJS.Worksheet).eachRow((r) =>
      fields.push(String(r.getCell(1).value))
    )
    expect(fields).not.toContain('Cortes')
  })
})
