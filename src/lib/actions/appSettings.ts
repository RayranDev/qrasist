'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkAdmin } from './authGuards'
import { logAudit } from '@/lib/audit/auditLog'
import { getAppSettings, parseAppSettingsInput } from '@/lib/settings/appSettings'
import {
  diffFields,
  getGlobalPolicy,
  parseChangeReason,
  parseGlobalPolicyInput,
  policyToColumns,
} from '@/lib/settings/globalPolicy'
import { revalidatePath } from 'next/cache'

export type UpdateAppSettingsResult =
  | {
      success: true
      /** false = no había nada distinto: no se escribió ni se auditó. */
      changed: boolean
      /** Materias activas que heredan la política global (policy_override = false). */
      inheritingCount: number
      /** Materias activas con política personalizada (no cambian con la global). */
      customCount: number
    }
  | { success: false; error: string }

async function countActiveSubjectsByOverride(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ inheritingCount: number; customCount: number }> {
  const [inheriting, custom] = await Promise.all([
    supabase
      .from('subjects')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('policy_override', false),
    supabase
      .from('subjects')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('policy_override', true),
  ])
  return { inheritingCount: inheriting.count ?? 0, customCount: custom.count ?? 0 }
}

/**
 * Actualiza la configuración global de asistencia: ventana de registro por QR,
 * rotación del código QR (la heredan las sesiones nuevas, migración 038),
 * duración de clase por defecto y la política de asistencia (tolerancia de
 * tardanza, tardanzas por falta y regla de faltas). Solo ADMIN; la escritura
 * va con service-role porque app_settings no tiene policies de escritura
 * (migración 027). Las materias sin política personalizada reciben el cambio
 * por trigger (migración 037).
 *
 * Cada cambio exige un motivo (acuerdo de reunión) y se audita con el valor
 * anterior y el nuevo de cada campo modificado. Si nada cambió no se escribe
 * ni se audita.
 */
export async function updateAppSettings(rawInput: unknown): Promise<UpdateAppSettingsResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const timing = parseAppSettingsInput(rawInput)
  if (!timing.ok) return { success: false, error: timing.error }
  const policy = parseGlobalPolicyInput(rawInput)
  if (!policy.ok) return { success: false, error: policy.error }

  const [beforeTiming, beforePolicy] = await Promise.all([
    getAppSettings(supabase),
    getGlobalPolicy(supabase),
  ])

  const changes = diffFields(
    {
      registration_window_minutes: beforeTiming.registrationWindowMinutes,
      default_class_minutes: beforeTiming.defaultClassMinutes,
      qr_rotation_seconds: beforeTiming.qrRotationSeconds,
      ...policyToColumns(beforePolicy),
    },
    {
      registration_window_minutes: timing.settings.registrationWindowMinutes,
      default_class_minutes: timing.settings.defaultClassMinutes,
      qr_rotation_seconds: timing.settings.qrRotationSeconds,
      ...policyToColumns(policy.policy),
    }
  )

  if (Object.keys(changes).length === 0) {
    return { success: true, changed: false, ...(await countActiveSubjectsByOverride(supabase)) }
  }

  const reason = parseChangeReason((rawInput as { reason?: unknown } | null)?.reason)
  if (!reason.ok) return { success: false, error: reason.error }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('app_settings').upsert({
    id: 1,
    registration_window_minutes: timing.settings.registrationWindowMinutes,
    default_class_minutes: timing.settings.defaultClassMinutes,
    qr_rotation_seconds: timing.settings.qrRotationSeconds,
    ...policyToColumns(policy.policy),
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  })

  if (error) {
    console.error('[settings] failed to update app_settings', error)
    return { success: false, error: 'No se pudo guardar la configuración.' }
  }

  await logAudit({
    actorId: user.id,
    action: 'settings.update_attendance',
    entityType: 'app_settings',
    details: { changes, reason: reason.reason },
  })

  revalidatePath('/admin/dashboard')
  revalidatePath('/admin/subjects')
  revalidatePath('/professor/subjects')
  return { success: true, changed: true, ...(await countActiveSubjectsByOverride(supabase)) }
}
