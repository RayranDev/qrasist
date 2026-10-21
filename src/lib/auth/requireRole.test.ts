import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireRole, resolveRoleRedirect } from './requireRole'

const mockGetUser = vi.fn()
const mockProfile = vi.fn()
const mockRedirect = vi.fn((url: string) => {
  // Same contract as next/navigation: redirect() never returns.
  throw new Error(`NEXT_REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => {
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.single = vi.fn(async () => mockProfile())
      return c
    }),
  })),
}))

describe('resolveRoleRedirect', () => {
  it('lets an active user with an allowed role through', () => {
    expect(resolveRoleRedirect({ role: 'ADMIN', is_active: true }, ['ADMIN'])).toBeNull()
    expect(
      resolveRoleRedirect({ role: 'PROFESSOR', is_active: true }, ['PROFESSOR', 'ADMIN'])
    ).toBe(null)
  })

  it('sends a wrong role to /dashboard (which resolves each role home)', () => {
    expect(resolveRoleRedirect({ role: 'STUDENT', is_active: true }, ['ADMIN'])).toBe('/dashboard')
    expect(resolveRoleRedirect({ role: 'PROFESSOR', is_active: true }, ['ADMIN'])).toBe(
      '/dashboard'
    )
    expect(resolveRoleRedirect({ role: 'ADMIN', is_active: true }, ['PROFESSOR'])).toBe(
      '/dashboard'
    )
  })

  it('rejects deactivated accounts even when the stored role matches', () => {
    expect(resolveRoleRedirect({ role: 'ADMIN', is_active: false }, ['ADMIN'])).toBe('/dashboard')
    expect(resolveRoleRedirect({ role: 'ADMIN' }, ['ADMIN'])).toBe('/dashboard')
  })

  it('rejects a missing profile', () => {
    expect(resolveRoleRedirect(null, ['ADMIN'])).toBe('/dashboard')
    expect(resolveRoleRedirect(undefined, ['STUDENT'])).toBe('/dashboard')
  })
})

describe('requireRole', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockProfile.mockReset()
    mockRedirect.mockClear()
  })

  it('redirects anonymous visitors to /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(requireRole(['ADMIN'])).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mockProfile).not.toHaveBeenCalled()
  })

  it('keeps a STUDENT out of coordination screens', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
    mockProfile.mockResolvedValue({ data: { role: 'STUDENT', is_active: true } })

    await expect(requireRole(['ADMIN'])).rejects.toThrow('NEXT_REDIRECT:/dashboard')
  })

  it('keeps a PROFESSOR out of coordination screens', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockProfile.mockResolvedValue({ data: { role: 'PROFESSOR', is_active: true } })

    await expect(requireRole(['ADMIN'])).rejects.toThrow('NEXT_REDIRECT:/dashboard')
  })

  it('keeps a STUDENT out of professor screens', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
    mockProfile.mockResolvedValue({ data: { role: 'STUDENT', is_active: true } })

    await expect(requireRole(['PROFESSOR'])).rejects.toThrow('NEXT_REDIRECT:/dashboard')
  })

  it('returns the authenticated client, user and role when allowed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockProfile.mockResolvedValue({ data: { role: 'ADMIN', is_active: true } })

    const result = await requireRole(['PROFESSOR', 'ADMIN'])

    expect(result.user.id).toBe('admin-1')
    expect(result.role).toBe('ADMIN')
    expect(result.supabase).toBeDefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
