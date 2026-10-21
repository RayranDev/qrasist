'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { logAudit } from '@/lib/audit/auditLog'
import { z } from 'zod'
import { buildPolicyCountChangedMessage } from '@/lib/admin/policyOverwrite'

const policySchema = z.object({
  absenceRuleType: z.enum(['PERCENTAGE', 'FIXED_COUNT']).default('PERCENTAGE'),
  maxAbsencePercentage: z.coerce.number().int().min(1).max(100).default(20),
  maxAbsenceCount: z.coerce.number().int().min(1).max(50).optional().nullable(),
  totalPlannedSessions: z.coerce.number().int().min(1).max(100).default(16),
  lateAfterMinutes: z.coerce.number().int().min(1).max(180).optional().nullable(),
  latesPerAbsence: z.coerce.number().int().min(1).max(10).optional().nullable(),
  applyToAllActiveSubjects: z.boolean().default(false),
  // Cantidad de materias activas que el coordinador vio y confirmó en el
  // modal. Obligatoria al aplicar en lote: si cambió desde entonces, no se
  // sobrescribe nada hasta que confirme de nuevo.
  confirmedSubjectsCount: z.number().int().min(0).optional(),
})

export type GlobalAbsencePolicyInput = z.infer<typeof policySchema>

async function countActiveSubjects(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { count, error } = await supabase
    .from('subjects')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
  return error ? null : (count ?? 0)
}

/**
 * Cantidad exacta de materias activas cuya política se reemplazaría, para
 * mostrarla en la confirmación (se consulta en el servidor, no se confía en
 * el número con que se renderizó la página).
 */
export async function getActiveSubjectsCount(): Promise<
  { success: true; count: number } | { success: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const count = await countActiveSubjects(supabase)
  if (count === null) {
    return { success: false, error: 'No se pudo contar las materias activas.' }
  }
  return { success: true, count }
}

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
    lateAfterMinutes,
    latesPerAbsence,
    applyToAllActiveSubjects,
    confirmedSubjectsCount,
  } = parsed.data

  if (applyToAllActiveSubjects) {
    if (confirmedSubjectsCount === undefined) {
      return {
        success: false,
        error: 'Confirma la cantidad de materias que se van a actualizar antes de aplicar.',
      }
    }
    const currentCount = await countActiveSubjects(supabase)
    if (currentCount === null) {
      return { success: false, error: 'No se pudo contar las materias activas.' }
    }
    if (currentCount !== confirmedSubjectsCount) {
      return {
        success: false,
        error: buildPolicyCountChangedMessage(currentCount),
        currentCount,
      }
    }

    const updatePayload: Record<string, unknown> = {
      absence_rule_type: absenceRuleType,
      max_absence_percentage: maxAbsencePercentage,
      total_planned_sessions: totalPlannedSessions,
      max_absence_count: absenceRuleType === 'FIXED_COUNT' ? maxAbsenceCount || 4 : null,
      late_after_minutes: lateAfterMinutes ?? null,
      lates_per_absence: latesPerAbsence ?? null,
    }

    const { error: batchError, count } = await supabase
      .from('subjects')
      .update(updatePayload, { count: 'exact' })
      .eq('is_active', true)

    if (batchError) {
      return { success: false, error: 'Error al aplicar política a las materias' }
    }

    await logAudit({
      actorId: user.id,
      action: 'policy.update_global_absence',
      entityType: 'subjects',
      details: { ...updatePayload, applied_to_count: count ?? 0 },
    })

    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/subjects')
    return { success: true, countUpdated: count ?? 0 }
  }

  revalidatePath('/admin/dashboard')
  return { success: true, countUpdated: 0 }
}
