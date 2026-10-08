import { describe, it, expect, vi, beforeEach } from 'vitest'
import { justifyClassOmission } from './classOmissions'

const mockGetUser = vi.fn()
const mockResolveRole = vi.fn()
const mockFetchOmissions = vi.fn()
const mockInsert = vi.fn()
const mockInsertSingle = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('./authGuards', () => ({
  resolveSubjectEditorRole: (...args: unknown[]) => mockResolveRole(...args),
}))
vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))
vi.mock('@/lib/attendance/classOmissionsData', () => ({
  fetchClassOmissions: (...args: unknown[]) => mockFetchOmissions(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table !== 'class_omissions') throw new Error(`unexpected table: ${table}`)
      return {
        insert: vi.fn((row: unknown) => {
          mockInsert(row)
          return { select: vi.fn(() => ({ single: mockInsertSingle })) }
        }),
      }
    }),
  }),
}))

const omission = {
  subjectId: 'subject-1',
  date: '2026-03-02',
  scheduleId: 'block-1',
  startTime: '08:00:00',
  endTime: '10:00:00',
  justified: false,
}

const input = { subjectId: 'subject-1', date: '2026-03-02', reason: '  Me enfermé de repente  ' }

describe('justifyClassOmission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockResolveRole.mockResolvedValue('PROFESSOR')
    mockFetchOmissions.mockResolvedValue([omission])
    mockInsertSingle.mockResolvedValue({ data: { id: 'omission-1' }, error: null })
  })

  it('requires a reason of at least 5 characters before anything else', async () => {
    const result = await justifyClassOmission({ ...input, reason: 'no' })

    expect(result.success).toBe(false)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('rejects a reason over the 1000 character limit of the table', async () => {
    const result = await justifyClassOmission({ ...input, reason: 'x'.repeat(1001) })

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a malformed date', async () => {
    const result = await justifyClassOmission({ ...input, date: '02/03/2026' })

    expect(result.success).toBe(false)
    expect(mockFetchOmissions).not.toHaveBeenCalled()
  })

  it('rejects a user with no role on the subject', async () => {
    mockResolveRole.mockResolvedValue(null)

    const result = await justifyClassOmission(input)

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('re-derives the omission server-side: a day that is not an omission is refused', async () => {
    mockFetchOmissions.mockResolvedValue([])

    const result = await justifyClassOmission(input)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no figura/i)
    expect(mockFetchOmissions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subjectIds: ['subject-1'], from: '2026-03-02', to: '2026-03-02' })
    )
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('refuses a class that was already justified', async () => {
    mockFetchOmissions.mockResolvedValue([{ ...omission, justified: true, reason: 'Otra' }])

    const result = await justifyClassOmission(input)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ya fue justificada/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('stores the trimmed reason with the schedule block and audits it', async () => {
    const result = await justifyClassOmission(input)

    expect(result).toEqual({ success: true })
    expect(mockInsert).toHaveBeenCalledWith({
      subject_id: 'subject-1',
      class_date: '2026-03-02',
      schedule_id: 'block-1',
      reason: 'Me enfermé de repente',
      submitted_by: 'prof-1',
    })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'class_omission.justify',
        actorId: 'prof-1',
        subjectId: 'subject-1',
        details: expect.objectContaining({
          class_date: '2026-03-02',
          reason: 'Me enfermé de repente',
          actor_role: 'PROFESSOR',
        }),
      })
    )
  })

  it('turns a unique-violation race into a friendly message without auditing', async () => {
    mockInsertSingle.mockResolvedValue({ data: null, error: { code: '23505' } })

    const result = await justifyClassOmission(input)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/ya fue justificada/i)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})
