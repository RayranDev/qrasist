import { describe, it, expect, vi, beforeEach } from 'vitest'
import { approveEnrollmentRequest, rejectEnrollmentRequest } from './enrollmentRequests'

const mockGetUser = vi.fn()
const mockRequestSingle = vi.fn()
const mockProfileSingle = vi.fn()
const mockSubjectMaybeSingle = vi.fn()
const mockUpdateResult = vi.fn()

// Chain generico: select/eq/update/insert devuelven el mismo objeto para
// poder encadenar cualquier cantidad de .eq(), y el objeto es "thenable"
// para que un await directo (sin .single()) resuelva con mockUpdateResult
// -- asi se cubre tanto el flujo de lectura (termina en .single()) como
// el de escritura (termina en un update/insert encadenado).
function chain(terminal: { single?: () => unknown; maybeSingle?: () => unknown }) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.update = vi.fn(() => c)
  c.insert = vi.fn(() => c)
  c.single = terminal.single ?? vi.fn()
  c.maybeSingle = terminal.maybeSingle ?? vi.fn()
  c.then = (resolve: (value: unknown) => unknown) => resolve(mockUpdateResult())
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'enrollment_requests') return chain({ single: mockRequestSingle })
      if (table === 'profiles') return chain({ single: mockProfileSingle })
      if (table === 'subjects') return chain({ maybeSingle: mockSubjectMaybeSingle })
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('rejectEnrollmentRequest', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockRequestSingle.mockReset()
    mockProfileSingle.mockReset()
    mockSubjectMaybeSingle.mockReset()
    mockUpdateResult.mockReset().mockReturnValue({ error: null })
  })

  it('rejects when the caller is neither admin nor the subject professor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'intruder-1' } } })
    mockRequestSingle.mockResolvedValue({ data: { id: 'req-1', subject_id: 'subject-1' } })
    mockProfileSingle.mockResolvedValue({ data: { role: 'PROFESSOR' } }) // checkAdmin -> false
    mockSubjectMaybeSingle.mockResolvedValue({ data: null }) // no es el profesor de la materia

    const result = await rejectEnrollmentRequest('req-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
  })

  it('allows the owning professor to reject the request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockRequestSingle.mockResolvedValue({ data: { id: 'req-1', subject_id: 'subject-1' } })
    mockProfileSingle.mockResolvedValue({ data: { role: 'PROFESSOR' } }) // checkAdmin -> false
    mockSubjectMaybeSingle.mockResolvedValue({ data: { id: 'subject-1' } }) // es el profesor

    const result = await rejectEnrollmentRequest('req-1')

    expect(result.success).toBe(true)
  })

  it('allows an admin to reject a request for a subject they do not own', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockRequestSingle.mockResolvedValue({ data: { id: 'req-1', subject_id: 'subject-1' } })
    mockProfileSingle.mockResolvedValue({ data: { role: 'ADMIN' } }) // checkAdmin -> true

    const result = await rejectEnrollmentRequest('req-1')

    expect(result.success).toBe(true)
    // checkAdminOrSubjectProfessor corta en corto-circuito: no debe
    // ni siquiera consultar la tabla subjects.
    expect(mockSubjectMaybeSingle).not.toHaveBeenCalled()
  })
})

describe('approveEnrollmentRequest', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockRequestSingle.mockReset()
    mockProfileSingle.mockReset()
    mockSubjectMaybeSingle.mockReset()
    mockUpdateResult.mockReset().mockReturnValue({ error: null })
  })

  it('rejects when the caller is neither admin nor the subject professor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'intruder-1' } } })
    mockRequestSingle.mockResolvedValue({
      data: { id: 'req-1', student_id: 'student-1', subject_id: 'subject-1', status: 'pending' },
    })
    mockProfileSingle.mockResolvedValue({ data: { role: 'PROFESSOR' } }) // checkAdmin -> false
    mockSubjectMaybeSingle.mockResolvedValue({ data: null }) // no es el profesor de la materia

    const result = await approveEnrollmentRequest('req-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tienes permiso/i)
  })
})
