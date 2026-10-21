// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const generateStudentReport = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/reports/studentReportService', () => ({
  generateStudentReport: (...args: unknown[]) => generateStudentReport(...args),
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
  generateStudentReport.mockResolvedValue({
    ok: true,
    report: { studentName: 'Niño Peña', studentCode: '20260001', history: [] },
  })
})

describe('GET /student/reports/history', () => {
  it('returns 401 for anonymous users', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
    expect(generateStudentReport).not.toHaveBeenCalled()
  })

  it('derives the student from the session and serves a PDF', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('historial_asistencia_20260001')
    expect(Buffer.from((await res.arrayBuffer()).slice(0, 5)).toString()).toBe('%PDF-')
    expect(generateStudentReport).toHaveBeenCalledWith(expect.anything(), 'student-1')
  })

  it('refuses accounts that are not active students', async () => {
    generateStudentReport.mockResolvedValue({ ok: false, status: 403, error: 'No autorizado.' })
    expect((await GET()).status).toBe(403)
  })

  it('turns unexpected failures into a generic 500', async () => {
    generateStudentReport.mockRejectedValue(new Error('db down'))
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('db down')
  })
})
