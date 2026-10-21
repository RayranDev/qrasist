/**
 * Fechas y horas en español (hora de Colombia) para la interfaz.
 *
 * Se arman a mano en vez de usar Intl/date-fns locales por dos razones:
 *  - Hidratación: el servidor y el navegador deben producir EXACTAMENTE el
 *    mismo texto, sin depender de la zona horaria ni de la versión de ICU
 *    (que cambia los espacios de "p. m." entre Node y cada navegador).
 *  - Mayúsculas: en español los días y los meses van en minúscula
 *    ("miércoles 21 de octubre"); solo se capitaliza la primera letra
 *    cuando el texto abre una frase o una etiqueta (capitalizeFirst).
 *
 * America/Bogota es UTC-5 fijo (sin horario de verano), igual que
 * src/lib/utils/bogotaDay.ts.
 */

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Un Date cuyos getters UTC devuelven la hora de pared de Bogotá. */
function toBogotaWallClock(date: Date | string): Date {
  const instant = typeof date === 'string' ? new Date(date) : date
  return new Date(instant.getTime() - BOGOTA_OFFSET_MS)
}

/** Solo la primera letra en mayúscula; el resto queda tal cual. */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** 'miércoles 21 de octubre' (día calendario de Bogotá). */
export function formatBogotaDayLong(date: Date | string): string {
  const wall = toBogotaWallClock(date)
  return `${WEEKDAYS_ES[wall.getUTCDay()]} ${wall.getUTCDate()} de ${MONTHS_ES[wall.getUTCMonth()]}`
}

/** '6:02 p. m.' (hora de Bogotá, reloj de 12 horas). */
export function formatBogotaClock(date: Date | string): string {
  const wall = toBogotaWallClock(date)
  const hours = wall.getUTCHours()
  const minutes = String(wall.getUTCMinutes()).padStart(2, '0')
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'a. m.' : 'p. m.'}`
}

/** 'miércoles 21 de octubre, 6:02 p. m.' */
export function formatBogotaDateTimeLong(date: Date | string): string {
  return `${formatBogotaDayLong(date)}, ${formatBogotaClock(date)}`
}

/** '21/10/2026' (día calendario de Bogotá). */
export function formatBogotaDateNumeric(date: Date | string): string {
  const wall = toBogotaWallClock(date)
  const day = String(wall.getUTCDate()).padStart(2, '0')
  const month = String(wall.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${wall.getUTCFullYear()}`
}
