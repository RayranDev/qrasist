import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_GLOBAL_POLICY,
  describeFieldChange,
  diffFields,
  getGlobalPolicy,
  parseChangeReason,
  parseGlobalPolicyInput,
  policyToColumns,
  readFieldChanges,
} from './globalPolicy'

const valid = {
  lateAfterMinutes: 20,
  latesPerAbsence: null,
  absenceRuleType: 'PERCENTAGE',
  maxAbsencePercentage: 20,
  maxAbsenceCount: null,
}

function clientReturning(data: unknown) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data }) }
  return { from: () => chain } as unknown as SupabaseClient
}

describe('parseGlobalPolicyInput', () => {
  it('accepts the default policy', () => {
    expect(parseGlobalPolicyInput(valid)).toEqual({
      ok: true,
      policy: { ...DEFAULT_GLOBAL_POLICY },
    })
  })

  it('treats empty strings as "no value" and coerces numeric strings (form input)', () => {
    const result = parseGlobalPolicyInput({
      lateAfterMinutes: '',
      latesPerAbsence: '3',
      absenceRuleType: 'FIXED_COUNT',
      maxAbsencePercentage: '25',
      maxAbsenceCount: '4',
    })
    expect(result).toEqual({
      ok: true,
      policy: {
        lateAfterMinutes: null,
        latesPerAbsence: 3,
        absenceRuleType: 'FIXED_COUNT',
        maxAbsencePercentage: 25,
        maxAbsenceCount: 4,
      },
    })
  })

  it('accepts the range edges', () => {
    expect(parseGlobalPolicyInput({ ...valid, lateAfterMinutes: 1, latesPerAbsence: 10 }).ok).toBe(
      true
    )
    expect(
      parseGlobalPolicyInput({ ...valid, lateAfterMinutes: 180, maxAbsencePercentage: 100 }).ok
    ).toBe(true)
  })

  it.each([
    { lateAfterMinutes: 0 },
    { lateAfterMinutes: 181 },
    { lateAfterMinutes: 2.5 },
    { lateAfterMinutes: 'abc' },
    { latesPerAbsence: 0 },
    { latesPerAbsence: 11 },
    { absenceRuleType: 'WEEKLY' },
    { absenceRuleType: undefined },
    { maxAbsencePercentage: 0 },
    { maxAbsencePercentage: 101 },
    { maxAbsenceCount: 0 },
    { maxAbsenceCount: 51 },
    { absenceRuleType: 'FIXED_COUNT', maxAbsenceCount: null },
  ])('rejects %j', (override) => {
    expect(parseGlobalPolicyInput({ ...valid, ...override }).ok).toBe(false)
  })

  it('rejects an empty payload', () => {
    expect(parseGlobalPolicyInput(undefined).ok).toBe(false)
  })
})

describe('parseChangeReason', () => {
  it('trims and accepts a reason of at least 5 characters', () => {
    expect(parseChangeReason('  Acuerdo  ')).toEqual({ ok: true, reason: 'Acuerdo' })
  })

  it.each([undefined, null, 42, '', '    ', 'abcd'])('rejects %j', (value) => {
    expect(parseChangeReason(value).ok).toBe(false)
  })

  it('rejects a reason over 500 characters', () => {
    expect(parseChangeReason('x'.repeat(501)).ok).toBe(false)
  })
})

describe('diffFields', () => {
  it('returns only the changed fields and treats null and undefined as equal', () => {
    expect(
      diffFields({ a: 1, b: null, c: 'x', d: 5 }, { a: 2, b: undefined, c: 'x', d: null })
    ).toEqual({ a: { before: 1, after: 2 }, d: { before: 5, after: null } })
  })

  it('is empty when nothing changed', () => {
    expect(
      diffFields(policyToColumns(DEFAULT_GLOBAL_POLICY), policyToColumns(DEFAULT_GLOBAL_POLICY))
    ).toEqual({})
  })
})

describe('describeFieldChange / readFieldChanges', () => {
  it('describes values in Spanish', () => {
    expect(describeFieldChange('late_after_minutes', { before: 20, after: null })).toBe(
      'tolerancia de tardanza: 20 min → sin seguimiento'
    )
    expect(
      describeFieldChange('absence_rule_type', { before: 'PERCENTAGE', after: 'FIXED_COUNT' })
    ).toBe('regla de faltas: porcentaje → cantidad fija')
    expect(describeFieldChange('policy_override', { before: false, after: true })).toBe(
      'política de la materia: global → personalizada'
    )
  })

  it('reads details.changes and ignores legacy or malformed shapes', () => {
    expect(readFieldChanges({ changes: { x: { before: 1, after: 2 }, bad: 3 } })).toEqual({
      x: { before: 1, after: 2 },
    })
    expect(readFieldChanges({ registration_window_minutes_before: 5 })).toBeUndefined()
    expect(readFieldChanges({ changes: [] })).toBeUndefined()
  })
})

describe('getGlobalPolicy', () => {
  it('maps the singleton row', async () => {
    const policy = await getGlobalPolicy(
      clientReturning({
        late_after_minutes: null,
        lates_per_absence: 3,
        absence_rule_type: 'FIXED_COUNT',
        max_absence_percentage: 20,
        max_absence_count: 4,
      })
    )
    expect(policy).toEqual({
      lateAfterMinutes: null,
      latesPerAbsence: 3,
      absenceRuleType: 'FIXED_COUNT',
      maxAbsencePercentage: 20,
      maxAbsenceCount: 4,
    })
  })

  it('falls back to the defaults when the row or columns are missing', async () => {
    expect(await getGlobalPolicy(clientReturning(null))).toEqual(DEFAULT_GLOBAL_POLICY)
  })
})
