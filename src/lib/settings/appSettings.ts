/**
 * Configuración global de asistencia (tabla singleton app_settings,
 * migración 027). Vive fuera de un archivo 'use server' a propósito:
 * exporta constantes y helpers síncronos, y `getAppSettings` recibe un
 * cliente de Supabase, que no se puede serializar como argumento de
 * una server action.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_ROTATION_SECONDS,
  MAX_ROTATION_SECONDS,
  MIN_ROTATION_SECONDS,
} from '@/lib/qrRotation'

export interface AppSettings {
  registrationWindowMinutes: number
  defaultClassMinutes: number
  /** Cada cuántos segundos rota el QR de una sesión nueva (migración 038). */
  qrRotationSeconds: number
}

// 30 min: debe superar la tolerancia de tardanza por defecto (20 min, ver
// lateTracking.ts), o ningún escaneo por QR podría contar como tarde.
export const DEFAULT_REGISTRATION_WINDOW_MINUTES = 30
export const DEFAULT_CLASS_MINUTES = 120

export const REGISTRATION_WINDOW_RANGE = { min: 1, max: 60 } as const
export const CLASS_MINUTES_RANGE = { min: 30, max: 360 } as const
export const QR_ROTATION_RANGE = {
  min: MIN_ROTATION_SECONDS,
  max: MAX_ROTATION_SECONDS,
} as const

export const DEFAULT_APP_SETTINGS: AppSettings = {
  registrationWindowMinutes: DEFAULT_REGISTRATION_WINDOW_MINUTES,
  defaultClassMinutes: DEFAULT_CLASS_MINUTES,
  qrRotationSeconds: DEFAULT_ROTATION_SECONDS,
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
  const qrRotationSeconds = Number(input.qrRotationSeconds)

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

  if (!isIntegerInRange(qrRotationSeconds, QR_ROTATION_RANGE)) {
    return {
      ok: false,
      error: `La rotación del código QR debe ser un número entero entre ${QR_ROTATION_RANGE.min} y ${QR_ROTATION_RANGE.max} segundos.`,
    }
  }

  return {
    ok: true,
    settings: { registrationWindowMinutes, defaultClassMinutes, qrRotationSeconds },
  }
}

/**
 * Lee la configuración vigente. Si la fila no existe o la lectura
 * falla (ej. la migración 027 todavía no se aplicó), devuelve los
 * valores por defecto en vez de tumbar el flujo de asistencia.
 */
export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const read = (columns: string) =>
    supabase.from('app_settings').select(columns).eq('id', 1).maybeSingle()

  const first = await read(
    'registration_window_minutes, default_class_minutes, qr_rotation_seconds'
  )
  // Si la migración 038 todavía no se aplicó, la columna nueva no existe y la
  // lectura falla: se reintenta sin ella para no perder la ventana ni la duración.
  const data = first.error
    ? (await read('registration_window_minutes, default_class_minutes')).data
    : first.data

  if (!data) return DEFAULT_APP_SETTINGS
  const row = data as unknown as Record<string, unknown>

  return {
    registrationWindowMinutes:
      Number(row.registration_window_minutes) || DEFAULT_REGISTRATION_WINDOW_MINUTES,
    defaultClassMinutes: Number(row.default_class_minutes) || DEFAULT_CLASS_MINUTES,
    qrRotationSeconds: Number(row.qr_rotation_seconds) || DEFAULT_ROTATION_SECONDS,
  }
}
