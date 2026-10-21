// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { buildAttendanceReport, WHOLE_PERIOD_RANGE } from '@/lib/reports/attendanceReport'

const getUser = vi.fn()
const checkAdminOrSubjectProfessor = vi.fn()
const generateSubjectReport = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/actions/authGuards', () => ({
  checkAdminOrSubjectProfessor: (...args: unknown[]) => checkAdminOrSubjectProfessor(...args),
}))
vi.mock('@/lib/reports/subjectReportService', () => ({
  generateSubjectReport: (...args: unknown[]) => generateSubjectReport(...args),
}))

import { GET } from './route'

function request(query: string) {
  return new NextRequest(`http://localhost/professor/reports/subject?${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
  checkAdminOrSubjectProfessor.mockResolvedValue(true)
  generateSubjectReport.mockResolvedValue({
    ok: true,
    report: buildAttendanceReport({
      subjects: [],
      sessions: [],
      enrollments: [],
      attendances: [],
      justifications: [],
      range: WHOLE_PERIOD_RANGE,
    }),
    classes: [],
    cuts: [],
    subject: {
      id: 'sub-1',
      code: 'MAT101',
      name: 'Matemáticas',
      professorName: 'Ana',
      periodName: '2026-1',
    },
    scopeLabel: 'Todo el período',
  })
})

describe('GET /professor/reports/subject', () => {
  it('requires a subject id', async () => {
    expect((await GET(request(''))).status).toBe(400)
  })

  it('returns 401 for anonymous users', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(request('subjectId=sub-1'))).status).toBe(401)
    expect(generateSubjectReport).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is neither an admin nor the professor of that subject', async () => {
    checkAdminOrSubjectProfessor.mockResolvedValue(false)
    const res = await GET(request('subjectId=someone-elses-subject'))
    expect(res.status).toBe(403)
    expect(checkAdminOrSubjectProfessor).toHaveBeenCalledWith(
      expect.anything(),
      'prof-1',
      'someone-elses-subject'
    )
    expect(generateSubjectReport).not.toHaveBeenCalled()
  })

  it('serves only a PDF to the owner of the subject', async () => {
    const res = await GET(request('subjectId=sub-1&cutId=c1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('asistencia_MAT101_')
    expect(Buffer.from((await res.arrayBuffer()).slice(0, 5)).toString()).toBe('%PDF-')
    expect(generateSubjectReport).toHaveBeenCalledWith(expect.anything(), {
      subjectId: 'sub-1',
      cutId: 'c1',
    })
  })

  it('relays validation errors and hides unexpected failures behind a 500', async () => {
    generateSubjectReport.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'El corte no pertenece a esta materia.',
    })
    expect((await GET(request('subjectId=sub-1&cutId=x'))).status).toBe(400)

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    generateSubjectReport.mockRejectedValueOnce(new Error('db down'))
    const res = await GET(request('subjectId=sub-1'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('db down')
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})
