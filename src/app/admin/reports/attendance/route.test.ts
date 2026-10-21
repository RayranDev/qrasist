// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { buildAttendanceReport } from '@/lib/reports/attendanceReport'

const getUser = vi.fn()
const checkAdmin = vi.fn()
const generateAdminReport = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/actions/authGuards', () => ({
  checkAdmin: (...args: unknown[]) => checkAdmin(...args),
}))
vi.mock('@/lib/reports/adminReportService', () => ({
  generateAdminReport: (...args: unknown[]) => generateAdminReport(...args),
}))

import { GET } from './route'

const emptyReport = buildAttendanceReport({
  subjects: [],
  sessions: [],
  enrollments: [],
  attendances: [],
  justifications: [],
})

function request(query: string) {
  return new NextRequest(`http://localhost/admin/reports/attendance?${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  checkAdmin.mockResolvedValue(true)
  generateAdminReport.mockResolvedValue({
    ok: true,
    report: emptyReport,
    period: { id: 'p1', name: '2026-1' },
    scopeLabel: 'Todo el período',
    filtersLabel: '',
  })
})

describe('GET /admin/reports/attendance', () => {
  it('rejects requests without a period or with an unknown format', async () => {
    expect((await GET(request('format=pdf'))).status).toBe(400)
    expect((await GET(request('periodId=p1&format=docx'))).status).toBe(400)
    expect(generateAdminReport).not.toHaveBeenCalled()
  })

  it('returns 401 for anonymous users without touching the data layer', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(request('periodId=p1&format=pdf'))
    expect(res.status).toBe(401)
    expect(generateAdminReport).not.toHaveBeenCalled()
  })

  it('returns 403 for non-admin users (professors and students)', async () => {
    checkAdmin.mockResolvedValue(false)
    for (const format of ['xlsx', 'pdf', 'summary']) {
      const res = await GET(request(`periodId=p1&format=${format}`))
      expect(res.status).toBe(403)
    }
    expect(checkAdmin).toHaveBeenCalledWith(expect.anything(), 'u1')
    expect(generateAdminReport).not.toHaveBeenCalled()
  })

  it('passes the filters through and serves a PDF to an admin', async () => {
    const res = await GET(request('periodId=p1&format=pdf&cutId=c1&status=WARNING&subjectId=s1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('.pdf')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-')
    expect(generateAdminReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodId: 'p1', cutId: 'c1', status: 'WARNING', subjectId: 's1' })
    )
  })

  it('serves an xlsx by default and a JSON summary on request', async () => {
    const xlsx = await GET(request('periodId=p1'))
    expect(xlsx.status).toBe(200)
    expect(xlsx.headers.get('Content-Type')).toContain('spreadsheetml')
    const zip = new Uint8Array(await xlsx.arrayBuffer())
    expect(Buffer.from(zip.subarray(0, 2)).toString()).toBe('PK')

    const summary = await GET(request('periodId=p1&format=summary'))
    expect(summary.status).toBe(200)
    const body = await summary.json()
    expect(body.totals).toBeDefined()
    expect(body.period).toEqual({ id: 'p1', name: '2026-1' })
  })

  it('relays service errors and turns unexpected failures into a 500', async () => {
    generateAdminReport.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'El corte no pertenece a este período.',
    })
    const bad = await GET(request('periodId=p1&format=pdf&cutId=nope'))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toContain('corte')
  })

  it('answers 500 (and logs) when the data layer fails, never a degraded report', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('No se pudieron cargar las materias del reporte.')
    for (const format of ['xlsx', 'pdf', 'summary']) {
      generateAdminReport.mockRejectedValueOnce(cause)
      const res = await GET(request(`periodId=p1&format=${format}`))
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('No se pudo generar el reporte.')
    }
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})
