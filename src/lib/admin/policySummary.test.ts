import { describe, it, expect } from 'vitest'
import { buildGlobalPolicySummary } from './policySummary'
import type { GlobalPolicy } from '@/lib/settings/globalPolicy'

const base: GlobalPolicy = {
  lateAfterMinutes: 20,
  latesPerAbsence: null,
  absenceRuleType: 'PERCENTAGE',
  maxAbsencePercentage: 20,
  maxAbsenceCount: null,
}

describe('buildGlobalPolicySummary', () => {
  it('describes a percentage policy with lateness tracking', () => {
    expect(buildGlobalPolicySummary(base)).toBe(
      'Política global: 20% de inasistencias · tardanza a los 20 min'
    )
  })

  it('describes a fixed-count policy', () => {
    expect(
      buildGlobalPolicySummary({ ...base, absenceRuleType: 'FIXED_COUNT', maxAbsenceCount: 4 })
    ).toBe('Política global: máximo 4 inasistencias · tardanza a los 20 min')
    expect(
      buildGlobalPolicySummary({ ...base, absenceRuleType: 'FIXED_COUNT', maxAbsenceCount: 1 })
    ).toContain('máximo 1 inasistencia ·')
  })

  it('says lateness tracking is disabled when the tolerance is null', () => {
    expect(buildGlobalPolicySummary({ ...base, lateAfterMinutes: null, latesPerAbsence: 3 })).toBe(
      'Política global: 20% de inasistencias · sin seguimiento de tardanzas'
    )
  })

  it('includes the lateness-to-absence conversion when set', () => {
    expect(buildGlobalPolicySummary({ ...base, latesPerAbsence: 3 })).toBe(
      'Política global: 20% de inasistencias · tardanza a los 20 min · 3 tardanzas suman 1 falta'
    )
    expect(buildGlobalPolicySummary({ ...base, latesPerAbsence: 1 })).toContain(
      '1 tardanza suma 1 falta'
    )
  })
})
