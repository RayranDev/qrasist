import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'
import { NextRequest } from 'next/server'
import { GET } from './route'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockCareers = vi.fn()
const mockPeriods = vi.fn()

vi.mock('@/lib/actions/authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      const result = table === 'careers' ? mockCareers : mockPeriods
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = () => c
      c.order = () => result()
      return c
    },
  })),
}))

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function request(type?: string) {
  const url = new URL('http://localhost/admin/import-template')
  if (type !== undefined) url.searchParams.set('type', type)
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockCheckAdmin.mockResolvedValue(true)
  mockCareers.mockResolvedValue({ data: [{ name: 'Derecho' }, { name: 'Sistemas' }], error: null })
  mockPeriods.mockResolvedValue({ data: [{ name: '2026-1' }], error: null })
})

describe('GET /admin/import-template', () => {
  it('returns 401 without a session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await GET(request('STUDENT'))
    expect(response.status).toBe(401)
    expect(mockCheckAdmin).not.toHaveBeenCalled()
  })

  it('returns 403 for a non-admin and never reads the catalog', async () => {
    mockCheckAdmin.mockResolvedValue(false)
    const response = await GET(request('STUDENT'))
    expect(response.status).toBe(403)
    expect(mockCareers).not.toHaveBeenCalled()
  })

  it.each([undefined, 'NOPE', 'toString', '__proto__'])('returns 400 for type %s', async (type) => {
    const response = await GET(request(type))
    expect(response.status).toBe(400)
  })

  it('returns an xlsx attachment with the active careers on a hidden sheet', async () => {
    const response = await GET(request('STUDENT'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(XLSX_MIME)
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="plantilla_estudiantes.xlsx"'
    )
    expect(response.headers.get('cache-control')).toBe('no-store')

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await response.arrayBuffer())
    const lists = workbook.getWorksheet('Listas')!
    expect(lists.state).toBe('hidden')
    expect(lists.getColumn(1).values).toEqual([undefined, 'Carreras', 'Derecho', 'Sistemas'])
    expect(mockPeriods).not.toHaveBeenCalled() // los estudiantes no llevan período
  })

  it('also loads active periods for the subject template', async () => {
    const response = await GET(request('SUBJECT'))
    expect(response.status).toBe(200)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await response.arrayBuffer())
    // Las carreras son 2 filas y los períodos 1: la columna se rellena con una celda vacía.
    const periods = workbook.getWorksheet('Listas')!.getColumn(2).values as unknown[]
    expect(periods.slice(0, 3)).toEqual([undefined, 'Períodos', '2026-1'])
  })

  it('returns 500 with a JSON error when the catalog cannot be loaded', async () => {
    mockCareers.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const response = await GET(request('STUDENT'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'No se pudo generar la plantilla.' })
  })
})
