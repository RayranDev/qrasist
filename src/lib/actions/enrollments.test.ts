import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addEnrollment } from './enrollments'

const mockGetUser = vi.fn()
const mockProfileSingle = vi.fn()
const mockInsert = vi.fn()
// Gate A+C+D (checkStudentEnrollable): la materia y el estudiante
// necesitan pertenecer a la misma carrera para poder inscribirse --
// ver enrollmentGuards.ts. Por defecto ambas devuelven una carrera en
// comun para que el "camino feliz" siga pasando; los tests que
// necesiten un escenario distinto sobreescriben estos mocks.
const mockSubjectCareers = vi.fn().mockResolvedValue({ data: [{ career_id: 'career-1' }] })
const mockStudentCareers = vi.fn().mockResolvedValue({ data: [{ career_id: 'career-1' }] })

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: mockProfileSingle }) }) }
      }
      if (table === 'enrollments') {
        return { insert: mockInsert }
      }
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

describe('addEnrollment', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockProfileSingle.mockReset()
    mockInsert.mockReset()
    mockSubjectCareers.mockReset().mockResolvedValue({ data: [{ career_id: 'career-1' }] })
    mockStudentCareers.mockReset().mockResolvedValue({ data: [{ career_id: 'career-1' }] })
  })

  it('rejects when the caller is not an admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValueOnce({ data: { role: 'PROFESSOR' } })

    const result = await addEnrollment('subject-1', 'student-1')

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects enrolling a user that is not a STUDENT', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle
      .mockResolvedValueOnce({ data: { role: 'ADMIN' } }) // checkAdmin
      .mockResolvedValueOnce({ data: { role: 'PROFESSOR' } }) // target role check

    const result = await addEnrollment('subject-1', 'professor-2')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no es un estudiante/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('enrolls a real STUDENT when the caller is admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle
      .mockResolvedValueOnce({ data: { role: 'ADMIN' } })
      .mockResolvedValueOnce({ data: { role: 'STUDENT' } })
    mockInsert.mockResolvedValue({ error: null })

    const result = await addEnrollment('subject-1', 'student-1')

    expect(result.success).toBe(true)
    expect(mockInsert).toHaveBeenCalledWith({ subject_id: 'subject-1', student_id: 'student-1' })
  })

  it('rejects when the student career does not match the subject career', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle
      .mockResolvedValueOnce({ data: { role: 'ADMIN' } })
      .mockResolvedValueOnce({ data: { role: 'STUDENT' } })
    mockSubjectCareers.mockResolvedValue({ data: [{ career_id: 'career-1' }] })
    mockStudentCareers.mockResolvedValue({ data: [{ career_id: 'career-2' }] })

    const result = await addEnrollment('subject-1', 'student-1')

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects when the student has no career assigned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle
      .mockResolvedValueOnce({ data: { role: 'ADMIN' } })
      .mockResolvedValueOnce({ data: { role: 'STUDENT' } })
    mockSubjectCareers.mockResolvedValue({ data: [{ career_id: 'career-1' }] })
    mockStudentCareers.mockResolvedValue({ data: [] })

    const result = await addEnrollment('subject-1', 'student-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no tiene ninguna carrera/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
