import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizeAttendanceEdit } from './attendanceEditGuard'

const mockResolveRole = vi.fn()
const mockGetAppSettings = vi.fn()

vi.mock('./authGuards', () => ({
  resolveSubjectEditorRole: (...args: unknown[]) => mockResolveRole(...args),
}))

vi.mock('@/lib/settings/appSettings', () => ({
  getAppSettings: (...args: unknown[]) => mockGetAppSettings(...args),
}))

const supabase = {} as SupabaseClient
const session = {
  subject_id: 'subject-1',
  date: '2026-03-02T13:00:00Z',
  class_ends_at: '2026-03-02T15:00:00Z',
}

describe('authorizeAttendanceEdit', () => {
  beforeEach(() => {
    mockResolveRole.mockReset()
    mockGetAppSettings.mockReset()
    mockGetAppSettings.mockResolvedValue({ registrationWindowMinutes: 5, defaultClassMinutes: 120 })
  })

  it('denies someone who is neither admin nor the subject professor', async () => {
    mockResolveRole.mockResolvedValue(null)

    const result = await authorizeAttendanceEdit(supabase, 'x', session)

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })

  it('lets the owning professor edit while the class is in progress', async () => {
    mockResolveRole.mockResolvedValue('PROFESSOR')

    const result = await authorizeAttendanceEdit(
      supabase,
      'prof',
      session,
      new Date('2026-03-02T14:30:00Z')
    )

    expect(result).toEqual({ ok: true, role: 'PROFESSOR' })
  })

  it('rejects the owning professor after class_ends_at', async () => {
    mockResolveRole.mockResolvedValue('PROFESSOR')

    const result = await authorizeAttendanceEdit(
      supabase,
      'prof',
      session,
      new Date('2026-03-02T15:00:01Z')
    )

    expect(result).toMatchObject({ ok: false, code: 'CLASS_ENDED' })
    expect((result as { error: string }).error).toMatch(/coordinación/i)
  })

  it('uses date + default class minutes for legacy sessions without class_ends_at', async () => {
    mockResolveRole.mockResolvedValue('PROFESSOR')
    const legacy = { subject_id: 'subject-1', date: '2026-03-02T13:00:00Z', class_ends_at: null }

    const during = await authorizeAttendanceEdit(
      supabase,
      'prof',
      legacy,
      new Date('2026-03-02T14:59:00Z')
    )
    const after = await authorizeAttendanceEdit(
      supabase,
      'prof',
      legacy,
      new Date('2026-03-02T15:01:00Z')
    )

    expect(during.ok).toBe(true)
    expect(after.ok).toBe(false)
  })

  it('always lets the admin edit, even long after the class, without reading settings', async () => {
    mockResolveRole.mockResolvedValue('ADMIN')

    const result = await authorizeAttendanceEdit(
      supabase,
      'admin',
      session,
      new Date('2027-01-01T00:00:00Z')
    )

    expect(result).toEqual({ ok: true, role: 'ADMIN' })
    expect(mockGetAppSettings).not.toHaveBeenCalled()
  })
})
