import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateAppSettings } from './appSettings'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockLogAudit = vi.fn()
const mockUpsert = vi.fn()
const mockRevalidate = vi.fn()

// Current row of app_settings as the DB returns it.
const currentRow = {
  registration_window_minutes: 30,
  default_class_minutes: 120,
  qr_rotation_seconds: 20,
  late_after_minutes: 20,
  lates_per_absence: null,
  absence_rule_type: 'PERCENTAGE',
  max_absence_percentage: 20,
  max_absence_count: null,
}

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
}))
vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidate(...args),
}))
vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'app_settings') throw new Error(`unexpected admin table: ${table}`)
      return { upsert: async (payload: unknown) => mockUpsert(payload) }
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'app_settings') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: currentRow }),
        }
        return chain
      }
      if (table === 'subjects') {
        // Two active-subject counts: policy_override = false (inheriting) and true (custom).
        let override: boolean | undefined
        const chain = {
          select: () => chain,
          eq: (column: string, value: unknown) => {
            if (column === 'policy_override') override = value as boolean
            return chain
          },
          then: (resolve: (v: { count: number }) => void) => resolve({ count: override ? 3 : 90 }),
        }
        return chain
      }
      throw new Error(`unexpected table: ${table}`)
    },
  })),
}))

const baseInput = {
  registrationWindowMinutes: 30,
  defaultClassMinutes: 120,
  qrRotationSeconds: 20,
  lateAfterMinutes: 20,
  latesPerAbsence: null,
  absenceRuleType: 'PERCENTAGE',
  maxAbsencePercentage: 20,
  maxAbsenceCount: null,
}

describe('updateAppSettings (global attendance policy)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('refuses non-admins without writing anything', async () => {
    mockCheckAdmin.mockResolvedValue(false)
    const result = await updateAppSettings({
      ...baseInput,
      lateAfterMinutes: 25,
      reason: 'Acuerdo',
    })
    expect(result).toEqual({ success: false, error: 'No autorizado' })
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '   ', 'abc'])('rejects a change with reason %j', async (reason) => {
    const result = await updateAppSettings({ ...baseInput, lateAfterMinutes: 25, reason })
    expect(result.success).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('writes and audits every changed field with before, after and the trimmed reason', async () => {
    const result = await updateAppSettings({
      ...baseInput,
      lateAfterMinutes: 25,
      latesPerAbsence: 3,
      reason: '  Acta de coordinación 12  ',
    })

    expect(result).toEqual({ success: true, changed: true, inheritingCount: 90, customCount: 3 })
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        late_after_minutes: 25,
        lates_per_absence: 3,
        absence_rule_type: 'PERCENTAGE',
        updated_by: 'admin-1',
      })
    )
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledWith({
      actorId: 'admin-1',
      action: 'settings.update_attendance',
      entityType: 'app_settings',
      details: {
        changes: {
          late_after_minutes: { before: 20, after: 25 },
          lates_per_absence: { before: null, after: 3 },
        },
        reason: 'Acta de coordinación 12',
      },
    })
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/dashboard')
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/subjects')
    expect(mockRevalidate).toHaveBeenCalledWith('/professor/subjects')
  })

  it('records turning tracking off (null) and a timing change in the same audit row', async () => {
    await updateAppSettings({
      ...baseInput,
      registrationWindowMinutes: 40,
      lateAfterMinutes: null,
      reason: 'Se suspende el seguimiento',
    })
    expect(mockLogAudit.mock.calls[0][0].details.changes).toEqual({
      registration_window_minutes: { before: 30, after: 40 },
      late_after_minutes: { before: 20, after: null },
    })
  })

  it('audits a QR rotation change with before, after and the reason, and writes it', async () => {
    const result = await updateAppSettings({
      ...baseInput,
      qrRotationSeconds: 30,
      reason: 'Acuerdo de la reunión',
    })

    expect(result).toMatchObject({ success: true, changed: true })
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ qr_rotation_seconds: 30 }))
    expect(mockLogAudit.mock.calls[0][0].details).toEqual({
      changes: { qr_rotation_seconds: { before: 20, after: 30 } },
      reason: 'Acuerdo de la reunión',
    })
  })

  it.each([9, 61, 20.5, 'x'])(
    'rejects QR rotation %s before writing',
    async (qrRotationSeconds) => {
      const result = await updateAppSettings({ ...baseInput, qrRotationSeconds, reason: 'Acuerdo' })
      expect(result.success).toBe(false)
      expect(mockUpsert).not.toHaveBeenCalled()
    }
  )

  it('skips the write and the audit when nothing changed, even without a reason', async () => {
    const result = await updateAppSettings(baseInput)
    expect(result).toEqual({ success: true, changed: false, inheritingCount: 90, customCount: 3 })
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('does not audit when the write fails', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'boom' } })
    const result = await updateAppSettings({
      ...baseInput,
      lateAfterMinutes: 25,
      reason: 'Acuerdo',
    })
    expect(result).toEqual({ success: false, error: 'No se pudo guardar la configuración.' })
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it.each([
    [{ lateAfterMinutes: 0 }],
    [{ lateAfterMinutes: 181 }],
    [{ latesPerAbsence: 11 }],
    [{ absenceRuleType: 'WEEKLY' }],
    [{ maxAbsencePercentage: 101 }],
    [{ absenceRuleType: 'FIXED_COUNT', maxAbsenceCount: null }],
  ])('rejects invalid policy %j before writing', async (override) => {
    const result = await updateAppSettings({ ...baseInput, ...override, reason: 'Acuerdo' })
    expect(result.success).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
