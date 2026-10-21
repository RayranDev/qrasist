/**
 * Formato de una fecha civil 'YYYY-MM-DD' (la de una clase en hora de
 * Bogotá) sin que la zona horaria del navegador o del servidor la mueva de
 * día: se interpreta como UTC y se formatea como UTC.
 */
export function formatCivilDate(isoDate: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${isoDate}T00:00:00Z`))
}
