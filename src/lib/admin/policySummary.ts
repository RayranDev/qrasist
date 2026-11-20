/**
 * One-line, human-readable description of the global attendance policy, shown
 * read-only in the subject forms so the admin sees which values a subject
 * inherits when it does not use a custom policy.
 */
import { pluralize } from '@/lib/utils/plural'
import type { GlobalPolicy } from '@/lib/settings/globalPolicy'

export function buildGlobalPolicySummary(policy: GlobalPolicy): string {
  const parts: string[] = []

  parts.push(
    policy.absenceRuleType === 'PERCENTAGE'
      ? `${policy.maxAbsencePercentage}% de inasistencias`
      : `máximo ${policy.maxAbsenceCount ?? '?'} ${pluralize(policy.maxAbsenceCount ?? 0, 'inasistencia')}`
  )

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

  return `Política global: ${parts.join(' · ')}`
}
