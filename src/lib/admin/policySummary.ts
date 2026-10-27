/**
 * One-line, human-readable description of the attendance policy currently in
 * effect, shown at the top of the global policy modal so the admin knows which
 * of the prefilled numbers are the values in force.
 */
import { pluralize } from '@/lib/utils/plural'

export interface PolicySummaryInput {
  ruleType: 'PERCENTAGE' | 'FIXED_COUNT'
  percentage: number
  count: number
  plannedSessions: number
  lateAfterMinutes: number | null
  latesPerAbsence: number | null
}

export function buildCurrentPolicySummary(policy: PolicySummaryInput): string {
  const parts: string[] = []

  parts.push(
    policy.ruleType === 'PERCENTAGE'
      ? `${policy.percentage}% de inasistencias`
      : `máximo ${policy.count} ${pluralize(policy.count, 'inasistencia')}`
  )
  parts.push(`${policy.plannedSessions} ${pluralize(policy.plannedSessions, 'sesión', 'sesiones')}`)

  if (policy.lateAfterMinutes === null) {
    parts.push('sin seguimiento de tardanzas')
  } else {
    parts.push(`tardanza a los ${policy.lateAfterMinutes} min`)
    if (policy.latesPerAbsence !== null) {
      parts.push(
        `${policy.latesPerAbsence} ${pluralize(policy.latesPerAbsence, 'tardanza')} ${pluralize(policy.latesPerAbsence, 'suma', 'suman')} 1 falta`
      )
    }
  }

  return `Vigente: ${parts.join(' · ')}`
}
