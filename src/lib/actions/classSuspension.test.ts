import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { suspendClass, unsuspendClass } from './classSuspension'

const mockGetUser = vi.fn()
const mockCheckAdmin = vi.fn()
const mockResolveRole = vi.fn()
const mockAuthorizeEdit = vi.fn()
const mockLogAudit = vi.fn()

// Results by table; each test overrides what it needs. `list` is what an
// awaited query resolves to, `single` what .single()/.maybeSingle() return.
interface TableResult {
  list?: unknown
  single?: unknown
}
const userResults: Record<string, TableResult> = {}
const adminResults: Record<string, TableResult> = {}
const adminWrites: { table: string; op: 'insert' | 'update'; values: Record<string, unknown> }[] =
  []

/** Chainable, thenable stand-in for a PostgREST builder. */
function builder(
  result: () => TableResult,
  onWrite?: (op: 'insert' | 'update', values: Record<string, unknown>) => void
) {
  const b: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'gte', 'lte', 'is', 'not', 'limit']) {
    b[method] = vi.fn(() => b)
  }
  b.insert = vi.fn((values: Record<string, unknown>) => {
    onWrite?.('insert', values)
    return b
  })
  b.update = vi.fn((values: Record<string, unknown>) => {
    onWrite?.('update', values)
    return b
  })
  b.maybeSingle = vi.fn(async () => result().single ?? { data: null, error: null })
  b.single = vi.fn(async () => result().single ?? { data: null, error: null })
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result().list ?? { data: [], error: null }).then(resolve, reject)
  return b
}

vi.mock('./authGuards', () => ({
  checkAdmin: (...args: unknown[]) => mockCheckAdmin(...args),
  resolveSubjectEditorRole: (...args: unknown[]) => mockResolveRole(...args),
}))
vi.mock('./attendanceEditGuard', () => ({
  authorizeAttendanceEdit: (...args: unknown[]) => mockAuthorizeEdit(...args),
}))
vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => builder(() => userResults[table] ?? {})),
  })),
}))
vi.mock('@/lib/supabase/adminClient', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) =>
      builder(
        () => adminResults[table] ?? {},
        (op, values) => adminWrites.push({ table, op, values })
      )
    ),
  }),
}))

// Monday 2026-03-02, 08:20 in Bogota
const NOW = new Date('2026-03-02T13:20:00Z')

const openSession = {
  id: 'session-1',
  subject_id: 'subject-1',
  date: '2026-03-02T13:00:00Z',
  class_ends_at: '2026-03-02T15:00:00Z',
  expires_at: '2026-03-02T13:05:00Z',
  is_active: true,
  suspended_at: null,
}

function resetState() {
  for (const key of Object.keys(userResults)) delete userResults[key]
  for (const key of Object.keys(adminResults)) delete adminResults[key]
  adminWrites.length = 0
}

describe('suspendClass', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
    resetState()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'prof-1' } } })
    mockCheckAdmin.mockResolvedValue(false)
    mockAuthorizeEdit.mockResolvedValue({ ok: true, role: 'PROFESSOR' })
    mockResolveRole.mockResolvedValue('PROFESSOR')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requires a reason of at least 5 characters before touching anything', async () => {
    const result = await suspendClass({ sessionId: 'session-1', reason: ' no ' })

    expect(result.success).toBe(false)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('requires an authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await suspendClass({ sessionId: 'session-1', reason: 'Corte de energía' })

    expect(result.success).toBe(false)
    expect(adminWrites).toHaveLength(0)
  })

  describe('existing session', () => {
    beforeEach(() => {
      userResults.sessions = { single: { data: openSession } }
      adminResults.sessions = { single: { data: { id: 'session-1' }, error: null } }
      adminResults.attendances = { list: { count: 3, error: null } }
    })

    it('stores the class as not held, closes the QR and audits the reason', async () => {
      const result = await suspendClass({
        sessionId: 'session-1',
        reason: '  Corte de energía en el edificio  ',
      })

      expect(result).toEqual({ success: true, sessionId: 'session-1' })
      const update = adminWrites.find((w) => w.table === 'sessions' && w.op === 'update')
      expect(update?.values).toMatchObject({
        is_active: false,
        suspended_by: 'prof-1',
        suspension_reason: 'Corte de energía en el edificio',
        qr_token: null,
        previous_qr_token: null,
      })
      expect(update?.values.suspended_at).toBe(NOW.toISOString())
      // the registration window had already closed: expires_at is left alone
      expect(update?.values).not.toHaveProperty('expires_at')
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'session.suspend',
          actorId: 'prof-1',
          entityId: 'session-1',
          details: expect.objectContaining({
            mode: 'existing_session',
            reason: 'Corte de energía en el edificio',
            attendances_kept: 3,
          }),
        })
      )
    })

    it('pulls expires_at forward when the registration window is still open', async () => {
      userResults.sessions = {
        single: { data: { ...openSession, expires_at: '2026-03-02T13:40:00Z' } },
      }

      await suspendClass({ sessionId: 'session-1', reason: 'Corte de energía' })

      const update = adminWrites.find((w) => w.op === 'update')
      expect(update?.values.expires_at).toBe(NOW.toISOString())
    })

    it('rejects a professor once the class is over (edit window guard)', async () => {
      mockAuthorizeEdit.mockResolvedValue({
        ok: false,
        code: 'CLASS_ENDED',
        error: 'Solo coordinación puede modificar asistencias de clases pasadas.',
      })

      const result = await suspendClass({ sessionId: 'session-1', reason: 'Corte de energía' })

      expect(result.success).toBe(false)
      expect(adminWrites).toHaveLength(0)
    })

    it('rejects a class that is already suspended', async () => {
      userResults.sessions = {
        single: {
          data: { ...openSession, is_active: false, suspended_at: '2026-03-02T13:10:00Z' },
        },
      }

      const result = await suspendClass({ sessionId: 'session-1', reason: 'Corte de energía' })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/ya está suspendida/i)
      expect(adminWrites).toHaveLength(0)
    })

    it('rejects an archived class instead of silently suspending it', async () => {
      userResults.sessions = { single: { data: { ...openSession, is_active: false } } }

      const result = await suspendClass({ sessionId: 'session-1', reason: 'Corte de energía' })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/archivada/i)
    })

    it('reports a lost race (another suspension won) without auditing', async () => {
      adminResults.sessions = { single: { data: null, error: null } }

      const result = await suspendClass({ sessionId: 'session-1', reason: 'Corte de energía' })

      expect(result.success).toBe(false)
      expect(mockLogAudit).not.toHaveBeenCalled()
    })
  })

  describe('scheduled day without a session', () => {
    beforeEach(() => {
      userResults.subjects = {
        single: {
          data: {
            id: 'subject-1',
            is_active: true,
            period: { start_date: '2026-01-26', end_date: '2026-06-06' },
          },
        },
      }
      userResults.subject_schedules = {
        list: {
          data: [
            { day_of_week: 1, start_time: '08:00:00', end_time: '10:00:00', modality: 'VIRTUAL' },
          ],
        },
      }
      // no same-day session; the insert returns the placeholder row
      adminResults.sessions = {
        list: { data: [], error: null },
        single: { data: { id: 'placeholder-1' }, error: null },
      }
    })

    it('lets the professor suspend today and covers the day with a placeholder', async () => {
      const result = await suspendClass({ subjectId: 'subject-1', reason: 'Corte de energía' })

      expect(result).toEqual({ success: true, sessionId: 'placeholder-1' })
      const insert = adminWrites.find((w) => w.op === 'insert')
      expect(insert?.values).toMatchObject({
        subject_id: 'subject-1',
        is_active: false,
        qr_token: null,
        suspended_by: 'prof-1',
        suspension_reason: 'Corte de energía',
        modality: 'VIRTUAL',
        // Monday 08:00-10:00 block, Bogota
        date: '2026-03-02T13:00:00.000Z',
        class_ends_at: '2026-03-02T15:00:00.000Z',
      })
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'session.suspend',
          details: expect.objectContaining({ mode: 'scheduled_day', class_date: '2026-03-02' }),
        })
      )
    })

    it('refuses a professor once the last block of today has ended (the omission path is justification)', async () => {
      userResults.subject_schedules = {
        list: {
          data: [{ day_of_week: 1, start_time: '06:00', end_time: '08:00', modality: 'VIRTUAL' }],
        },
      }

      const result = await suspendClass({ subjectId: 'subject-1', reason: 'Corte de energía' })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/ya terminó/i)
      expect(adminWrites).toHaveLength(0)
    })

    it('refuses a professor when the schedule has no class today', async () => {
      userResults.subject_schedules = {
        list: {
          data: [{ day_of_week: 3, start_time: '08:00', end_time: '10:00', modality: 'VIRTUAL' }],
        },
      }

      const result = await suspendClass({ subjectId: 'subject-1', reason: 'Corte de energía' })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/no hay clase/i)
      expect(adminWrites).toHaveLength(0)
    })

    it('lets an admin suspend a past scheduled day regardless of the clock', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
      mockResolveRole.mockResolvedValue('ADMIN')
      userResults.subject_schedules = { list: { data: [] } }

      const result = await suspendClass({
        subjectId: 'subject-1',
        date: '2026-02-23',
        reason: 'Paro de transporte',
      })

      expect(result.success).toBe(true)
    })

    it('does not let a professor suspend another day', async () => {
      const result = await suspendClass({
        subjectId: 'subject-1',
        date: '2026-03-09',
        reason: 'Corte de energía',
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/hoy/i)
      expect(adminWrites).toHaveLength(0)
    })

    it('rejects a user with no role on the subject', async () => {
      mockResolveRole.mockResolvedValue(null)

      const result = await suspendClass({ subjectId: 'subject-1', reason: 'Corte de energía' })

      expect(result.success).toBe(false)
      expect(adminWrites).toHaveLength(0)
    })

    it('refuses when the day already has a held class and points to suspending it', async () => {
      adminResults.sessions = { list: { data: [{ id: 'real', suspended_at: null }], error: null } }

      const result = await suspendClass({ subjectId: 'subject-1', reason: 'Corte de energía' })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/suspéndela desde su sesión/i)
      expect(adminWrites).toHaveLength(0)
    })

    it('refuses when the day is already suspended', async () => {
      adminResults.sessions = {
        list: { data: [{ id: 'old', suspended_at: '2026-03-02T12:00:00Z' }], error: null },
      }

      const result = await suspendClass({ subjectId: 'subject-1', reason: 'Corte de energía' })

      expect(result.error).toMatch(/ya está suspendida/i)
    })

    it('lets an admin pick any date inside the period but nothing outside it', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
      mockResolveRole.mockResolvedValue('ADMIN')

      const outside = await suspendClass({
        subjectId: 'subject-1',
        date: '2026-07-01',
        reason: 'Paro de transporte',
      })
      expect(outside.success).toBe(false)
      expect(outside.error).toMatch(/fuera del período/i)

      const inside = await suspendClass({
        subjectId: 'subject-1',
        date: '2026-03-16',
        reason: 'Paro de transporte',
      })
      expect(inside.success).toBe(true)
      const insert = adminWrites.find((w) => w.op === 'insert')
      expect(insert?.values).toMatchObject({ date: '2026-03-16T13:00:00.000Z' })
    })
  })
})

describe('unsuspendClass', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
    resetState()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue(true)
    userResults.sessions = {
      single: {
        data: {
          id: 'session-1',
          subject_id: 'subject-1',
          date: '2026-03-02T13:00:00Z',
          suspended_at: '2026-03-02T13:10:00Z',
          suspension_reason: 'Corte de energía',
        },
      },
    }
    adminResults.sessions = { list: { data: [], error: null } }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is admin-only', async () => {
    mockCheckAdmin.mockResolvedValue(false)

    const result = await unsuspendClass('session-1')

    expect(result.success).toBe(false)
    expect(adminWrites).toHaveLength(0)
  })

  it('clears the suspension and re-activates the class in a single update', async () => {
    const result = await unsuspendClass('session-1')

    expect(result.success).toBe(true)
    const update = adminWrites.find((w) => w.op === 'update')
    expect(update?.values).toEqual({
      is_active: true,
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null,
    })
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session.unsuspend',
        details: expect.objectContaining({ suspension_reason: 'Corte de energía' }),
      })
    )
  })

  it('rejects a class that is not suspended', async () => {
    userResults.sessions = {
      single: {
        data: { id: 'session-1', subject_id: 'subject-1', date: '2026-03-02T13:00:00Z' },
      },
    }

    const result = await unsuspendClass('session-1')

    expect(result.success).toBe(false)
    expect(adminWrites).toHaveLength(0)
  })

  it('refuses when another held class exists that day', async () => {
    adminResults.sessions = { list: { data: [{ id: 'other' }], error: null } }

    const result = await unsuspendClass('session-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/otra clase/i)
    expect(adminWrites).toHaveLength(0)
  })
})
