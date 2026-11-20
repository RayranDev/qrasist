/**
 * Relación entre la ventana de registro por QR y la tolerancia de tardanza.
 *
 * Un escaneo cuenta como tarde solo si llega pasados `late_after_minutes`
 * desde el inicio de la clase, pero los escaneos se rechazan cuando se cierra
 * la ventana de registro (`expires_at`). Si la ventana no supera la
 * tolerancia, ningún escaneo puede llegar a ser tarde: solo quedaría el
 * marcado manual. Este módulo no cambia cómo se calcula la tardanza; solo
 * permite avisar cuando la configuración la deja inalcanzable.
 */

/** Tolerancia de tardanza por defecto de una materia (acuerdo de coordinación). */
export const DEFAULT_LATE_AFTER_MINUTES = 20

/**
 * True si, con esa ventana, un escaneo por QR todavía puede contar como tarde.
 * Con `lateAfterMinutes` null el seguimiento está desactivado: no aplica, así
 * que no hay nada inalcanzable que avisar.
 */
export function lateTrackingReachable(
  windowMinutes: number,
  lateAfterMinutes: number | null | undefined
): boolean {
  if (lateAfterMinutes == null) return true
  return windowMinutes > lateAfterMinutes
}

/**
 * Menor tolerancia (entre las candidatas) que la ventana deja inalcanzable, o
 * null si todas siguen siendo alcanzables. Las candidatas nulas se ignoran.
 */
export function smallestUnreachableLateAfter(
  windowMinutes: number,
  candidates: readonly (number | null | undefined)[]
): number | null {
  let smallest: number | null = null
  for (const candidate of candidates) {
    if (candidate == null || lateTrackingReachable(windowMinutes, candidate)) continue
    if (smallest === null || candidate < smallest) smallest = candidate
  }
  return smallest
}
