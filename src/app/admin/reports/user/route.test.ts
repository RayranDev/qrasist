// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { buildStudentHistory } from '@/lib/reports/attendanceReport'
import { buildProfessorUserReport } from '@/lib/reports/professorUserReport'

const getUser = vi.fn()
const checkAdmin = vi.fn()
const generateUserReport = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/actions/authGuards', () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}))
vi.mock('@/lib/reports/userReportService', () => ({
  generateUserReport: (...args: unknown[]) => generateUserReport(...args),
}))

// Real implementations, wrapped in spies to see which meta the route hands them.
vi.mock('@/lib/reports/userReportWorkbook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reports/userReportWorkbook')>()
  return {
    ...actual,
    buildStudentUserWorkbook: vi.fn(actual.buildStudentUserWorkbook),
    buildProfessorUserWorkbook: vi.fn(actual.buildProfessorUserWorkbook),
  }
})
vi.mock('@/lib/reports/pdf/professorUserReportPdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reports/pdf/professorUserReportPdf')>()
  return { ...actual, renderProfessorUserReportPdf: vi.fn(actual.renderProfessorUserReportPdf) }
})
vi.mock('@/lib/reports/pdf/studentReportPdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reports/pdf/studentReportPdf')>()
  return { ...actual, renderStudentReportPdf: vi.fn(actual.renderStudentReportPdf) }
})

import { GET } from './route'
import {
  buildProfessorUserWorkbook,
  buildStudentUserWorkbook,
} from '@/lib/reports/userReportWorkbook'
import { renderProfessorUserReportPdf } from '@/lib/reports/pdf/professorUserReportPdf'
import { renderStudentReportPdf } from '@/lib/reports/pdf/studentReportPdf'

const UUID = '3f2b8c1e-0a4d-4c55-9e2a-7d1f6b9a1c10'

const subject = {
  id: 's1',
  code: 'MAT-101',
  name: 'Cálculo',
  professorId: 'p1',
  professorName: 'Luis Prof',
  careerNames: [],
  policy: {},
  periodName: '2026-2',
  cuts: [],
}
const sessions = [
  { id: 'x1', subjectId: 's1', date: '2026-10-05T13:00:00Z', isActive: true, suspendedAt: null },
]

const studentResult = {
  ok: true,
  kind: 'student',
  name: 'Ana Pérez',
  code: '2024001',
  scopeLabel: 'Todo el historial',
  history: buildStudentHistory({
    studentId: 'a',
    subjects: [subject],
    sessions,
    attendances: [],
    justifications: [],
  }),
}

const professorResult = {
  ok: true,
  kind: 'professor',
  name: 'Luis Prof',
  scopeLabel: 'Todo el historial',
  report: buildProfessorUserReport({
    subjects: [subject],
    sessions,
    enrollments: [{ subjectId: 's1', studentId: 'a', studentCode: '1', studentName: 'Ana' }],
    attendances: [],
    classStats: [],
    from: null,
    to: null,
  }),
}

function request(query: string) {
  return new NextRequest(`http://localhost/admin/reports/user?${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  checkAdmin.mockResolvedValue(true)
  generateUserReport.mockResolvedValue(studentResult)
})

describe('GET /admin/reports/user', () => {
  it('returns 401 for anonymous users without touching the data layer', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(request(`userId=${UUID}`))).status).toBe(401)
    expect(generateUserReport).not.toHaveBeenCalled()
  })

  it('returns 403 for non-admin users, before validating anything', async () => {
    checkAdmin.mockResolvedValue(false)
    expect((await GET(request(`userId=${UUID}&format=pdf`))).status).toBe(403)
    expect((await GET(request('garbage=1'))).status).toBe(403)
    expect(checkAdmin).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(generateUserReport).not.toHaveBeenCalled()
  })

  it('rejects invalid parameters with 400', async () => {
    for (const q of [
      '',
      'userId=nope',
      `userId=${UUID}&format=csv`,
      `userId=${UUID}&from=2026-10-01`,
      `userId=${UUID}&from=2026-10-31&to=2026-10-01`,
      `userId=${'-'.repeat(36)}`,
      `userId=${UUID}&from=9999-12-01&to=9999-12-31`,
    ]) {
      const res = await GET(request(q))
      expect(res.status, q).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
    expect(generateUserReport).not.toHaveBeenCalled()
  })

  it('serves a student report as xlsx and pdf and passes the range through', async () => {
    const xlsx = await GET(request(`userId=${UUID}&from=2026-10-01&to=2026-10-31`))
    expect(xlsx.status).toBe(200)
    expect(xlsx.headers.get('Content-Type')).toContain('spreadsheetml')
    expect(xlsx.headers.get('Content-Disposition')).toContain(
      'asistencia_estudiante_Ana_Perez_2026-10-01_a_2026-10-31.xlsx'
    )
    expect(Buffer.from(new Uint8Array(await xlsx.arrayBuffer()).subarray(0, 2)).toString()).toBe(
      'PK'
    )
    expect(generateUserReport).toHaveBeenCalledWith(expect.anything(), {
      userId: UUID,
      range: { from: '2026-10-01', to: '2026-10-31' },
    })

    const pdf = await GET(request(`userId=${UUID}&format=pdf`))
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf')
    expect(Buffer.from(new Uint8Array(await pdf.arrayBuffer()).subarray(0, 5)).toString()).toBe(
      '%PDF-'
    )
    expect(generateUserReport).toHaveBeenLastCalledWith(expect.anything(), {
      userId: UUID,
      range: null,
    })
  })

  it('serves a professor report as xlsx and pdf', async () => {
    generateUserReport.mockResolvedValue(professorResult)
    const xlsx = await GET(request(`userId=${UUID}`))
    expect(xlsx.status).toBe(200)
    expect(xlsx.headers.get('Content-Disposition')).toContain('asistencia_docente_Luis_Prof.xlsx')
    expect(Buffer.from(new Uint8Array(await xlsx.arrayBuffer()).subarray(0, 2)).toString()).toBe(
      'PK'
    )

    const pdf = await GET(request(`userId=${UUID}&format=pdf`))
    expect(pdf.status).toBe(200)
    expect(Buffer.from(new Uint8Array(await pdf.arrayBuffer()).subarray(0, 5)).toString()).toBe(
      '%PDF-'
    )
  })

  describe('propagates whether the report is limited to a range', () => {
    const range = 'from=2026-10-01&to=2026-10-31'
    const meta = (mock: unknown, call = 0) => (mock as ReturnType<typeof vi.fn>).mock.calls[call][1]

    it('tells the student xlsx and pdf builders', async () => {
      await GET(request(`userId=${UUID}&${range}`))
      await GET(request(`userId=${UUID}&${range}&format=pdf`))
      expect(meta(buildStudentUserWorkbook)).toMatchObject({ ranged: true })
      // The student PDF takes the range as its scope label.
      expect(meta(renderStudentReportPdf).scopeLabel).toBe(studentResult.scopeLabel)

      await GET(request(`userId=${UUID}`))
      await GET(request(`userId=${UUID}&format=pdf`))
      expect(meta(buildStudentUserWorkbook, 1)).toMatchObject({ ranged: false })
      expect(meta(renderStudentReportPdf, 1).scopeLabel).toBeUndefined()
    })

    it('tells the professor xlsx and pdf builders', async () => {
      generateUserReport.mockResolvedValue(professorResult)
      await GET(request(`userId=${UUID}&${range}`))
      await GET(request(`userId=${UUID}&${range}&format=pdf`))
      expect(meta(buildProfessorUserWorkbook)).toMatchObject({ ranged: true })
      expect(meta(renderProfessorUserReportPdf)).toMatchObject({ ranged: true })

      await GET(request(`userId=${UUID}`))
      await GET(request(`userId=${UUID}&format=pdf`))
      expect(meta(buildProfessorUserWorkbook, 1)).toMatchObject({ ranged: false })
      expect(meta(renderProfessorUserReportPdf, 1)).toMatchObject({ ranged: false })
    })
  })

  it('relays 404 and 400 for unknown, inactive or admin users', async () => {
    generateUserReport.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'Usuario no encontrado o inactivo.',
    })
    const missing = await GET(request(`userId=${UUID}`))
    expect(missing.status).toBe(404)
    expect((await missing.json()).error).toContain('inactivo')

    generateUserReport.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'Solo hay reporte de asistencia para estudiantes y docentes.',
    })
    expect((await GET(request(`userId=${UUID}`))).status).toBe(400)
  })

  it('answers 500 (and logs) when the data layer fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    generateUserReport.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(request(`userId=${UUID}`))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No se pudo generar el reporte.')
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})
