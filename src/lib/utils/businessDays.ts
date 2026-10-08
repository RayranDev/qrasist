/**
 * Aritmética de días hábiles colombianos (lunes a viernes, sin festivos)
 * sobre el calendario de America/Bogota (UTC-5 fijo, mismo supuesto que
 * bogotaDay.ts).
 */
import { isColombianHoliday } from './colombianHolidays'

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Fecha civil de Bogotá de un instante, como 'YYYY-MM-DD'. */
export function bogotaCalendarDate(instant: Date): string {
  return new Date(instant.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10)
}

function isBusinessDay(isoDate: string): boolean {
  const dayOfWeek = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) return false
  return !isColombianHoliday(isoDate)
}

/**
 * Fecha civil (Bogotá) del n-ésimo día hábil POSTERIOR a `instant`. El
 * día de `instant` no cuenta, aunque sea hábil.
 */
export function addBusinessDaysBogota(instant: Date, businessDays: number): string {
  let cursor = new Date(`${bogotaCalendarDate(instant)}T00:00:00Z`)
  let remaining = businessDays
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS)
    if (isBusinessDay(cursor.toISOString().slice(0, 10))) remaining--
  }
  return cursor.toISOString().slice(0, 10)
}

/** Último instante (23:59:59.999 hora de Bogotá) de una fecha civil. */
export function endOfBogotaDay(isoDate: string): Date {
  return new Date(new Date(`${isoDate}T23:59:59.999Z`).getTime() + BOGOTA_OFFSET_MS)
}
