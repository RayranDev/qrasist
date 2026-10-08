/**
 * Configuración global de asistencia (tabla singleton app_settings,
 * migración 027). Vive fuera de un archivo 'use server' a propósito:
 * exporta constantes y helpers síncronos, y `getAppSettings` recibe un
 * cliente de Supabase, que no se puede serializar como argumento de
 * una server action.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AppSettings {
  registrationWindowMinutes: number
  defaultClassMinutes: number
}

export const DEFAULT_REGISTRATION_WINDOW_MINUTES = 5
export const DEFAULT_CLASS_MINUTES = 120

export const REGISTRATION_WINDOW_RANGE = { min: 1, max: 60 } as const
export const CLASS_MINUTES_RANGE = { min: 30, max: 360 } as const

export const DEFAULT_APP_SETTINGS: AppSettings = {
  registrationWindowMinutes: DEFAULT_REGISTRATION_WINDOW_MINUTES,
  defaultClassMinutes: DEFAULT_CLASS_MINUTES,
}

function isIntegerInRange(value: unknown, range: { min: number; max: number }): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max
  )
}

/**
 * Valida la entrada del formulario de configuración (cualquier cosa
 * que llegue del cliente es no confiable). Devuelve los valores ya
 * normalizados o el primer mensaje de error.
 */
export function parseAppSettingsInput(
  raw: unknown
): { ok: true; settings: AppSettings } | { ok: false; error: string } {
  const input = (raw ?? {}) as Record<string, unknown>
  const registrationWindowMinutes = Number(input.registrationWindowMinutes)
  const defaultClassMinutes = Number(input.defaultClassMinutes)

  if (!isIntegerInRange(registrationWindowMinutes, REGISTRATION_WINDOW_RANGE)) {
    return {
      ok: false,
      error: `La ventana de registro debe ser un número entero entre ${REGISTRATION_WINDOW_RANGE.min} y ${REGISTRATION_WINDOW_RANGE.max} minutos.`,
    }
  }
  if (!isIntegerInRange(defaultClassMinutes, CLASS_MINUTES_RANGE)) {
    return {
      ok: false,
      error: `La duración de clase debe ser un número entero entre ${CLASS_MINUTES_RANGE.min} y ${CLASS_MINUTES_RANGE.max} minutos.`,
    }
  }

  return { ok: true, settings: { registrationWindowMinutes, defaultClassMinutes } }
}

/**
 * Lee la configuración vigente. Si la fila no existe o la lectura
 * falla (ej. la migración 027 todavía no se aplicó), devuelve los
 * valores por defecto en vez de tumbar el flujo de asistencia.
 */
export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase
    .from('app_settings')
    .select('registration_window_minutes, default_class_minutes')
    .eq('id', 1)
    .maybeSingle()

  if (!data) return DEFAULT_APP_SETTINGS

  return {
    registrationWindowMinutes:
      Number(data.registration_window_minutes) || DEFAULT_REGISTRATION_WINDOW_MINUTES,
    defaultClassMinutes: Number(data.default_class_minutes) || DEFAULT_CLASS_MINUTES,
  }
}
