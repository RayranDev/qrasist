import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'
import { NextRequest } from 'next/server'
import { GET } from './route'

type Row = Record<string, unknown>
interface Query {
  table: string
  select: string
  eqs: Record<string, unknown>
  orders: string[]
  range?: [number, number]
}

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()

// Tablas simuladas: el mock aplica los .eq() y .range() como PostgREST, de modo que las
// pruebas verifican qué filas llegan (activas, con el rol correcto, todas las páginas).
let tables: Record<string, Row[]> = {}
let failingTable: string | null = null
let queries: Query[] = []

function builder(table: string) {
  const query: Query = { table, select: '', eqs: {}, orders: [] }
  const c: Record<string, unknown> = {}
  c.select = (columns: string) => {
    query.select = columns
    return c
  }
  c.eq = (column: string, value: unknown) => {
    query.eqs[column] = value
    return c
  }
  c.not = () => c
  c.order = (column: string) => {
    query.orders.push(column)
    return c
  }
  c.range = async (from: number, to: number) => {
    query.range = [from, to]
    queries.push({ ...query })
    if (table === failingTable) return { data: null, error: { message: 'db down' } }
    const rows = (tables[table] ?? []).filter((r) =>
      Object.entries(query.eqs).every(([k, v]) => r[k] === v)
    )
    return { data: rows.slice(from, to + 1), error: null }
  }
  return c
}

vi.mock('@/lib/actions/authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => builder(table),
  })),
}))

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function request(type?: string) {
  const url = new URL('http://localhost/admin/import-template')
  if (type !== undefined) url.searchParams.set('type', type)
  return new NextRequest(url)
}

async function load(response: Response) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await response.arrayBuffer())
  return workbook
}

function column(workbook: ExcelJS.Workbook, index: number) {
  const values = workbook.getWorksheet('Listas')!.getColumn(index).values as unknown[]
  return values.slice(1).filter((v) => v !== '' && v !== undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockCheckAdmin.mockResolvedValue(true)
  failingTable = null
  queries = []
  tables = {
    careers: [
      { id: 1, name: 'Derecho', is_active: true },
      { id: 2, name: 'Sistemas', is_active: true },
      { id: 3, name: 'Antigua', is_active: false },
    ],
    periods: [{ id: 1, name: '2026-1', is_active: true }],
    subjects: [
      { id: 1, code: 'ALG-201', name: 'Álgebra Lineal', is_active: true },
      { id: 2, code: 'OLD-1', name: 'Vieja', is_active: false },
    ],
    profiles: [
      { id: 'p1', role: 'PROFESSOR', is_active: true, email: 'maria@urepublicana.edu.co' },
      { id: 'p2', role: 'PROFESSOR', is_active: false, email: 'baja@urepublicana.edu.co' },
      { id: 'p3', role: 'ADMIN', is_active: true, email: 'admin@urepublicana.edu.co' },
      {
        id: 's1',
        role: 'STUDENT',
        is_active: true,
        student_code: '202500000001',
        name: 'Ana Torres',
      },
      {
        id: 's2',
        role: 'STUDENT',
        is_active: false,
        student_code: '202500000002',
        name: 'Luis Baja',
      },
    ],
  }
})

describe('GET /admin/import-template — access and validation', () => {
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
    expect(queries).toEqual([])
  })

  it.each([undefined, 'NOPE', 'toString', '__proto__'])('returns 400 for type %s', async (type) => {
    const response = await GET(request(type))
    expect(response.status).toBe(400)
    expect(queries).toEqual([])
  })

  it('returns 500 with a JSON error when a list cannot be loaded', async () => {
    failingTable = 'careers'

    const response = await GET(request('STUDENT'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'No se pudo generar la plantilla.' })
  })
})

describe('GET /admin/import-template — generated lists', () => {
  it('returns an xlsx attachment with only the active careers on a hidden sheet', async () => {
    const response = await GET(request('STUDENT'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(XLSX_MIME)
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="plantilla_estudiantes.xlsx"'
    )
    expect(response.headers.get('cache-control')).toBe('no-store')

    const workbook = await load(response)
    expect(workbook.getWorksheet('Listas')!.state).toBe('hidden')
    expect(column(workbook, 1)).toEqual(['Carreras', 'Derecho', 'Sistemas'])
    // Los estudiantes solo necesitan carreras: ninguna otra tabla se consulta.
    expect(new Set(queries.map((q) => q.table))).toEqual(new Set(['careers']))
  })

  it('lists careers, periods and ACTIVE professors for the subject template', async () => {
    const response = await GET(request('SUBJECT'))
    expect(response.status).toBe(200)

    const workbook = await load(response)
    expect(column(workbook, 1)).toEqual(['Carreras', 'Derecho', 'Sistemas'])
    expect(column(workbook, 2)).toEqual(['Períodos', '2026-1'])
    // Solo el docente activo: ni el dado de baja ni el administrador.
    expect(column(workbook, 3)).toEqual(['Profesores', 'maria@urepublicana.edu.co'])

    const professors = queries.find((q) => q.table === 'profiles')!
    expect(professors.eqs).toEqual({ role: 'PROFESSOR', is_active: true })
  })

  it('lists ACTIVE subjects and students as "CODE — Name" for the enrollment template', async () => {
    const response = await GET(request('ENROLLMENT'))
    expect(response.status).toBe(200)

    const workbook = await load(response)
    expect(column(workbook, 1)).toEqual(['Materias', 'ALG-201 — Álgebra Lineal'])
    expect(column(workbook, 2)).toEqual(['Estudiantes', '202500000001 — Ana Torres'])

    const students = queries.find((q) => q.table === 'profiles')!
    expect(students.eqs).toEqual({ role: 'STUDENT', is_active: true })
    expect(students.orders).toEqual(['student_code', 'id']) // determinista para paginar
    expect(queries.find((q) => q.table === 'subjects')!.orders).toEqual(['code', 'id'])
  })

  it('pages through every row beyond the 1000-row PostgREST cap', async () => {
    tables.profiles = Array.from({ length: 2500 }, (_, i) => ({
      id: `s${i}`,
      role: 'STUDENT',
      is_active: true,
      student_code: String(202500000000 + i),
      name: `Estudiante ${i}`,
    }))

    const response = await GET(request('ENROLLMENT'))
    const workbook = await load(response)

    const students = column(workbook, 2)
    expect(students).toHaveLength(2501) // encabezado + 2500
    expect(students[2500]).toBe('202500002499 — Estudiante 2499')
    expect(queries.filter((q) => q.table === 'profiles').map((q) => q.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])

    // La validación abarca TODA la lista, no solo la primera página.
    const validation = workbook.getWorksheet('Inscripciones')!.getCell('B2').dataValidation
    expect(validation.formulae).toEqual(['Listas!$B$2:$B$2501'])
  })

  it('fails instead of returning a partial template when any list errors', async () => {
    failingTable = 'subjects'
    const response = await GET(request('ENROLLMENT'))
    expect(response.status).toBe(500)
  })
})
