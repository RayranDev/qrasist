'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { z } from 'zod'

const policySchema = z.object({
  absenceRuleType: z.enum(['PERCENTAGE', 'FIXED_COUNT']).default('PERCENTAGE'),
  maxAbsencePercentage: z.coerce.number().int().min(1).max(100).default(20),
  maxAbsenceCount: z.coerce.number().int().min(1).max(50).optional().nullable(),
  totalPlannedSessions: z.coerce.number().int().min(1).max(100).default(16),
  applyToAllActiveSubjects: z.boolean().default(false),
})

export type GlobalAbsencePolicyInput = z.infer<typeof policySchema>

export async function updateGlobalAbsencePolicy(rawInput: unknown) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const parsed = policySchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Parámetros de política inválidos',
    }
  }

  const {
    absenceRuleType,
    maxAbsencePercentage,
    maxAbsenceCount,
    totalPlannedSessions,
    applyToAllActiveSubjects,
  } = parsed.data

  if (applyToAllActiveSubjects) {
    const updatePayload: Record<string, unknown> = {
      absence_rule_type: absenceRuleType,
      max_absence_percentage: maxAbsencePercentage,
      total_planned_sessions: totalPlannedSessions,
      max_absence_count: absenceRuleType === 'FIXED_COUNT' ? maxAbsenceCount || 4 : null,
    }

    const { error: batchError, count } = await supabase
      .from('subjects')
      .update(updatePayload, { count: 'exact' })
      .eq('is_active', true)

    if (batchError) {
      return { success: false, error: 'Error al aplicar política a las materias' }
    }

    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/subjects')
    return { success: true, countUpdated: count ?? 0 }
  }

  revalidatePath('/admin/dashboard')
  return { success: true, countUpdated: 0 }
}
