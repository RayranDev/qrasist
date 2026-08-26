import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addEnrollment } from './enrollments'

const mockGetUser = vi.fn()
const mockProfileSingle = vi.fn()
const mockInsert = vi.fn()

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
})
