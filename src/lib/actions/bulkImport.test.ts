import { describe, it, expect, vi, beforeEach } from 'vitest'
import type ExcelJS from 'exceljs'
import {
  bulkImportStudents,
  bulkImportProfessors,
  bulkImportSubjects,
  bulkImportEnrollments,
} from './bulkImport'
import { addTable, xlsxFile } from '@/lib/excel/workbookTestUtils'
import { MAX_IMPORT_ROWS } from '@/lib/excel/importSchemas'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockCareersSelect = vi.fn()
const mockProfileByCode = vi.fn()
const mockProfileUpdate = vi.fn()
const mockProfileByEmailAndCode = vi.fn()
const mockCareerInsert = vi.fn()
const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn()

// Cliente del usuario (RLS): lo usan materias e inscripciones.
const mockUserFrom = vi.fn()

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))

vi.mock('./enrollmentGuards', () => ({
  checkStudentEnrollable: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => mockUserFrom(table),
  })),
}))

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { createUser: mockCreateUser, deleteUser: mockDeleteUser } },
    from: (table: string) => {
      if (table === 'careers') return { select: () => mockCareersSelect() }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (col: string, value: string) => ({
              maybeSingle: () => mockProfileByCode(value),
              // búsqueda de huérfano tras un createUser que lanzó: .eq('email').eq('student_code')
              eq: (_col2: string, value2: string) => ({
                maybeSingle: () => mockProfileByEmailAndCode(col, value, value2),
              }),
            }),
          }),
          update: (values: unknown) => ({
            eq: (_col: string, id: string) => ({ select: () => mockProfileUpdate(values, id) }),
          }),
        }
      }
      if (table === 'student_careers' || table === 'professor_careers') {
        return { insert: (values: unknown) => mockCareerInsert(table, values) }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const USER_HEADERS = ['Nombres', 'Apellidos', 'Correo', 'Contraseña', 'Código', 'Carrera']

const CAREERS = [
  { id: 'career-sys', name: 'Ingeniería de Sistemas', is_active: true },
  { id: 'career-law', name: 'Derecho', is_active: false },
]

function userRow(overrides: Record<string, ExcelJS.CellValue> = {}) {
  return {
    Nombres: 'Juan',
    Apellidos: 'Pérez',
    Correo: 'ana.torres@urepublicana.edu.co',
    Contraseña: 'Clave1234',
    Código: '202500000001',
    Carrera: null,
    ...overrides,
  }
}

async function formWith(
  rows: Record<string, ExcelJS.CellValue>[],
  headers = USER_HEADERS,
  sheetName = 'Estudiantes'
) {
  const file = await xlsxFile((wb) => addTable(wb, sheetName, headers, rows))
  const formData = new FormData()
  formData.append('file', file)
  return formData
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockCheckAdmin.mockResolvedValue(true)
  mockCareersSelect.mockResolvedValue({ data: CAREERS, error: null })
  mockProfileByCode.mockResolvedValue({ data: null })
  mockProfileUpdate.mockResolvedValue({ data: [{ id: 'user-1' }], error: null })
  mockProfileByEmailAndCode.mockResolvedValue({ data: null })
  mockCareerInsert.mockResolvedValue({ error: null })
  mockDeleteUser.mockResolvedValue({ error: null })
  let n = 0
  mockCreateUser.mockImplementation(async () => ({
    data: { user: { id: `user-${++n}` } },
    error: null,
  }))
})

describe('bulkImportStudents — access and file checks', () => {
  it('rejects a non-admin without touching the file or the database', async () => {
    mockCheckAdmin.mockResolvedValue(false)
    const result = await bulkImportStudents(await formWith([userRow()]))
    expect(result).toEqual({ success: false, error: 'No autorizado.' })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('names the missing columns and asks for the template', async () => {
    const form = await formWith(
      [{ Nombres: 'Juan', Correo: 'j@urepublicana.edu.co' }],
      ['Nombres', 'Correo']
    )
    const result = await bulkImportStudents(form)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/Faltan columnas.*Apellidos, Contraseña, Código/)
    }
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('rejects a file with more than the row cap before creating anything', async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) =>
      userRow({
        Correo: `u${i}@urepublicana.edu.co`,
        Código: String(202500000000 + i),
      })
    )
    const result = await bulkImportStudents(await formWith(rows))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain(`${MAX_IMPORT_ROWS} filas`)
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('accepts a file with exactly the row cap', async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) =>
      userRow({
        Correo: `u${i}@urepublicana.edu.co`,
        Código: String(202500000000 + i),
      })
    )
    const result = await bulkImportStudents(await formWith(rows))
    expect(result).toMatchObject({ success: true, successCount: MAX_IMPORT_ROWS, errors: [] })
    expect(mockCreateUser).toHaveBeenCalledTimes(MAX_IMPORT_ROWS)
  })
})

describe('bulkImportStudents — values from real Excel cells', () => {
  it('imports a student whose email Excel auto-linked as a hyperlink, storing it lowercase', async () => {
    const file = await xlsxFile((wb) => {
      const sheet = addTable(wb, 'Estudiantes', USER_HEADERS, [userRow()])
      sheet.getCell('C2').value = {
        text: ' Ana.Torres@UREPUBLICANA.edu.co ',
        hyperlink: 'mailto:Ana.Torres@UREPUBLICANA.edu.co',
      }
    })
    const form = new FormData()
    form.append('file', file)

    const result = await bulkImportStudents(form)

    expect(result).toMatchObject({ success: true, successCount: 1, errors: [] })
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana.torres@urepublicana.edu.co' })
    )
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana.torres@urepublicana.edu.co', role: 'STUDENT' }),
      'user-1'
    )
  })

  it('accepts a student code typed as a number', async () => {
    const result = await bulkImportStudents(await formWith([userRow({ Código: 202512345678 })]))
    expect(result).toMatchObject({ success: true, successCount: 1 })
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        user_metadata: expect.objectContaining({ student_code: '202512345678' }),
      })
    )
  })

  it('still enforces the 12-digit rule on the student code', async () => {
    const result = await bulkImportStudents(await formWith([userRow({ Código: '12345' })]))
    expect(result).toMatchObject({
      success: true,
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('12 dígitos') }],
    })
  })

  it('reports the real sheet row number when there are blank rows in between', async () => {
    const result = await bulkImportStudents(
      await formWith([userRow(), {}, userRow({ Correo: 'otro@gmail.com', Código: '202512345679' })])
    )
    expect(result).toMatchObject({
      successCount: 1,
      errors: [{ row: 4, message: expect.stringContaining('institucional') }],
    })
  })

  it('reports a code or email repeated inside the same file instead of racing the database', async () => {
    const result = await bulkImportStudents(
      await formWith([
        userRow(),
        userRow({ Correo: 'otro@urepublicana.edu.co' }),
        userRow({ Código: '202512345679' }),
      ])
    )
    expect(result).toMatchObject({
      successCount: 1,
      errors: [
        { row: 3, message: expect.stringContaining('código está repetido') },
        { row: 4, message: expect.stringContaining('correo está repetido') },
      ],
    })
    expect(mockCreateUser).toHaveBeenCalledTimes(1)
  })

  it('translates the "email already registered" auth error', async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: {
        code: 'email_exists',
        message: 'A user with this email address has already been registered',
      },
    })
    const result = await bulkImportStudents(await formWith([userRow()]))
    expect(result).toMatchObject({
      errors: [{ row: 2, message: 'Ya existe un usuario con ese correo.' }],
    })
  })
})

describe('bulkImportStudents — career column', () => {
  it('links the student to an active career matched ignoring case and accents', async () => {
    const result = await bulkImportStudents(
      await formWith([userRow({ Carrera: '  INGENIERIA de sistemas ' })])
    )

    expect(result).toMatchObject({ success: true, successCount: 1, errors: [] })
    expect(mockCareerInsert).toHaveBeenCalledWith('student_careers', {
      student_id: 'user-1',
      career_id: 'career-sys',
      is_active: true,
    })
  })

  it('imports without a career when the column is empty and writes no career row', async () => {
    const result = await bulkImportStudents(await formWith([userRow()]))
    expect(result).toMatchObject({ successCount: 1 })
    expect(mockCareerInsert).not.toHaveBeenCalled()
  })

  it('still imports a file whose template has no Carrera column', async () => {
    const headers = USER_HEADERS.slice(0, 5)
    const result = await bulkImportStudents(await formWith([userRow()], headers))
    expect(result).toMatchObject({ successCount: 1, errors: [] })
  })

  it('fails the row for an inactive career, before creating the account', async () => {
    const result = await bulkImportStudents(await formWith([userRow({ Carrera: 'Derecho' })]))
    expect(result).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: 'La carrera "Derecho" está inactiva.' }],
    })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('fails the row for an unknown career and never creates one', async () => {
    const result = await bulkImportStudents(await formWith([userRow({ Carrera: 'Medicina' })]))
    expect(result).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: 'No existe la carrera "Medicina".' }],
    })
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(mockCareerInsert).not.toHaveBeenCalled()
  })

  it('writes professor_careers for professors', async () => {
    const result = await bulkImportProfessors(
      await formWith(
        [userRow({ Código: 'D-100', Carrera: 'Ingeniería de Sistemas' })],
        USER_HEADERS,
        'Docentes'
      )
    )
    expect(result).toMatchObject({ successCount: 1, errors: [] })
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'PROFESSOR' }),
      'user-1'
    )
    expect(mockCareerInsert).toHaveBeenCalledWith('professor_careers', {
      professor_id: 'user-1',
      career_id: 'career-sys',
      is_active: true,
    })
  })
})

describe('bulkImportStudents — orphan cleanup', () => {
  it('deletes the created auth user when the profile update fails', async () => {
    mockProfileUpdate.mockResolvedValue({ error: { message: 'boom' } })

    const result = await bulkImportStudents(await formWith([userRow()]))

    expect(mockDeleteUser).toHaveBeenCalledWith('user-1')
    expect(result).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('No se creó el usuario') }],
    })
  })

  it('deletes the created auth user when the career link fails', async () => {
    mockCareerInsert.mockResolvedValue({ error: { message: 'fk violation' } })

    const result = await bulkImportStudents(
      await formWith([userRow({ Carrera: 'Ingeniería de Sistemas' })])
    )

    expect(mockDeleteUser).toHaveBeenCalledWith('user-1')
    expect(result).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('No se pudo asignar la carrera') }],
    })
  })

  it('deletes the created auth user when a step throws', async () => {
    mockProfileUpdate.mockRejectedValue(new Error('network down'))

    const result = await bulkImportStudents(await formWith([userRow()]))

    expect(mockDeleteUser).toHaveBeenCalledWith('user-1')
    expect(result).toMatchObject({
      errors: [{ row: 2, message: expect.stringContaining('network down') }],
    })
  })

  it('tells the admin to review the account when the cleanup itself fails', async () => {
    mockProfileUpdate.mockResolvedValue({ error: { message: 'boom' } })
    mockDeleteUser.mockResolvedValue({ error: { message: 'cannot delete' } })

    const result = await bulkImportStudents(await formWith([userRow()]))

    expect(result).toMatchObject({
      errors: [{ row: 2, message: expect.stringContaining('revísala en Usuarios') }],
    })
  })

  it('does not call deleteUser when createUser itself fails', async () => {
    mockCreateUser.mockResolvedValue({ data: null, error: { message: 'weak password' } })
    await bulkImportStudents(await formWith([userRow()]))
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })
})

describe('bulkImportSubjects — career and period lookup', () => {
  const SUBJECT_HEADERS = ['Nombre', 'Código', 'Carrera', 'Semestre', 'Correo Profesor', 'Período']
  const mockSubjectInsert = vi.fn()
  const mockSubjectCareerInsert = vi.fn()
  const mockSubjectDelete = vi.fn()
  const mockEmailIlike = vi.fn()

  beforeEach(() => {
    mockSubjectInsert.mockReset().mockResolvedValue({ data: { id: 'subject-1' }, error: null })
    mockSubjectCareerInsert.mockReset().mockResolvedValue({ error: null })
    mockSubjectDelete.mockReset().mockResolvedValue({ error: null })
    mockEmailIlike.mockReset().mockResolvedValue({
      data: { id: 'prof-1', role: 'PROFESSOR' },
    })
    mockUserFrom.mockImplementation((table: string) => {
      if (table === 'careers') return { select: async () => ({ data: CAREERS, error: null }) }
      if (table === 'periods') {
        return {
          select: async () => ({
            data: [
              { id: 'period-1', name: '2026-1', is_active: true },
              { id: 'period-0', name: '2025-2', is_active: false },
            ],
            error: null,
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            ilike: (_col: string, value: string) => ({ maybeSingle: () => mockEmailIlike(value) }),
          }),
        }
      }
      if (table === 'professor_careers') {
        const c: Record<string, unknown> = {}
        c.select = () => c
        c.eq = () => c
        c.maybeSingle = async () => ({ data: { id: 'pc-1' } })
        return c
      }
      if (table === 'subjects') {
        return {
          insert: (values: unknown) => ({
            select: () => ({ single: () => mockSubjectInsert(values) }),
          }),
          delete: () => ({ eq: (_col: string, id: string) => mockSubjectDelete(id) }),
        }
      }
      if (table === 'subject_careers') {
        return { insert: (values: unknown) => mockSubjectCareerInsert(values) }
      }
      throw new Error(`unexpected table: ${table}`)
    })
  })

  async function subjectForm(row: Record<string, ExcelJS.CellValue>) {
    return formWith(
      [{ Nombre: 'Álgebra Lineal', Código: 'ALG-201', ...row }],
      SUBJECT_HEADERS,
      'Materias'
    )
  }

  it('matches career and period case/accent-insensitively and lowercases the professor email', async () => {
    const result = await bulkImportSubjects(
      await subjectForm({
        Carrera: 'ingenieria DE sistemas',
        Semestre: 2,
        'Correo Profesor': 'Maria.Gomez@UREPUBLICANA.edu.co',
        Período: '2026-1',
      })
    )

    expect(result).toMatchObject({ success: true, successCount: 1, errors: [] })
    expect(mockEmailIlike).toHaveBeenCalledWith('maria.gomez@urepublicana.edu.co')
    expect(mockSubjectInsert).toHaveBeenCalledWith(
      expect.objectContaining({ professor_id: 'prof-1', period_id: 'period-1' })
    )
    expect(mockSubjectCareerInsert).toHaveBeenCalledWith(
      expect.objectContaining({ career_id: 'career-sys', level: 2 })
    )
  })

  it('escapes LIKE wildcards in the professor email lookup', async () => {
    await bulkImportSubjects(
      await subjectForm({
        Carrera: 'Ingeniería de Sistemas',
        'Correo Profesor': 'maria_gomez@urepublicana.edu.co',
      })
    )
    expect(mockEmailIlike).toHaveBeenCalledWith('maria\\_gomez@urepublicana.edu.co')
  })

  it('fails the row for an inactive career or an inactive/unknown period', async () => {
    const inactiveCareer = await bulkImportSubjects(await subjectForm({ Carrera: 'Derecho' }))
    expect(inactiveCareer).toMatchObject({
      errors: [{ row: 2, message: 'La carrera "Derecho" está inactiva.' }],
    })

    const inactivePeriod = await bulkImportSubjects(await subjectForm({ Período: '2025-2' }))
    expect(inactivePeriod).toMatchObject({
      errors: [{ row: 2, message: 'El período "2025-2" está inactivo.' }],
    })

    const unknownPeriod = await bulkImportSubjects(await subjectForm({ Período: '1999-1' }))
    expect(unknownPeriod).toMatchObject({
      errors: [{ row: 2, message: 'No existe el período "1999-1".' }],
    })
    expect(mockSubjectInsert).not.toHaveBeenCalled()
  })

  it('deletes the created subject when linking it to the career fails, so a retry works', async () => {
    mockSubjectCareerInsert.mockResolvedValue({ error: { message: 'fk' } })

    const result = await bulkImportSubjects(
      await subjectForm({ Carrera: 'Ingeniería de Sistemas' })
    )

    expect(mockSubjectDelete).toHaveBeenCalledWith('subject-1')
    expect(result).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('No se creó la materia') }],
    })
  })

  it('tells the admin to review the subject when the cleanup delete also fails', async () => {
    mockSubjectCareerInsert.mockResolvedValue({ error: { message: 'fk' } })
    mockSubjectDelete.mockResolvedValue({ error: { message: 'nope' } })

    const result = await bulkImportSubjects(
      await subjectForm({ Carrera: 'Ingeniería de Sistemas' })
    )

    expect(result).toMatchObject({
      errors: [{ row: 2, message: expect.stringContaining('revisa la materia ALG-201') }],
    })
  })

  it('rejects the untouched template example row', async () => {
    const result = await bulkImportSubjects(
      await formWith(
        [{ Nombre: 'Cálculo I', Código: 'CALC-101', Semestre: 1 }],
        SUBJECT_HEADERS,
        'Materias'
      )
    )
    expect(result).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('fila de ejemplo') }],
    })
    expect(mockSubjectInsert).not.toHaveBeenCalled()
  })
})

describe('bulkImportEnrollments — numeric codes', () => {
  it('reads a numeric student code from the sheet and looks it up as text', async () => {
    const mockStudent = vi.fn().mockResolvedValue({ data: { id: 'st-1', role: 'STUDENT' } })
    const mockEnrollInsert = vi.fn().mockResolvedValue({ error: null })
    mockUserFrom.mockImplementation((table: string) => {
      if (table === 'subjects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: 'subject-1' } }) }),
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, value: string) => ({ maybeSingle: () => mockStudent(value) }),
          }),
        }
      }
      if (table === 'enrollments') return { insert: mockEnrollInsert }
      throw new Error(`unexpected table: ${table}`)
    })

    const form = await formWith(
      [{ 'Código Materia': 'ALG-201', 'Código Estudiante': 202512345678 }],
      ['Código Materia', 'Código Estudiante'],
      'Inscripciones'
    )
    const result = await bulkImportEnrollments(form)

    expect(result).toMatchObject({ successCount: 1, errors: [] })
    expect(mockStudent).toHaveBeenCalledWith('202512345678')
    expect(mockEnrollInsert).toHaveBeenCalledWith({ subject_id: 'subject-1', student_id: 'st-1' })
  })
})

describe('bulkImportStudents — hardening', () => {
  it('treats a profile update that touches no rows as a failure and rolls back', async () => {
    mockProfileUpdate.mockResolvedValue({ data: [], error: null })

    const result = await bulkImportStudents(await formWith([userRow()]))

    expect(mockDeleteUser).toHaveBeenCalledWith('user-1')
    expect(result).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('No se encontró el perfil') }],
    })
  })

  it('names the email when deleteUser throws, without a second rollback', async () => {
    mockProfileUpdate.mockResolvedValue({ error: { message: 'boom' } })
    mockDeleteUser.mockRejectedValue(new Error('network'))

    const result = await bulkImportStudents(await formWith([userRow()]))

    expect(mockDeleteUser).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      errors: [
        {
          row: 2,
          message: expect.stringContaining('revísala en Usuarios (ana.torres@urepublicana.edu.co)'),
        },
      ],
    })
  })

  it('deletes the account that createUser may have created before throwing', async () => {
    mockCreateUser.mockRejectedValue(new Error('timeout'))
    mockProfileByEmailAndCode.mockResolvedValue({ data: { id: 'ghost-1' } })

    const result = await bulkImportStudents(await formWith([userRow()]))

    // Se busca por correo Y código, no solo por correo, para no borrar a un usuario previo.
    expect(mockProfileByEmailAndCode).toHaveBeenCalledWith(
      'email',
      'ana.torres@urepublicana.edu.co',
      '202500000001'
    )
    expect(mockDeleteUser).toHaveBeenCalledWith('ghost-1')
    expect(result).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('Error inesperado al crear la cuenta') }],
    })
  })

  it('reports a plain failure when createUser threw and no account exists', async () => {
    mockCreateUser.mockRejectedValue(new Error('timeout'))

    const result = await bulkImportStudents(await formWith([userRow()]))

    expect(mockDeleteUser).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      errors: [{ row: 2, message: expect.stringContaining('timeout') }],
    })
  })

  it('names the email when it cannot check whether the account was created', async () => {
    mockCreateUser.mockRejectedValue(new Error('timeout'))
    mockProfileByEmailAndCode.mockRejectedValue(new Error('db down'))

    const result = await bulkImportStudents(await formWith([userRow()]))

    expect(result).toMatchObject({
      errors: [
        {
          row: 2,
          message: expect.stringContaining('revísala en Usuarios (ana.torres@urepublicana.edu.co)'),
        },
      ],
    })
  })

  it('rejects the untouched template example row for students and professors', async () => {
    const student = await bulkImportStudents(
      await formWith([
        userRow({ Correo: 'juan.perez@urepublicana.edu.co', Código: '202512345678' }),
      ])
    )
    expect(student).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('fila de ejemplo') }],
    })

    const professor = await bulkImportProfessors(
      await formWith(
        [userRow({ Correo: 'maria.gomez@urepublicana.edu.co', Código: '1122334455' })],
        USER_HEADERS,
        'Docentes'
      )
    )
    expect(professor).toMatchObject({
      errors: [{ row: 2, message: expect.stringContaining('fila de ejemplo') }],
    })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('imports a real user that shares the example email but not its code', async () => {
    const result = await bulkImportStudents(
      await formWith([userRow({ Correo: 'juan.perez@urepublicana.edu.co' })])
    )
    expect(result).toMatchObject({ successCount: 1, errors: [] })
  })

  it('fails the row when several active careers share the name, unless it is typed exactly', async () => {
    mockCareersSelect.mockResolvedValue({
      data: [
        { id: 'a', name: 'Ingeniería de Sistemas', is_active: true },
        { id: 'b', name: 'Ingenieria de Sistemas', is_active: true },
      ],
      error: null,
    })

    const ambiguous = await bulkImportStudents(
      await formWith([userRow({ Carrera: 'ingenieria de sistemas' })])
    )
    expect(ambiguous).toMatchObject({
      successCount: 0,
      errors: [{ row: 2, message: expect.stringContaining('Hay varias carreras activas') }],
    })
    expect(mockCreateUser).not.toHaveBeenCalled()

    const exact = await bulkImportStudents(
      await formWith([userRow({ Carrera: 'Ingeniería de Sistemas' })])
    )
    expect(exact).toMatchObject({ successCount: 1 })
    expect(mockCareerInsert).toHaveBeenCalledWith(
      'student_careers',
      expect.objectContaining({ career_id: 'a' })
    )
  })

  it('words an in-file duplicate without implying the other row succeeded', async () => {
    const result = await bulkImportStudents(
      await formWith([userRow(), userRow({ Correo: 'otro@urepublicana.edu.co' })])
    )
    expect(result).toMatchObject({
      errors: [{ row: 3, message: expect.stringContaining('también aparece en la fila 2') }],
    })
  })
})

describe('bulkImportEnrollments — dropdown display values', () => {
  it('accepts "CODE — Name" values and looks up only the code', async () => {
    const mockSubjectByCode = vi.fn().mockResolvedValue({ data: { id: 'subject-1' } })
    const mockStudent = vi.fn().mockResolvedValue({ data: { id: 'st-1', role: 'STUDENT' } })
    const mockEnrollInsert = vi.fn().mockResolvedValue({ error: null })
    mockUserFrom.mockImplementation((table: string) => {
      if (table === 'subjects') {
        return {
          select: () => ({
            eq: (_col: string, value: string) => ({ maybeSingle: () => mockSubjectByCode(value) }),
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, value: string) => ({ maybeSingle: () => mockStudent(value) }),
          }),
        }
      }
      if (table === 'enrollments') return { insert: mockEnrollInsert }
      throw new Error(`unexpected table: ${table}`)
    })

    const form = await formWith(
      [
        {
          'Código Materia': 'ALG-201 — Álgebra Lineal',
          'Código Estudiante': '202500000001 — Ana Torres',
        },
        { 'Código Materia': 'ALG-201', 'Código Estudiante': '202500000002' },
      ],
      ['Código Materia', 'Código Estudiante'],
      'Inscripciones'
    )
    const result = await bulkImportEnrollments(form)

    expect(result).toMatchObject({ successCount: 2, errors: [] })
    expect(mockSubjectByCode).toHaveBeenCalledWith('ALG-201')
    expect(mockStudent).toHaveBeenCalledWith('202500000001')
    expect(mockStudent).toHaveBeenCalledWith('202500000002')
  })
})
