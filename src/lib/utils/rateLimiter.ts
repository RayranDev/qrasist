/**
 * Rate Limiter en memoria con ventana deslizante simple.
 * Previene ataques de fuerza bruta contra los endpoints de escaneo de QR.
 */

interface RateLimitRecord {
  timestamps: number[]
}

const store = new Map<string, RateLimitRecord>()

export interface RateLimitOptions {
  windowMs?: number // Default: 60,000 ms (1 minuto)
  maxAttempts?: number // Default: 10 intentos
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const windowMs = options.windowMs ?? 60_000
  const maxAttempts = options.maxAttempts ?? 10
  const now = Date.now()

  const record = store.get(key) || { timestamps: [] }

  // Filtrar intentos fuera de la ventana
  const recentTimestamps = record.timestamps.filter((t) => now - t < windowMs)

  if (recentTimestamps.length >= maxAttempts) {
    const oldest = recentTimestamps[0]
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    }
  }

  // Registrar intento actual
  recentTimestamps.push(now)
  store.set(key, { timestamps: recentTimestamps })

  return {
    allowed: true,
    remaining: maxAttempts - recentTimestamps.length,
  }
}

export function resetRateLimit(key: string): void {
  store.delete(key)
}

export function clearAllRateLimits(): void {
  store.clear()
}
