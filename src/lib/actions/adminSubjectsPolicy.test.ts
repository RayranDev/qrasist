import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSubject, updateSubject } from './adminSubjects'

interface CallEntry {
  table: string
  ops: string[]
  args: Record<string, unknown[]>
}

type Result = { data?: unknown; error?: unknown }

const calls: CallEntry[] = []
const mockGetUser = vi.fn()
const mockLogAudit = vi.fn()
const results = new Map<string, Result>()

function resolveResult(entry: CallEntry): Result {
  return results.get(`${entry.table}.${entry.ops[0]}`) ?? { data: null, error: null }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      const entry: CallEntry = { table, ops: [], args: {} }
      calls.push(entry)
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(resolveResult(entry)).then(resolve, reject)
            }
            return (...args: unknown[]) => {
              entry.ops.push(prop)
              entry.args[prop] = args
              return builder
            }
          },
        }
      )
      return builder
    },
  })),
}))
vi.mock('@/lib/supabase/adminClient', () => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit/auditLog', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a) }))

const GLOBAL_ROW = {
  late_after_minutes: 20,
  lates_per_absence: null,
  absence_rule_type: 'PERCENTAGE',
  max_absence_percentage: 20,
  max_absence_count: null,
}

const inheritingRow = { policy_override: false, ...GLOBAL_ROW }
const customRow = { policy_override: true, ...GLOBAL_ROW, late_after_minutes: 10 }

const base = { name: 'Cálculo I', code: 'CAL-1', professor_id: null, period_id: null }

const subjectWrite = (op: 'update' | 'insert') =>
  calls.find((c) => c.table === 'subjects' && c.ops[0] === op)?.args[op]?.[0] as
    Record<string, unknown> | undefined

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  results.clear()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  results.set('profiles.select', { data: { role: 'ADMIN' } })
  results.set('app_settings.select', { data: GLOBAL_ROW })
})

describe('updateSubject policy', () => {
  it('does not touch the policy columns or audit when no policy_mode is sent', async () => {
    const result = await updateSubject('s1', { ...base, total_planned_sessions: 16 })

    expect(result).toEqual({ success: true })
    const update = subjectWrite('update')!
    expect(update).not.toHaveProperty('policy_override')
    expect(update).not.toHaveProperty('late_after_minutes')
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('writes and audits nothing for the policy when an inheriting subject stays global', async () => {
    results.set('subjects.select', { data: inheritingRow })

    await updateSubject('s1', { ...base, policy_mode: 'global' })

    expect(subjectWrite('update')).not.toHaveProperty('policy_override')
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('switches to a custom policy: needs a reason, then audits override and changed values', async () => {
    results.set('subjects.select', { data: inheritingRow })
    const custom = {
      ...base,
      policy_mode: 'custom' as const,
      absence_rule_type: 'PERCENTAGE' as const,
      max_absence_percentage: 20,
      max_absence_count: null,
      late_after_minutes: 10,
      lates_per_absence: null,
    }

    const noReason = await updateSubject('s1', custom)
    expect(noReason.success).toBe(false)
    expect(subjectWrite('update')).toBeUndefined()
    expect(mockLogAudit).not.toHaveBeenCalled()

    const short = await updateSubject('s1', { ...custom, policy_reason: 'abc' })
    expect(short.success).toBe(false)

    const ok = await updateSubject('s1', {
      ...custom,
      policy_reason: ' Laboratorio con ingreso escalonado ',
    })
    expect(ok).toEqual({ success: true })
    expect(subjectWrite('update')).toMatchObject({
      policy_override: true,
      late_after_minutes: 10,
      absence_rule_type: 'PERCENTAGE',
    })
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledWith({
      actorId: 'admin-1',
      action: 'subject.update_policy',
      entityType: 'subject',
      entityId: 's1',
      subjectId: 's1',
      details: {
        changes: {
          policy_override: { before: false, after: true },
          late_after_minutes: { before: 20, after: 10 },
        },
        reason: 'Laboratorio con ingreso escalonado',
      },
    })
  })

  it('switches back to global: only clears the override (the trigger copies the values) and audits', async () => {
    results.set('subjects.select', { data: customRow })

    const noReason = await updateSubject('s1', { ...base, policy_mode: 'global' })
    expect(noReason.success).toBe(false)

    const ok = await updateSubject('s1', {
      ...base,
      policy_mode: 'global',
      policy_reason: 'Vuelve a la política global',
    })
    expect(ok).toEqual({ success: true })
    const update = subjectWrite('update')!
    expect(update.policy_override).toBe(false)
    expect(update).not.toHaveProperty('late_after_minutes')
    expect(mockLogAudit.mock.calls[0][0].details.changes).toEqual({
      policy_override: { before: true, after: false },
      late_after_minutes: { before: 10, after: 20 },
    })
  })

  it.each(['nope', '', null, 'GLOBAL'])('rejects an unknown policy_mode %j', async (mode) => {
    results.set('subjects.select', { data: inheritingRow })
    const result = await updateSubject('s1', {
      ...base,
      policy_mode: mode as unknown as 'global',
    })
    expect(result).toEqual({ success: false, error: 'Modo de política inválido.' })
    expect(subjectWrite('update')).toBeUndefined()
  })

  it('rejects an invalid custom policy before writing', async () => {
    results.set('subjects.select', { data: inheritingRow })
    const result = await updateSubject('s1', {
      ...base,
      policy_mode: 'custom',
      policy_reason: 'Acuerdo de reunión',
      absence_rule_type: 'FIXED_COUNT',
      max_absence_percentage: 20,
      max_absence_count: null,
      late_after_minutes: 20,
      lates_per_absence: null,
    })
    expect(result.success).toBe(false)
    expect(subjectWrite('update')).toBeUndefined()
  })

  it('does not audit when the update fails', async () => {
    results.set('subjects.select', { data: inheritingRow })
    results.set('subjects.update', { error: { code: 'XX000' } })

    const result = await updateSubject('s1', {
      ...base,
      policy_mode: 'custom',
      policy_reason: 'Acuerdo de reunión',
      absence_rule_type: 'PERCENTAGE',
      max_absence_percentage: 20,
      late_after_minutes: 5,
    })
    expect(result.success).toBe(false)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('refuses non-admins', async () => {
    results.set('profiles.select', { data: { role: 'PROFESSOR' } })
    const result = await updateSubject('s1', { ...base, policy_mode: 'global' })
    expect(result).toEqual({ success: false, error: 'No autorizado' })
    expect(subjectWrite('update')).toBeUndefined()
  })
})

describe('createSubject policy', () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData()
    fd.set('name', 'Física I')
    fd.set('code', 'fis-1')
    fd.set('total_planned_sessions', '16')
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
  }

  beforeEach(() => {
    results.set('subjects.insert', { data: { id: 'new-1' }, error: null })
  })

  it('creates an inheriting subject without sending any policy value or auditing', async () => {
    const result = await createSubject(form({ policy_mode: 'global' }))

    expect(result).toEqual({ success: true })
    const insert = subjectWrite('insert')!
    expect(insert.policy_override).toBe(false)
    expect(insert).not.toHaveProperty('late_after_minutes')
    expect(insert).not.toHaveProperty('absence_rule_type')
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it.each([{}, { policy_mode: '' }, { policy_mode: 'nope' }, { policy_mode: 'GLOBAL' }])(
    'rejects a missing or unknown policy_mode %j instead of treating it as global',
    async (fields) => {
      const result = await createSubject(form(fields as Record<string, string>))
      expect(result).toEqual({ success: false, error: 'Modo de política inválido.' })
      expect(subjectWrite('insert')).toBeUndefined()
    }
  )

  it('ignores a hidden fixed count under the percentage rule', async () => {
    const result = await createSubject(
      form({
        policy_mode: 'custom',
        policy_reason: 'Materia de laboratorio',
        absence_rule_type: 'PERCENTAGE',
        max_absence_percentage: '25',
        max_absence_count: '999',
        late_after_minutes: '10',
      })
    )
    expect(result).toEqual({ success: true })
    expect(subjectWrite('insert')).toMatchObject({ max_absence_count: null })
  })

  it('requires a reason for a custom policy', async () => {
    const result = await createSubject(
      form({
        policy_mode: 'custom',
        absence_rule_type: 'PERCENTAGE',
        max_absence_percentage: '25',
        late_after_minutes: '10',
      })
    )
    expect(result.success).toBe(false)
    expect(subjectWrite('insert')).toBeUndefined()
  })

  it('stores a custom policy and audits it against the global values', async () => {
    const result = await createSubject(
      form({
        policy_mode: 'custom',
        policy_reason: 'Materia de laboratorio',
        absence_rule_type: 'PERCENTAGE',
        max_absence_percentage: '25',
        max_absence_count: '',
        late_after_minutes: '10',
        lates_per_absence: '',
      })
    )

    expect(result).toEqual({ success: true })
    expect(subjectWrite('insert')).toMatchObject({
      policy_override: true,
      late_after_minutes: 10,
      max_absence_percentage: 25,
      max_absence_count: null,
      lates_per_absence: null,
    })
    expect(mockLogAudit).toHaveBeenCalledWith({
      actorId: 'admin-1',
      action: 'subject.update_policy',
      entityType: 'subject',
      entityId: 'new-1',
      subjectId: 'new-1',
      details: {
        changes: {
          policy_override: { before: false, after: true },
          max_absence_percentage: { before: 20, after: 25 },
          late_after_minutes: { before: 20, after: 10 },
        },
        reason: 'Materia de laboratorio',
        created: true,
      },
    })
  })
})
