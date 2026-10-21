import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from './route'

const deleteLt = vi.fn()
const countResult = vi.fn()

// Minimal chainable fake of the supabase-js query builder used by the route.
function makeAdmin() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'rate_limits') {
        return { delete: vi.fn(() => ({ lt: deleteLt })) }
      }
      const result = countResult(table)
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gt: vi.fn(() => chain),
        then: (resolve: (v: unknown) => unknown) => resolve(result),
      }
      return chain
    }),
  }
}

vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: vi.fn(() => makeAdmin()),
}))

function request(auth?: string) {
  return new Request('https://qrasist.vercel.app/api/cron/maintenance', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('GET /api/cron/maintenance', () => {
  const original = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'secret-123'
    deleteLt.mockReset()
    countResult.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env.CRON_SECRET = original
    vi.restoreAllMocks()
  })

  it('rejects requests without the cron secret', async () => {
    const res = await GET(request())
    expect(res.status).toBe(401)
    expect(deleteLt).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = await GET(request('Bearer nope'))
    expect(res.status).toBe(401)
  })

  it('rejects everything when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(request('Bearer undefined'))
    expect(res.status).toBe(401)
  })

  it('cleans expired rate-limit windows and reads counts', async () => {
    deleteLt.mockResolvedValue({ count: 7, error: null })
    countResult.mockImplementation((table: string) => ({
      count: table === 'subjects' ? 12 : 1,
      error: null,
    }))

    const res = await GET(request('Bearer secret-123'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      ok: true,
      rateLimitsDeleted: 7,
      openSessions: 1,
      pendingJustifications: 1,
      activeSubjects: 12,
    })
    const cutoff = new Date(deleteLt.mock.calls[0][1]).getTime()
    expect(deleteLt.mock.calls[0][0]).toBe('window_start')
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000)
  })

  it('answers 503 when the database fails', async () => {
    deleteLt.mockResolvedValue({ count: null, error: { message: 'down' } })
    const res = await GET(request('Bearer secret-123'))
    expect(res.status).toBe(503)
  })
})
