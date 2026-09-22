/**
 * Rate limiter respaldado por Postgres (tabla rate_limits + funcion
 * check_rate_limit, ver migracion 020_rate_limits.sql).
 *
 * El limiter anterior usaba un Map en memoria del proceso Node --
 * en Vercel serverless cada invocacion puede caer en una instancia
 * distinta (o una instancia fria), asi que el contador nunca se
 * compartia entre requests reales y el limite era inutil en
 * produccion. Este llama a una funcion atomica de Postgres via el
 * cliente service-role, asi el contador es real sin importar en que
 * instancia corra la funcion.
 *
 * Fail-open: si la RPC falla (ej. la base esta caida o mal
 * configurada), se permite el intento -- un problema de
 * infraestructura no deberia bloquear el registro de asistencia de
 * nadie.
 */

import { getSupabaseAdmin } from '@/lib/supabase/adminClient'

export interface RateLimitOptions {
  windowMs?: number // Default: 60,000 ms (1 minuto)
  maxAttempts?: number // Default: 10 intentos
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds?: number
}

export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const windowMs = options.windowMs ?? 60_000
  const maxAttempts = options.maxAttempts ?? 10
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000))

  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_max: maxAttempts,
      p_window_seconds: windowSeconds,
    })

    if (error) {
      console.error('[rateLimiter] check_rate_limit RPC falló, permitiendo (fail-open):', error)
      return { allowed: true }
    }

    if (data === true) {
      return { allowed: true }
    }

    return { allowed: false, retryAfterSeconds: computeRetryAfterSeconds(windowSeconds) }
  } catch (err) {
    console.error('[rateLimiter] error inesperado, permitiendo (fail-open):', err)
    return { allowed: true }
  }
}

// Misma cuenta de ventana fija que usa check_rate_limit() en SQL,
// para poder informar cuanto falta sin que la RPC tenga que
// devolver el window_start.
function computeRetryAfterSeconds(windowSeconds: number): number {
  const nowSeconds = Date.now() / 1000
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds
  return Math.max(1, Math.ceil(windowStart + windowSeconds - nowSeconds))
}
