// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { buildRangeReport } from '@/lib/reports/attendanceRangeReport'

const getUser = vi.fn()
const checkAdmin = vi.fn()
const generateRangeReport = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/actions/authGuards', () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}))
vi.mock('@/lib/reports/attendanceRangeService', () => ({
  generateRangeReport: (...args: unknown[]) => generateRangeReport(...args),
}))

import { GET } from './route'

const UUID = '3f2b8c1e-0a4d-4c55-9e2a-7d1f6b9a1c10'

const report = buildRangeReport({
  subjects: [
    {
      id: 's1',
      code: 'MAT-101',
      name: 'Cálculo',
      professorId: null,
      professorName: null,
      careerNames: [],
      policy: {},
      cuts: [],
    },
  ],
  sessions: [
    { id: 'x', subjectId: 's1', date: '2026-10-05T13:00:00Z', isActive: true, suspendedAt: null },
  ],
  enrollments: [{ subjectId: 's1', studentId: 'a', studentCode: '1', studentName: 'Ana' }],
  attendances: [],
  justifications: [],
  from: '2026-10-05',
  to: '2026-10-05',
})

function request(query: string) {
  return new NextRequest(`http://localhost/admin/reports/attendance-range?${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  checkAdmin.mockResolvedValue(true)
  generateRangeReport.mockResolvedValue({
    ok: true,
    report,
    scopeLabel: '05/10/2026',
    filtersLabel: '',
  })
})

describe('GET /admin/reports/attendance-range', () => {
  it('returns 401 for anonymous users without touching the data layer', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(request('from=2026-10-01&to=2026-10-31'))
    expect(res.status).toBe(401)
    expect(generateRangeReport).not.toHaveBeenCalled()
  })

  it('returns 403 for non-admin users, before validating anything', async () => {
    checkAdmin.mockResolvedValue(false)
    expect((await GET(request('from=2026-10-01&to=2026-10-31'))).status).toBe(403)
    expect((await GET(request('garbage=1'))).status).toBe(403)
    expect(checkAdmin).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(generateRangeReport).not.toHaveBeenCalled()
  })

  it('rejects invalid parameters with 400 and a Spanish message', async () => {
    for (const q of [
      '',
      'from=2026-10-01',
      'from=2026-10-31&to=2026-10-01',
      'from=2027-01-01&to=2028-06-01',
      'from=2026-10-01&to=2026-10-02&format=pdf',
      'from=2026-10-01&to=2026-10-02&subjectId=nope',
    ]) {
      const res = await GET(request(q))
      expect(res.status, q).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
    }
    expect(generateRangeReport).not.toHaveBeenCalled()
  })

  it('serves an xlsx to an admin and passes the filters through', async () => {
    const res = await GET(
      request(`from=2026-10-01&to=2026-10-31&careerId=${UUID}&subjectId=${UUID}`)
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml')
    expect(res.headers.get('Content-Disposition')).toContain(
      'asistencia_2026-10-01_a_2026-10-31.xlsx'
    )
    const zip = new Uint8Array(await res.arrayBuffer())
    expect(Buffer.from(zip.subarray(0, 2)).toString()).toBe('PK')
    expect(generateRangeReport).toHaveBeenCalledWith(expect.anything(), {
      from: '2026-10-01',
      to: '2026-10-31',
      careerId: UUID,
      subjectId: UUID,
    })
  })

  it('names a one-day file after that day', async () => {
    const res = await GET(request('from=2026-10-05&to=2026-10-05'))
    expect(res.headers.get('Content-Disposition')).toContain('asistencia_2026-10-05.xlsx')
  })

  it('relays service errors and turns unexpected failures into a 500', async () => {
    generateRangeReport.mockResolvedValueOnce({ ok: false, status: 404, error: 'Sin clases.' })
    const missing = await GET(request('from=2026-10-01&to=2026-10-31'))
    expect(missing.status).toBe(404)
    expect((await missing.json()).error).toBe('Sin clases.')

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    generateRangeReport.mockRejectedValueOnce(new Error('boom'))
    const broken = await GET(request('from=2026-10-01&to=2026-10-31'))
    expect(broken.status).toBe(500)
    expect((await broken.json()).error).toBe('No se pudo generar el reporte.')
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})
