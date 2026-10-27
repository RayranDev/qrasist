// @vitest-environment node
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildStudentHistory,
  type ReportAttendanceInput,
  type ReportSessionInput,
  type ReportSubjectInput,
} from './attendanceReport'
import { buildProfessorUserReport } from './professorUserReport'
import { buildProfessorUserWorkbook, buildStudentUserWorkbook } from './userReportWorkbook'

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
  policy: { maxPercentage: 20, totalPlannedSessions: 10 },
  periodName: '2026-1',
  cuts: withCuts ? cuts : [],
})

const DAYS = ['2026-02-10', '2026-02-17', '2026-03-17', '2026-03-24']

const sessionsOf = (subjectId: string): ReportSessionInput[] =>
  DAYS.map((d, i) => ({
    id: `${subjectId}-${i}`,
    subjectId,
    date: `${d}T17:00:00Z`,
    isActive: true,
    suspendedAt: null,
  }))

const attend = (
  sessionId: string,
  status: 'PRESENT' | 'LATE' = 'PRESENT'
): ReportAttendanceInput => ({
  sessionId,
  studentId: 'st',
  status,
  markedBy: null,
  manualReason: null,
})

async function reload(workbook: ExcelJS.Workbook) {
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
  return loaded
}

function rowsOf(sheet: ExcelJS.Worksheet): Record<string, ExcelJS.CellValue>[] {
  const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String)
  const out: Record<string, ExcelJS.CellValue>[] = []
  sheet.eachRow((row, n) => {
    if (n === 1) return
    out.push(Object.fromEntries(header.map((h, i) => [h, row.getCell(i + 1).value ?? ''])))
  })
  return out
}

function infoFields(workbook: ExcelJS.Workbook): string[] {
  const fields: string[] = []
  workbook.getWorksheet('Información')!.eachRow((r) => fields.push(String(r.getCell(1).value)))
  return fields
}

describe('buildStudentUserWorkbook per cut', () => {
  const history = buildStudentHistory({
    studentId: 'st',
    subjects: [subject('con', 'Con cortes', true), subject('sin', 'Sin cortes', false)],
    sessions: [...sessionsOf('con'), ...sessionsOf('sin')],
    // Corte 1: 1 of 2 (one late). Corte 2: 2 of 2.
    attendances: [attend('con-0', 'LATE'), attend('con-2'), attend('con-3'), attend('sin-0')],
    justifications: [],
  })

  it('writes each cut and then the general row, only for subjects with cuts', async () => {
    const workbook = await reload(
      await buildStudentUserWorkbook(history, {
        studentName: 'Alumno',
        studentCode: 'A1',
        scopeLabel: 'Todo el historial',
      })
    )
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Resumen por materia',
      'Resumen por corte',
      'Detalle',
      'Información',
    ])
    const rows = rowsOf(workbook.getWorksheet('Resumen por corte')!)
    expect(rows.map((r) => [r['Materia'], r['Corte']])).toEqual([
      ['Con cortes', 'Corte 1'],
      ['Con cortes', 'Corte 2'],
      ['Con cortes', 'General (período)'],
    ])
    expect(rows[0]).toMatchObject({
      Clases: 2,
      Asistidas: 1,
      Tardanzas: 1,
      '% Asistencia': 50,
    })
    expect(rows[1]).toMatchObject({ Clases: 2, Asistidas: 2, '% Asistencia': 100 })
    expect(rows[2]).toMatchObject({ Clases: 4, Asistidas: 3, '% Asistencia': 75 })
    expect(infoFields(workbook)).toContain('Cortes')
  })

  it('labels the general row as range when the report is limited to a range', async () => {
    const workbook = await reload(
      await buildStudentUserWorkbook(history, {
        studentName: 'Alumno',
        studentCode: null,
        scopeLabel: '01/03/2026 - 31/03/2026',
        ranged: true,
      })
    )
    const labels = rowsOf(workbook.getWorksheet('Resumen por corte')!).map((r) => r['Corte'])
    expect(labels).toEqual(['Corte 1', 'Corte 2', 'General (rango)'])
  })

  it('keeps the original workbook (no per-cut sheet, no note) when no subject has cuts', async () => {
    const plain = buildStudentHistory({
      studentId: 'st',
      subjects: [subject('sin', 'Sin cortes', false)],
      sessions: sessionsOf('sin'),
      attendances: [attend('sin-0')],
      justifications: [],
    })
    const workbook = await reload(
      await buildStudentUserWorkbook(plain, {
        studentName: 'Alumno',
        studentCode: null,
        scopeLabel: 'Todo el historial',
      })
    )
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Resumen por materia',
      'Detalle',
      'Información',
    ])
    expect(infoFields(workbook)).not.toContain('Cortes')
  })
})

describe('buildProfessorUserWorkbook per cut', () => {
  const report = buildProfessorUserReport({
    subjects: [subject('con', 'Con cortes', true), subject('sin', 'Sin cortes', false)],
    sessions: [...sessionsOf('con'), ...sessionsOf('sin')],
    enrollments: ['con', 'sin'].map((subjectId) => ({
      subjectId,
      studentId: 'st',
      studentCode: 'S1',
      studentName: 'Alumno',
    })),
    attendances: [attend('con-0'), attend('con-2'), attend('con-3'), attend('sin-0')],
    classStats: [
      { subjectId: 'con', scheduled: 5, held: 4, suspended: 0, omitted: 1, omittedJustified: 0 },
    ],
    cutClassStats: [
      {
        cutId: 'k1',
        stats: [
          {
            subjectId: 'con',
            scheduled: 2,
            held: 2,
            suspended: 0,
            omitted: 0,
            omittedJustified: 0,
          },
        ],
      },
      {
        cutId: 'k2',
        stats: [
          {
            subjectId: 'con',
            scheduled: 3,
            held: 2,
            suspended: 0,
            omitted: 1,
            omittedJustified: 0,
          },
        ],
      },
    ],
    from: null,
    to: null,
  })

  it('writes held / suspended / omitted / attendance per cut and then the general row', async () => {
    const workbook = await reload(
      await buildProfessorUserWorkbook(report, { professorName: 'Ana', scopeLabel: 'Todo' })
    )
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Resumen por materia',
      'Resumen por corte',
      'Clases',
      'Información',
    ])
    const rows = rowsOf(workbook.getWorksheet('Resumen por corte')!)
    expect(rows.map((r) => [r['Materia'], r['Corte']])).toEqual([
      ['Con cortes', 'Corte 1'],
      ['Con cortes', 'Corte 2'],
      ['Con cortes', 'General (período)'],
    ])
    expect(rows[0]).toMatchObject({
      'Clases Programadas': 2,
      'Clases Dictadas': 2,
      'No Registradas': 0,
      '% Asistencia Promedio': 50,
    })
    expect(rows[1]).toMatchObject({
      'Clases Programadas': 3,
      'Clases Dictadas': 2,
      'No Registradas': 1,
      '% Asistencia Promedio': 100,
    })
    expect(rows[2]).toMatchObject({
      'Clases Programadas': 5,
      'Clases Dictadas': 4,
      'No Registradas': 1,
      '% Asistencia Promedio': 75,
    })
  })

  it('writes "Sin corte asignado" between the cuts and the general row when classes fall outside every cut', async () => {
    const onlyFirstCut = buildProfessorUserReport({
      subjects: [{ ...subject('con', 'Con cortes', true), cuts: [cuts[0]] }],
      sessions: sessionsOf('con'),
      enrollments: [
        { subjectId: 'con', studentId: 'st', studentCode: 'S1', studentName: 'Alumno' },
      ],
      // Feb 10 (Corte 1) and Mar 17 / Mar 24 (outside the only cut).
      attendances: [attend('con-0'), attend('con-2')],
      classStats: [],
      from: null,
      to: null,
    })
    const workbook = await reload(
      await buildProfessorUserWorkbook(onlyFirstCut, { professorName: 'Ana', scopeLabel: 'Todo' })
    )
    const rows = rowsOf(workbook.getWorksheet('Resumen por corte')!)
    expect(rows.map((r) => r['Corte'])).toEqual([
      'Corte 1',
      'Sin corte asignado',
      'General (período)',
    ])
    expect(rows[1]).toMatchObject({
      'Clases Dictadas': 2,
      'Clases Programadas': '',
      '% Asistencia Promedio': 50,
    })
    // Cuts + unassigned reconcile with the general row.
    expect(Number(rows[0]['Clases Dictadas']) + Number(rows[1]['Clases Dictadas'])).toBe(
      rows[2]['Clases Dictadas']
    )
  })

  it('keeps the original workbook when no subject has cuts', async () => {
    const plain = buildProfessorUserReport({
      subjects: [subject('sin', 'Sin cortes', false)],
      sessions: sessionsOf('sin'),
      enrollments: [
        { subjectId: 'sin', studentId: 'st', studentCode: 'S1', studentName: 'Alumno' },
      ],
      attendances: [attend('sin-0')],
      classStats: [],
      from: null,
      to: null,
    })
    const workbook = await reload(
      await buildProfessorUserWorkbook(plain, { professorName: 'Ana', scopeLabel: 'Todo' })
    )
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Resumen por materia',
      'Clases',
      'Información',
    ])
    expect(infoFields(workbook)).not.toContain('Cortes')
  })
})
