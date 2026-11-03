// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildRangeReport } from './attendanceRangeReport'
import { buildRangeWorkbook } from './attendanceRangeWorkbook'
import { buildStudentHistory, type ReportAttendanceInput } from './attendanceReport'
import { buildStudentUserWorkbook } from './userReportWorkbook'
import { loadReportData, loadSessionGroupIps } from './attendanceReportData'
import {
  CAPTURE_EXCEL_COLUMNS,
  CAPTURE_MANUAL_LABEL,
  CAPTURE_VIRTUAL_LABEL,
} from './captureColumns'

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

const CLASSROOM = { latitude: 4.6097, longitude: -74.0817 }
const NEAR = { latitude: 4.6098, longitude: -74.0817 }
const FAR = { latitude: 4.6297, longitude: -74.0817 } // ~2.2 km

const enrollments = ['a', 'b', 'c', 'd'].map((id, i) => ({
  subjectId: 's1',
  studentId: id,
  studentCode: `00${i + 1}`,
  studentName: `Estudiante ${id.toUpperCase()}`,
}))

const sessions = [
  // in person, professor location known
  {
    id: 'pres',
    subjectId: 's1',
    date: '2026-10-05T13:00:00Z',
    isActive: true,
    suspendedAt: null,
    modality: 'PRESENCIAL' as const,
    ...CLASSROOM,
  },
  // virtual: historical values still in the rows must never come out
  {
    id: 'virt',
    subjectId: 's1',
    date: '2026-10-06T13:00:00Z',
    isActive: true,
    suspendedAt: null,
    modality: 'VIRTUAL' as const,
    latitude: null,
    longitude: null,
  },
]

const att = (
  sessionId: string,
  studentId: string,
  ip: string | null,
  coords: { latitude: number; longitude: number } | null,
  extra: Partial<ReportAttendanceInput> = {}
): ReportAttendanceInput => ({
  sessionId,
  studentId,
  status: 'PRESENT',
  markedBy: null,
  manualReason: null,
  scannedAt: '2026-10-05T13:02:00Z',
  ip,
  latitude: coords?.latitude ?? null,
  longitude: coords?.longitude ?? null,
  ...extra,
})

const attendances = [
  att('pres', 'a', '1.1.1.1', NEAR),
  att('pres', 'b', '1.1.1.1', NEAR),
  att('pres', 'c', '9.9.9.9', FAR),
  att('pres', 'd', 'manual', null, { markedBy: 'admin-1', manualReason: 'Corrección' }),
  // old rows of the virtual class that still hold IP and GPS
  att('virt', 'a', '1.1.1.1', NEAR),
  att('virt', 'b', '1.1.1.1', NEAR),
]

function build(includeCapture?: boolean) {
  return buildRangeReport({
    subjects: [subject],
    sessions,
    enrollments,
    attendances,
    justifications: [],
    held: { now: new Date('2026-10-20T12:00:00Z'), defaultClassMinutes: 90 },
    from: '2026-10-05',
    to: '2026-10-09',
    includeCapture,
  })
}

async function reload(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer()
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(buffer as ArrayBuffer)
  return loaded
}

function headers(sheet: ExcelJS.Worksheet) {
  return (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String)
}

describe('range report with IP and location', () => {
  it('leaves the detail untouched when the option is off', () => {
    const report = build()
    expect(report.includesCapture).toBe(false)
    expect(report.detail.every((row) => !('capture' in row))).toBe(true)
  })

  it('adds the same alerts the professor sees on real attendance rows', () => {
    const report = build(true)
    const rowOf = (session: string, student: string) =>
      report.detail.find(
        (r) => r.sessionDate.startsWith(session) && r.studentName === `Estudiante ${student}`
      )?.capture

    // Group IP is 1.1.1.1 (two scans share it)
    expect(rowOf('2026-10-05', 'A')).toMatchObject({ ip: '1.1.1.1', alert: '' })
    expect(rowOf('2026-10-05', 'A')?.distance).toBeGreaterThan(0)
    expect(rowOf('2026-10-05', 'C')).toMatchObject({
      ip: '9.9.9.9',
      alert: expect.stringContaining('IP distinta'),
    })
    expect(rowOf('2026-10-05', 'C')?.alert).toContain('Lejos de la clase')
  })

  it('labels manual marks and blanks virtual classes even if the rows hold old values', () => {
    const report = build(true)
    const manual = report.detail.find(
      (r) => r.studentName === 'Estudiante D' && r.date === '2026-10-05'
    )
    expect(manual?.capture).toMatchObject({ ip: CAPTURE_MANUAL_LABEL, latitude: '', alert: '' })

    const virtual = report.detail.filter((r) => r.date === '2026-10-06')
    const withAttendance = virtual.filter((r) => r.status === 'PRESENT')
    expect(withAttendance).toHaveLength(2)
    for (const row of withAttendance) {
      expect(row.capture).toEqual({
        ip: CAPTURE_VIRTUAL_LABEL,
        latitude: '',
        longitude: '',
        distance: '',
        alert: '',
      })
    }
    // absent students have nothing to show
    const absent = virtual.find((r) => r.status === 'ABSENT')
    expect(absent?.capture).toMatchObject({ ip: '', alert: '' })
  })
})

describe('range workbook with IP and location', () => {
  const meta = {
    scopeLabel: '05/10/2026 - 09/10/2026',
    generatedAt: new Date('2026-10-20T20:45:00Z'),
  }

  it('keeps the default detail columns exactly as they were', async () => {
    const wb = await reload(await buildRangeWorkbook(build(), meta))
    const detail = wb.getWorksheet('Detalle') as ExcelJS.Worksheet
    expect(headers(detail)).toEqual([
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
    const info = wb.getWorksheet('Información') as ExcelJS.Worksheet
    const fields = info.getColumn(1).values as ExcelJS.CellValue[]
    expect(fields).not.toContain('IP y ubicación')
  })

  it('adds IP, Latitud, Longitud, Distancia and Alerta only when requested', async () => {
    const wb = await reload(await buildRangeWorkbook(build(true), meta))
    const detail = wb.getWorksheet('Detalle') as ExcelJS.Worksheet
    const h = headers(detail)
    expect(h.slice(-5)).toEqual(CAPTURE_EXCEL_COLUMNS.map((c) => c.header))
    expect(h).toContain('Alerta')

    const ipCol = h.indexOf('IP') + 1
    const values: string[] = []
    detail.eachRow((row, n) => {
      if (n > 1) values.push(String(row.getCell(ipCol).value ?? ''))
    })
    expect(values).toContain('9.9.9.9')
    expect(values).toContain(CAPTURE_VIRTUAL_LABEL)
    expect(values).toContain(CAPTURE_MANUAL_LABEL)

    const info = wb.getWorksheet('Información') as ExcelJS.Worksheet
    expect(info.getColumn(1).values as ExcelJS.CellValue[]).toContain('IP y ubicación')
  })
})

describe('student history with IP and location', () => {
  const history = (capture: boolean) =>
    buildStudentHistory({
      studentId: 'c',
      subjects: [subject],
      sessions,
      attendances: attendances.filter((a) => a.studentId === 'c' || a.sessionId === 'virt'),
      justifications: [],
      held: { now: new Date('2026-10-20T12:00:00Z'), defaultClassMinutes: 90 },
      capture: capture ? { groupIpBySession: new Map([['pres', '1.1.1.1']]) } : undefined,
    })

  it('adds nothing without the option', () => {
    expect(history(false)[0].entries.every((e) => !('capture' in e))).toBe(true)
  })

  it('flags the attendance against the group IP of the class, and blanks the rest', () => {
    const entries = history(true)[0].entries
    const pres = entries.find((e) => e.date.startsWith('2026-10-05'))
    expect(pres?.capture).toMatchObject({ ip: '9.9.9.9' })
    expect(pres?.capture?.alert).toContain('IP distinta')
    // student c has no attendance in the virtual class: ABSENT, blank
    const virt = entries.find((e) => e.date.startsWith('2026-10-06'))
    expect(virt?.state).toBe('ABSENT')
    expect(virt?.capture?.ip).toBe('')
  })

  it('writes the capture columns into the student Detalle sheet only when requested', async () => {
    const meta = {
      studentName: 'Estudiante C',
      studentCode: '003',
      scopeLabel: 'Todo el historial',
    }
    const off = await reload(await buildStudentUserWorkbook(history(false), meta))
    expect(headers(off.getWorksheet('Detalle') as ExcelJS.Worksheet)).not.toContain('IP')

    const on = await reload(
      await buildStudentUserWorkbook(history(true), { ...meta, includeCapture: true })
    )
    const detail = on.getWorksheet('Detalle') as ExcelJS.Worksheet
    expect(headers(detail).slice(-5)).toEqual(CAPTURE_EXCEL_COLUMNS.map((c) => c.header))
  })
})

describe('loading', () => {
  function fakeClient(tables: Record<string, unknown[]>) {
    const selects: Record<string, string[]> = {}
    const client = {
      from(table: string) {
        const builder: Record<string, unknown> = {}
        for (const method of ['eq', 'in', 'order', 'range', 'gte', 'lt']) {
          builder[method] = vi.fn(() => builder)
        }
        builder.select = vi.fn((columns: string) => {
          selects[table] = [...(selects[table] ?? []), columns]
          return builder
        })
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
        builder.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve)
        return builder
      },
    }
    return { client: client as unknown as SupabaseClient, selects }
  }

  const subjectRow = {
    id: 's1',
    name: 'Cálculo',
    code: 'MAT-101',
    is_active: true,
    professor_id: null,
    period_id: null,
    absence_rule_type: null,
    max_absence_percentage: null,
    max_absence_count: null,
    total_planned_sessions: null,
    lates_per_absence: null,
    professor: null,
    period: null,
    subject_careers: [],
  }

  it('does not even query IP or coordinates by default', async () => {
    const { client, selects } = fakeClient({ subjects: [subjectRow] })
    await loadReportData(client, { subjectIds: ['s1'] })

    const all = [...selects.sessions, ...selects.attendances].join(' ')
    expect(all).not.toMatch(/ip_address|latitude|longitude/)
  })

  it('queries them when the option is on and maps them into the inputs', async () => {
    const { client, selects } = fakeClient({
      subjects: [subjectRow],
      sessions: [
        {
          id: 'x',
          subject_id: 's1',
          date: '2026-10-05T13:00:00Z',
          class_ends_at: null,
          is_active: true,
          suspended_at: null,
          suspension_reason: null,
          modality: 'PRESENCIAL',
          is_makeup: false,
          makeup_reason: null,
          latitude: 4.6,
          longitude: -74.1,
        },
      ],
      attendances: [
        {
          session_id: 'x',
          student_id: 'a',
          status: 'PRESENT',
          marked_by: null,
          manual_reason: null,
          scanned_at: '2026-10-05T13:01:00Z',
          ip_address: '1.1.1.1',
          latitude: 4.6,
          longitude: -74.1,
        },
      ],
    })

    const data = await loadReportData(client, { subjectIds: ['s1'], includeCapture: true })

    expect(selects.sessions[0]).toContain('latitude, longitude')
    expect(selects.attendances[0]).toContain('ip_address, latitude, longitude')
    expect(data.sessions[0]).toMatchObject({ latitude: 4.6, longitude: -74.1 })
    expect(data.attendances[0]).toMatchObject({ ip: '1.1.1.1', latitude: 4.6, longitude: -74.1 })
  })

  it('computes the group IP of each requested class from the whole group', async () => {
    const { client } = fakeClient({
      attendances: [
        { session_id: 'x', ip_address: '1.1.1.1' },
        { session_id: 'x', ip_address: '1.1.1.1' },
        { session_id: 'x', ip_address: '2.2.2.2' },
        { session_id: 'y', ip_address: '3.3.3.3' },
      ],
    })

    const groups = await loadSessionGroupIps(client, ['x', 'y'])

    expect(groups.get('x')).toBe('1.1.1.1')
    expect(groups.get('y')).toBeNull()
  })
})
