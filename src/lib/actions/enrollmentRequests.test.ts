import { describe, it, expect, vi, beforeEach } from 'vitest'
import { approveEnrollmentRequest, rejectEnrollmentRequest } from './enrollmentRequests'

const mockGetUser = vi.fn()
const mockRequestSingle = vi.fn()
const mockProfileSingle = vi.fn()
const mockSubjectMaybeSingle = vi.fn()
const mockRequestUpdateResult = vi.fn()
const mockEnrollInsertResult = vi.fn()
// Gate A+C+D (checkStudentEnrollable), solo relevante para approve: por
// defecto ambas devuelven una carrera en comun para que el "camino feliz"
// pase el gate y llegue hasta el intento de reclamar la solicitud.
const mockSubjectCareers = vi.fn().mockResolvedValue({ data: [{ career_id: 'career-1' }] })
const mockStudentCareers = vi.fn().mockResolvedValue({ data: [{ career_id: 'career-1' }] })

// Chain generico: select/eq/update/insert devuelven el mismo objeto para
// poder encadenar cualquier cantidad de .eq(), y el objeto es "thenable"
// para que un await directo (sin .single()/.maybeSingle()) resuelva con
// el resultado dado -- asi se cubre tanto el flujo de lectura (termina en
// .single()/.maybeSingle()) como el de escritura (update/insert
// encadenado, con o sin un .select() final).
function chain(opts: {
  single?: () => unknown
  maybeSingle?: () => unknown
  then?: () => unknown
}) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.update = vi.fn(() => c)
  c.insert = vi.fn(() => c)
  c.single = opts.single ?? vi.fn()
  c.maybeSingle = opts.maybeSingle ?? vi.fn()
  if (opts.then) {
    const thenFn = opts.then
    c.then = (resolve: (value: unknown) => unknown) => resolve(thenFn())
  }
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'enrollment_requests') {
        return chain({ single: mockRequestSingle, then: mockRequestUpdateResult })
      }
      if (table === 'profiles') return chain({ single: mockProfileSingle })
      if (table === 'subjects') return chain({ maybeSingle: mockSubjectMaybeSingle })
      if (table === 'enrollments') return chain({ then: mockEnrollInsertResult })
      if (table === 'subject_careers') {
        return { select: () => ({ eq: () => ({ eq: mockSubjectCareers }) }) }
      }
      if (table === 'student_careers') {
        return { select: () => ({ eq: () => ({ eq: mockStudentCareers }) }) }
      }
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function resetAll() {
  mockGetUser.mockReset()
  mockRequestSingle.mockReset()
  mockProfileSingle.mockReset()
  mockSubjectMaybeSingle.mockReset()
  mockRequestUpdateResult.mockReset().mockReturnValue({ data: [{ id: 'req-1' }], error: null })
  mockEnrollInsertResult.mockReset().mockReturnValue({ error: null })
  mockSubjectCareers.mockReset().mockResolvedValue({ data: [{ career_id: 'career-1' }] })
  mockStudentCareers.mockReset().mockResolvedValue({ data: [{ career_id: 'career-1' }] })
}

describe('rejectEnrollmentRequest', () => {
  beforeEach(resetAll)

  it('rejects when the caller is neither admin nor the subject professor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'intruder-1' } } })
    mockRequestSingle.mockResolvedValue({ data: { id: 'req-1', subject_id: 'subject-1' } })
    mockProfileSingle.mockResolvedValue({ data: { role: 'PROFESSOR', is_active: true } }) // checkAdmin -> false, cuenta activa
    mockSubjectMaybeSingle.mockResolvedValue({ data: null }) // no es el profesor de la materia

    const result = await rejectEnrollmentRequest('req-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
  })

  it('allows the owning professor to reject the request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockRequestSingle.mockResolvedValue({ data: { id: 'req-1', subject_id: 'subject-1' } })
    mockProfileSingle.mockResolvedValue({ data: { role: 'PROFESSOR', is_active: true } }) // checkAdmin -> false, cuenta activa
    mockSubjectMaybeSingle.mockResolvedValue({ data: { id: 'subject-1' } }) // es el profesor

    const result = await rejectEnrollmentRequest('req-1')

    expect(result.success).toBe(true)
  })

  it('allows an admin to reject a request for a subject they do not own', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockRequestSingle.mockResolvedValue({ data: { id: 'req-1', subject_id: 'subject-1' } })
    mockProfileSingle.mockResolvedValue({ data: { role: 'ADMIN', is_active: true } }) // checkAdmin -> true

    const result = await rejectEnrollmentRequest('req-1')

    expect(result.success).toBe(true)
    // checkAdminOrSubjectProfessor corta en corto-circuito: no debe
    // ni siquiera consultar la tabla subjects.
    expect(mockSubjectMaybeSingle).not.toHaveBeenCalled()
  })

  it('denies a deactivated professor even if they own the subject', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockRequestSingle.mockResolvedValue({ data: { id: 'req-1', subject_id: 'subject-1' } })
    mockProfileSingle
      // checkAdmin filtra is_active=true en la query real -- una cuenta
      // desactivada no matchea esa fila, asi que no encuentra nada.
      .mockResolvedValueOnce({ data: null })
      // segunda consulta de checkAdminOrSubjectProfessor: trae la fila
      // por id (sin filtro de is_active) para poder rechazar por inactiva.
      .mockResolvedValueOnce({ data: { role: 'PROFESSOR', is_active: false } })

    const result = await rejectEnrollmentRequest('req-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
    // La cuenta desactivada corta antes de siquiera mirar si es dueño.
    expect(mockSubjectMaybeSingle).not.toHaveBeenCalled()
  })

  it('denies a deactivated admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockRequestSingle.mockResolvedValue({ data: { id: 'req-1', subject_id: 'subject-1' } })
    mockProfileSingle
      .mockResolvedValueOnce({ data: null }) // checkAdmin: is_active=true no matchea
      .mockResolvedValueOnce({ data: { role: 'ADMIN', is_active: false } })

    const result = await rejectEnrollmentRequest('req-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
    expect(mockSubjectMaybeSingle).not.toHaveBeenCalled()
  })
})

describe('approveEnrollmentRequest', () => {
  beforeEach(resetAll)

  it('rejects when the caller is neither admin nor the subject professor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'intruder-1' } } })
    mockRequestSingle.mockResolvedValue({
      data: { id: 'req-1', student_id: 'student-1', subject_id: 'subject-1', status: 'pending' },
    })
    mockProfileSingle.mockResolvedValue({ data: { role: 'PROFESSOR', is_active: true } }) // checkAdmin -> false
    mockSubjectMaybeSingle.mockResolvedValue({ data: null }) // no es el profesor de la materia

    const result = await approveEnrollmentRequest('req-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
  })

  it('returns an error when the request was already claimed by another reviewer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockRequestSingle.mockResolvedValue({
      data: { id: 'req-1', student_id: 'student-1', subject_id: 'subject-1', status: 'pending' },
    })
    mockProfileSingle.mockResolvedValue({ data: { role: 'ADMIN', is_active: true } }) // checkAdmin -> true
    // El UPDATE ...WHERE status='pending' no afecto ninguna fila: alguien
    // (un reject() concurrente, por ejemplo) ya la proceso entre la
    // lectura inicial y este intento de reclamarla.
    mockRequestUpdateResult.mockReturnValue({ data: [], error: null })

    const result = await approveEnrollmentRequest('req-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ya fue revisada/i)
    // No debe haber insertado el enrollment si no logro reclamar la solicitud.
    expect(mockEnrollInsertResult).not.toHaveBeenCalled()
  })
})
