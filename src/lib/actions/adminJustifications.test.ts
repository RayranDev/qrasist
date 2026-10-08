import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createExcuseUploadUrl, registerExcuse } from './adminJustifications'

const FILE = '11111111-2222-3333-4444-555555555555.pdf'
const PATH = `student-1/session-1/${FILE}`
const REASON = 'Incapacidad médica validada por coordinación.'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const reads: Record<string, ReturnType<typeof vi.fn>> = {
  profiles: vi.fn(),
  sessions: vi.fn(),
  enrollments: vi.fn(),
  attendances: vi.fn(),
  absence_justifications: vi.fn(),
}
const mockStorageList = vi.fn()
const mockSignedUpload = vi.fn()
const mockInsert = vi.fn()
const mockInsertSingle = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateSelect = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))

vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      const read = reads[table]
      if (!read) throw new Error(`unexpected table in test: ${table}`)
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.maybeSingle = read
      return c
    }),
  })),
}))

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: vi.fn(() => ({ list: mockStorageList, createSignedUploadUrl: mockSignedUpload })),
    },
    from: vi.fn(() => ({
      insert: vi.fn((values: unknown) => {
        mockInsert(values)
        return { select: vi.fn(() => ({ single: mockInsertSingle })) }
      }),
      update: vi.fn((values: unknown) => {
        mockUpdate(values)
        const c: Record<string, unknown> = {}
        c.eq = vi.fn(() => c)
        c.select = mockUpdateSelect
        return c
      }),
    })),
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function arrangeEligibleAbsence() {
  reads.profiles.mockResolvedValue({ data: { role: 'STUDENT', is_active: true } })
  reads.sessions.mockResolvedValue({
    data: {
      id: 'session-1',
      subject_id: 'subject-1',
      is_active: true,
      expires_at: '2026-01-01T10:15:00Z',
    },
  })
  reads.enrollments.mockResolvedValue({ data: { id: 'enrollment-1' } })
  reads.attendances.mockResolvedValue({ data: null })
  reads.absence_justifications.mockResolvedValue({ data: null })
  mockStorageList.mockResolvedValue({ data: [{ name: FILE }], error: null })
  mockInsertSingle.mockResolvedValue({ data: { id: 'just-new' }, error: null })
}

describe('registerExcuse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(reads).forEach((fn) => fn.mockReset())
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    arrangeEligibleAbsence()
  })

  it('rejects anyone who is not an admin, without touching the database', async () => {
    mockCheckAdmin.mockResolvedValue(false)

    const result = await registerExcuse({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: REASON,
      attachmentPath: PATH,
    })

    expect(result.success).toBe(false)
    expect(reads.profiles).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects an attachment that does not live under the student/session prefix', async () => {
    const result = await registerExcuse({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: REASON,
      attachmentPath: `other-student/session-1/${FILE}`,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/adjunto/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a session the student actually attended', async () => {
    reads.attendances.mockResolvedValue({ data: { id: 'att-1' } })

    const result = await registerExcuse({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: REASON,
      attachmentPath: PATH,
    })

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a student who is not enrolled in the subject of that session', async () => {
    reads.enrollments.mockResolvedValue({ data: null })

    const result = await registerExcuse({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: REASON,
      attachmentPath: PATH,
    })

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects an absence that already has an approved justification', async () => {
    reads.absence_justifications.mockResolvedValue({ data: { id: 'j-1', status: 'APPROVED' } })

    const result = await registerExcuse({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: REASON,
      attachmentPath: PATH,
    })

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects when the file was never uploaded to storage', async () => {
    mockStorageList.mockResolvedValue({ data: [], error: null })

    const result = await registerExcuse({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: REASON,
      attachmentPath: PATH,
    })

    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('creates an already-approved justification attributed to the admin and audits it', async () => {
    const result = await registerExcuse({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: REASON,
      attachmentPath: PATH,
    })

    expect(result.success).toBe(true)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 'student-1',
        session_id: 'session-1',
        // subject_id is derived from the session, never taken from the client
        subject_id: 'subject-1',
        status: 'APPROVED',
        reviewed_by: 'admin-1',
        attachment_path: PATH,
      })
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'justification.register', actorId: 'admin-1' })
    )
  })

  it('resolves a pending justification the student had already sent instead of duplicating it', async () => {
    reads.absence_justifications.mockResolvedValue({ data: { id: 'j-1', status: 'PENDING' } })
    mockUpdateSelect.mockResolvedValue({ data: [{ id: 'j-1' }], error: null })

    const result = await registerExcuse({
      studentId: 'student-1',
      sessionId: 'session-1',
      reason: REASON,
      attachmentPath: PATH,
    })

    expect(result.success).toBe(true)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED', reviewed_by: 'admin-1' })
    )
  })
})

describe('createExcuseUploadUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(reads).forEach((fn) => fn.mockReset())
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    arrangeEligibleAbsence()
    mockSignedUpload.mockResolvedValue({
      data: { signedUrl: 'https://x', token: 't', path: PATH },
      error: null,
    })
  })

  it('refuses a disallowed file type before signing anything', async () => {
    const result = await createExcuseUploadUrl({
      studentId: 'student-1',
      sessionId: 'session-1',
      fileName: 'virus.exe',
      contentType: 'application/x-msdownload',
      size: 1000,
    })

    expect(result.success).toBe(false)
    expect(mockSignedUpload).not.toHaveBeenCalled()
  })

  it('refuses files above 5MB', async () => {
    const result = await createExcuseUploadUrl({
      studentId: 'student-1',
      sessionId: 'session-1',
      fileName: 'constancia.pdf',
      contentType: 'application/pdf',
      size: 6 * 1024 * 1024,
    })

    expect(result.success).toBe(false)
    expect(mockSignedUpload).not.toHaveBeenCalled()
  })

  it('signs an upload under the student prefix for an eligible absence', async () => {
    const result = await createExcuseUploadUrl({
      studentId: 'student-1',
      sessionId: 'session-1',
      fileName: 'constancia.pdf',
      contentType: 'application/pdf',
      size: 2000,
    })

    expect(result.success).toBe(true)
    expect(mockSignedUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^student-1\/session-1\/[0-9a-f-]{36}\.pdf$/)
    )
  })
})
