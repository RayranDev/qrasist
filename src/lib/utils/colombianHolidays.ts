/**
 * Festivos de Colombia (Ley 51 de 1983 y normas posteriores), calculados
 * por año sin tablas fijas ni dependencias.
 *
 *  - Fijos (no se mueven): 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
 *  - Ley Emiliani (se trasladan al lunes siguiente; si ya caen lunes, se
 *    quedan): 6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 nov.
 *  - Semana Santa (relativos al Domingo de Pascua): Jueves Santo (-3) y
 *    Viernes Santo (-2) no se mueven.
 *  - Relativos a Pascua trasladados al lunes siguiente: Ascensión del
 *    Señor (Pascua + 39 -> lunes, +43), Corpus Christi (+60 -> +64) y
 *    Sagrado Corazón (+68 -> +71).
 *
 * Las fechas se manejan como cadenas 'YYYY-MM-DD' (calendario civil, sin
 * hora ni zona), así que no dependen de la zona horaria del servidor.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/** Lunes de la misma semana "hacia adelante": si ya es lunes, se queda. */
function nextMonday(date: Date): Date {
  const dayOfWeek = date.getUTCDay() // 0 = domingo ... 6 = sábado
  return addDays(date, (8 - dayOfWeek) % 7)
}

/**
 * Domingo de Pascua (calendario gregoriano) por el algoritmo anónimo de
 * Meeus/Jones/Butcher.
 */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utcDate(year, month, day)
}

const cache = new Map<number, string[]>()

/** Festivos del año, como fechas 'YYYY-MM-DD' ordenadas y sin repetir. */
export function colombianHolidays(year: number): string[] {
  const cached = cache.get(year)
  if (cached) return cached

  const fixed = [
    utcDate(year, 1, 1),
    utcDate(year, 5, 1),
    utcDate(year, 7, 20),
    utcDate(year, 8, 7),
    utcDate(year, 12, 8),
    utcDate(year, 12, 25),
  ]

  const movedToMonday = [
    utcDate(year, 1, 6),
    utcDate(year, 3, 19),
    utcDate(year, 6, 29),
    utcDate(year, 8, 15),
    utcDate(year, 10, 12),
    utcDate(year, 11, 1),
    utcDate(year, 11, 11),
  ].map(nextMonday)

  const easter = easterSunday(year)
  const easterBased = [
    addDays(easter, -3), // Jueves Santo
    addDays(easter, -2), // Viernes Santo
    addDays(easter, 43), // Ascensión del Señor (jueves +39, trasladado al lunes)
    addDays(easter, 64), // Corpus Christi (jueves +60, trasladado al lunes)
    addDays(easter, 71), // Sagrado Corazón (viernes +68, trasladado al lunes)
  ]

  // San Pedro y San Pablo puede coincidir con Sagrado Corazón (ej. 2025):
  // se deduplica porque cuenta como un solo día no hábil.
  const holidays = Array.from(
    new Set([...fixed, ...movedToMonday, ...easterBased].map(toIso))
  ).sort()

  cache.set(year, holidays)
  return holidays
}

/** ¿Es festivo en Colombia la fecha civil 'YYYY-MM-DD'? */
export function isColombianHoliday(isoDate: string): boolean {
  const year = Number(isoDate.slice(0, 4))
  return colombianHolidays(year).includes(isoDate)
}
