import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSession } from './session'

const mockGetUser = vi.fn()
const mockSingle = vi.fn()

function chain() {
  const c: Record<string, unknown> = {}
  for (const method of ['select', 'insert', 'eq']) {
    c[method] = vi.fn(() => c)
  }
  c.single = mockSingle
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => chain()),
  })),
}))

describe('createSession', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockSingle.mockReset()
  })

  it('rejects a negative duration without touching the database', async () => {
    const result = await createSession('subject-1', -5)

    expect(result.success).toBe(false)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('rejects a duration above the 180 minute cap', async () => {
    const result = await createSession('subject-1', 500)

    expect(result.success).toBe(false)
  })

  it('rejects a non-finite duration', async () => {
    const result = await createSession('subject-1', NaN)

    expect(result.success).toBe(false)
  })

  it('rejects when the caller does not own the subject', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockSingle.mockResolvedValueOnce({ data: null }) // ownership check fails

    const result = await createSession('subject-1')

    expect(result.success).toBe(false)
  })

  it('creates a session with the default 15 minute duration for the owning professor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'subject-1' } }) // ownership check
      .mockResolvedValueOnce({
        data: { id: 'session-1', qr_token: 'abc', expires_at: '2026-01-01T00:15:00Z' },
        error: null,
      }) // insert

    const result = await createSession('subject-1')

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
  })

  describe('modality and makeup reason', () => {
    it('rejects a makeup session with no reason at all, without touching the database', async () => {
      const result = await createSession('subject-1', 15, undefined, 20, { isMakeup: true })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/motivo/i)
      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('rejects a makeup session whose reason is below the minimum length', async () => {
      const result = await createSession('subject-1', 15, undefined, 20, {
        isMakeup: true,
        makeupReason: 'abc',
      })

      expect(result.success).toBe(false)
      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('does not require a reason when the session is not a makeup', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
      mockSingle.mockResolvedValueOnce({ data: { id: 'subject-1' } }).mockResolvedValueOnce({
        data: { id: 'session-1', qr_token: 'abc', expires_at: '2026-01-01T00:15:00Z' },
        error: null,
      })

      const result = await createSession('subject-1', 15, undefined, 20, {
        modality: 'VIRTUAL',
        isMakeup: false,
      })

      expect(result.success).toBe(true)
    })

    it('accepts a makeup session once the reason meets the minimum length', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
      mockSingle.mockResolvedValueOnce({ data: { id: 'subject-1' } }).mockResolvedValueOnce({
        data: { id: 'session-1', qr_token: 'abc', expires_at: '2026-01-01T00:15:00Z' },
        error: null,
      })

      const result = await createSession('subject-1', 15, undefined, 20, {
        modality: 'PRESENCIAL',
        isMakeup: true,
        makeupReason: 'Clase reprogramada por paro',
      })

      expect(result.success).toBe(true)
    })
  })
})
