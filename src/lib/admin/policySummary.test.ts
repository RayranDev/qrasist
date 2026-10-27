import { describe, it, expect } from 'vitest'
import { buildCurrentPolicySummary } from './policySummary'

const base = {
  ruleType: 'PERCENTAGE' as const,
  percentage: 20,
  count: 4,
  plannedSessions: 16,
  lateAfterMinutes: 15,
  latesPerAbsence: null,
}

describe('buildCurrentPolicySummary', () => {
  it('describes a percentage policy with lateness tracking', () => {
    expect(buildCurrentPolicySummary(base)).toBe(
      'Vigente: 20% de inasistencias · 16 sesiones · tardanza a los 15 min'
    )
  })

  it('describes a fixed-count policy', () => {
    expect(buildCurrentPolicySummary({ ...base, ruleType: 'FIXED_COUNT', count: 4 })).toBe(
      'Vigente: máximo 4 inasistencias · 16 sesiones · tardanza a los 15 min'
    )
    expect(buildCurrentPolicySummary({ ...base, ruleType: 'FIXED_COUNT', count: 1 })).toContain(
      'máximo 1 inasistencia ·'
    )
  })

  it('says lateness tracking is disabled when the tolerance is empty', () => {
    expect(buildCurrentPolicySummary({ ...base, lateAfterMinutes: null, latesPerAbsence: 3 })).toBe(
      'Vigente: 20% de inasistencias · 16 sesiones · sin seguimiento de tardanzas'
    )
  })

  it('includes the lateness-to-absence conversion when set', () => {
    expect(buildCurrentPolicySummary({ ...base, latesPerAbsence: 3 })).toBe(
      'Vigente: 20% de inasistencias · 16 sesiones · tardanza a los 15 min · 3 tardanzas suman 1 falta'
    )
    expect(buildCurrentPolicySummary({ ...base, latesPerAbsence: 1 })).toContain(
      '1 tardanza suma 1 falta'
    )
  })

  it('uses the singular for a single planned session', () => {
    expect(buildCurrentPolicySummary({ ...base, plannedSessions: 1 })).toContain('1 sesión ·')
  })
})
