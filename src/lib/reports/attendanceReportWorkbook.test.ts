// @vitest-environment node
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildAttendanceReport, resolveReportRange, type ReportRange } from './attendanceReport'
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

const META = {
  periodName: '2026-1',
  scopeLabel: 'Todo el período',
  generatedAt: new Date('2026-10-20T20:00:00Z'),
}

async function load(report: ReturnType<typeof fixtureReport>) {
  const workbook = await buildAttendanceReportWorkbook(report, META)
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
  return loaded
}

function headerOf(sheet: ExcelJS.Worksheet): string[] {
  return (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String)
}

/** Rows of a sheet as {header: value}, so assertions do not depend on column positions. */
function rowsOf(sheet: ExcelJS.Worksheet): Record<string, ExcelJS.CellValue>[] {
  const header = headerOf(sheet)
  const out: Record<string, ExcelJS.CellValue>[] = []
  sheet.eachRow((row, n) => {
    if (n === 1) return
    out.push(Object.fromEntries(header.map((h, i) => [h, row.getCell(i + 1).value ?? ''])))
  })
  return out
}

const twoCuts = [
  ...cuts,
  { id: 'c2', name: 'Corte 2', startDate: '2026-03-16', endDate: '2026-04-30', sequence: 2 },
]

/** One subject with two cuts and one without cuts, over the same weekly classes. */
function mixedReport(range?: ReportRange) {
  const days = ['2026-02-10', '2026-02-24', '2026-03-17', '2026-03-24']
  const policy = { maxPercentage: 20, totalPlannedSessions: 10 }
  const base = { professorId: 'p1', professorName: 'Ana', careerNames: ['Derecho'], policy }
  return buildAttendanceReport({
    subjects: [
      { ...base, id: 'cuts', code: 'DER101', name: 'Con cortes', cuts: twoCuts },
      { ...base, id: 'plain', code: 'DER102', name: 'Sin cortes', cuts: [] },
    ],
    sessions: ['cuts', 'plain'].flatMap((subjectId) =>
      days.map((d, i) => ({
        id: `${subjectId}-${i}`,
        subjectId,
        date: `${d}T17:00:00Z`,
        isActive: true,
        suspendedAt: null,
      }))
    ),
    enrollments: ['cuts', 'plain'].map((subjectId) => ({
      subjectId,
      studentId: 'st',
      studentCode: 'ST1',
      studentName: 'Alumno Uno',
    })),
    // Attends the first class of each cut and the two Corte 2 classes of the no-cuts subject.
    attendances: ['cuts-0', 'cuts-2', 'plain-0', 'plain-2', 'plain-3'].map((sessionId) => ({
      sessionId,
      studentId: 'st',
      status: 'PRESENT' as const,
      markedBy: null,
      manualReason: null,
    })),
    justifications: [],
    range,
  })
}

describe('buildAttendanceReportWorkbook per cut', () => {
  it('shows each cut and then the general figures for a subject with cuts', async () => {
    const loaded = await load(mixedReport())
    const sheet = loaded.getWorksheet('Estudiantes')!
    const header = headerOf(sheet)

    // Cut columns come before the general ones, in cut order.
    expect(header.indexOf('Corte 1 · % Asistencia')).toBeLessThan(
      header.indexOf('Corte 2 · % Asistencia')
    )
    expect(header.indexOf('Corte 2 · % Asistencia')).toBeLessThan(
      header.indexOf('% Asistencia (general)')
    )

    const row = rowsOf(sheet).find((r) => r['Materia'] === 'Con cortes')!
    expect(row).toMatchObject({
      'Corte 1 · Clases': 2,
      'Corte 1 · Asistidas': 1,
      'Corte 1 · % Asistencia': 50,
      'Corte 2 · Clases': 2,
      'Corte 2 · Asistidas': 1,
      'Corte 2 · % Asistencia': 50,
      'Clases Dictadas (general)': 4,
      '% Asistencia (general)': 50,
    })
  })

  it('leaves the cut columns empty for a subject without cuts in the same sheet', async () => {
    const loaded = await load(mixedReport())
    const row = rowsOf(loaded.getWorksheet('Estudiantes')!).find(
      (r) => r['Materia'] === 'Sin cortes'
    )!
    expect(row['Corte 1 · Clases']).toBe('')
    expect(row['Corte 1 · % Asistencia']).toBe('')
    expect(row['Corte 2 · Asistidas']).toBe('')
    // The general figure is still there.
    expect(row['Clases Dictadas (general)']).toBe(4)
    expect(row['% Asistencia (general)']).toBe(75)
  })

  it('adds per-cut class counts and average attendance to the subject summary', async () => {
    const loaded = await load(mixedReport())
    const rows = rowsOf(loaded.getWorksheet('Resumen por materia')!)
    expect(rows.find((r) => r['Materia'] === 'Con cortes')).toMatchObject({
      'Corte 1 · Clases': 2,
      'Corte 1 · % Asistencia Promedio': 50,
      'Corte 2 · Clases': 2,
      'Clases Dictadas (general)': 4,
    })
    expect(rows.find((r) => r['Materia'] === 'Sin cortes')!['Corte 1 · Clases']).toBe('')
  })

  it('keeps the semester cut figures and labels the general block as range when a cut is chosen', async () => {
    const loaded = await load(mixedReport(resolveReportRange(twoCuts, 'c1')!))
    const sheet = loaded.getWorksheet('Estudiantes')!
    const header = headerOf(sheet)
    expect(header).toContain('Clases Dictadas (rango)')
    expect(header).not.toContain('Clases Dictadas (general)')

    const row = rowsOf(sheet).find((r) => r['Materia'] === 'Con cortes')!
    // General block is scoped to Corte 1; Corte 2 still shows its semester figures.
    expect(row['Clases Dictadas (rango)']).toBe(2)
    expect(row['Corte 2 · Clases']).toBe(2)
    expect(row['Corte 2 · Asistidas']).toBe(1)

    const info: string[] = []
    loaded.getWorksheet('Información')!.eachRow((r) => info.push(String(r.getCell(2).value)))
    expect(info.join(' ')).toContain('sobre todo el semestre')
  })

  it('does not invent cut columns when no subject has cuts', async () => {
    const report = buildAttendanceReport({
      subjects: [
        {
          id: 'plain',
          code: 'DER102',
          name: 'Sin cortes',
          professorId: 'p1',
          professorName: 'Ana',
          careerNames: ['Derecho'],
          policy: { maxPercentage: 20, totalPlannedSessions: 10 },
          cuts: [],
        },
      ],
      sessions: [
        {
          id: 's0',
          subjectId: 'plain',
          date: '2026-02-10T17:00:00Z',
          isActive: true,
          suspendedAt: null,
        },
      ],
      enrollments: [
        { subjectId: 'plain', studentId: 'st', studentCode: 'ST1', studentName: 'Uno' },
      ],
      attendances: [],
      justifications: [],
    })
    const loaded = await load(report)
    expect(headerOf(loaded.getWorksheet('Estudiantes')!)).toEqual([
      'Carrera',
      'Código Materia',
      'Materia',
      'Docente',
      'Código Estudiante',
      'Estudiante',
      'Clases Dictadas',
      'Presentes',
      'Tardanzas',
      'Justificadas',
      'Faltas Contadas',
      '% Asistencia',
      '% Inasistencia',
      'Estado',
      'Observaciones',
      'Excusas',
    ])
    expect(headerOf(loaded.getWorksheet('Resumen por materia')!)).toEqual([
      'Código Materia',
      'Materia',
      'Carrera',
      'Docente',
      'Inscritos',
      'Clases Dictadas',
      'Clases Suspendidas',
      'Reposiciones',
      '% Asistencia Promedio',
      'Normal',
      'En Riesgo',
      'Perdida por Fallas',
    ])
    const fields: string[] = []
    loaded.getWorksheet('Información')!.eachRow((r) => fields.push(String(r.getCell(1).value)))
    expect(fields).not.toContain('Cortes')
  })
})

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
    // The fixture has a cut and a ranged scope, so the general block says so.
    expect(header).toContain('% Asistencia (rango)')
    expect(header).toContain('Corte 1 · % Asistencia')
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
