'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkAdmin } from './authGuards'
import { logAudit } from '@/lib/audit/auditLog'
import { getAppSettings, parseAppSettingsInput } from '@/lib/settings/appSettings'
import { revalidatePath } from 'next/cache'

/**
 * Actualiza la configuración global de asistencia (ventana de
 * registro por QR y duración de clase por defecto). Solo ADMIN; la
 * escritura va con service-role porque app_settings no tiene
 * policies de escritura (migración 027).
 */
export async function updateAppSettings(
  rawInput: unknown
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const parsed = parseAppSettingsInput(rawInput)
  if (!parsed.ok) return { success: false, error: parsed.error }

  const before = await getAppSettings(supabase)

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('app_settings').upsert({
    id: 1,
    registration_window_minutes: parsed.settings.registrationWindowMinutes,
    default_class_minutes: parsed.settings.defaultClassMinutes,
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
    details: {
      registration_window_minutes_before: before.registrationWindowMinutes,
      registration_window_minutes_after: parsed.settings.registrationWindowMinutes,
      default_class_minutes_before: before.defaultClassMinutes,
      default_class_minutes_after: parsed.settings.defaultClassMinutes,
    },
  })

  revalidatePath('/admin/dashboard')
  revalidatePath('/professor/subjects')
  return { success: true }
}
