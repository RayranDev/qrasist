/**
 * Validación de rangos de días civiles ('YYYY-MM-DD', inclusivos) compartida
 * entre los route handlers y la interfaz. Sin dependencias: se puede importar
 * desde componentes de cliente.
 */

/** Rango máximo en días civiles, ambos extremos inclusivos. */
export const MAX_RANGE_DAYS = 366

const DAY_MS = 24 * 60 * 60 * 1000

/** Mensaje de error si el rango no es válido; null si lo es. */
export function checkDayRange(from: string, to: string): string | null {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  if (days < 0) return 'La fecha final no puede ser anterior a la inicial.'
  if (days + 1 > MAX_RANGE_DAYS) return `El rango no puede superar ${MAX_RANGE_DAYS} días.`
  return null
}
