/**
 * Reglas puras sobre CUÁNDO termina una clase y hasta cuándo puede un
 * profesor corregir asistencia (RF21). Sin dependencias de Supabase
 * para poder probarlas con fechas fijas.
 *
 * Hora de Colombia: America/Bogota es UTC-5 fijo (sin horario de
 * verano), mismo supuesto que src/lib/utils/bogotaDay.ts.
 */

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000
const MINUTE_MS = 60_000

/**
 * El profesor suele abrir el QR unos minutos antes de que arranque el
 * bloque del horario. Dentro de esta tolerancia sigue contando como
 * "dentro del bloque".
 */
export const EARLY_START_TOLERANCE_MINUTES = 15

export interface ScheduleBlockTime {
  day_of_week: number
  /** TIME de Postgres: 'HH:MM' o 'HH:MM:SS' */
  start_time: string
  end_time: string
}

function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Componentes de calendario de un instante, en hora de Colombia. */
function toBogotaParts(instant: Date) {
  const shifted = new Date(instant.getTime() - BOGOTA_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(), // 0 = domingo ... 6 = sábado, igual que day_of_week
    minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

/**
 * Fin de la clase para una sesión que arranca en `start`.
 *
 *  - Si `start` cae dentro de un bloque del horario semanal de ese
 *    día (con una tolerancia de apertura anticipada), la clase
 *    termina cuando termina el bloque.
 *  - Si no, termina `defaultClassMinutes` después de `start`.
 *
 * `minimumEnd` (normalmente el fin de la ventana de registro) evita
 * que la clase "termine" antes de que se cierre el registro por QR.
 */
export function computeClassEndsAt({
  start,
  schedules,
  defaultClassMinutes,
  minimumEnd,
}: {
  start: Date
  schedules: ScheduleBlockTime[]
  defaultClassMinutes: number
  minimumEnd?: Date
}): Date {
  const parts = toBogotaParts(start)

  let end: Date | null = null
  for (const block of schedules) {
    if (block.day_of_week !== parts.dayOfWeek) continue
    const blockStart = parseTimeToMinutes(block.start_time)
    const blockEnd = parseTimeToMinutes(block.end_time)
    if (blockStart === null || blockEnd === null) continue

    const startsInside =
      parts.minutesOfDay >= blockStart - EARLY_START_TOLERANCE_MINUTES &&
      parts.minutesOfDay < blockEnd
    if (!startsInside) continue

    const candidate = new Date(
      Date.UTC(parts.year, parts.month, parts.day, 0, blockEnd) + BOGOTA_OFFSET_MS
    )
    // Dos bloques pueden solaparse el mismo día: gana el que termina más tarde.
    if (!end || candidate > end) end = candidate
  }

  if (!end) end = new Date(start.getTime() + defaultClassMinutes * MINUTE_MS)
  if (minimumEnd && minimumEnd > end) end = minimumEnd
  return end
}

export interface SessionClassTimes {
  date: string | Date
  class_ends_at?: string | Date | null
}

/**
 * Fin efectivo de la clase de una sesión ya guardada. Las sesiones
 * anteriores a la migración 027 no tienen class_ends_at: se asume
 * `date + defaultClassMinutes`.
 */
export function getEffectiveClassEnd(
  session: SessionClassTimes,
  defaultClassMinutes: number
): Date {
  if (session.class_ends_at) return new Date(session.class_ends_at)
  return new Date(new Date(session.date).getTime() + defaultClassMinutes * MINUTE_MS)
}

/**
 * RF21: el profesor solo puede modificar asistencia mientras la clase
 * sigue en curso. (El coordinador puede en cualquier momento: esa
 * regla vive en el guard de la server action, no acá.)
 */
export function canProfessorEditSession(
  session: SessionClassTimes,
  defaultClassMinutes: number,
  now: Date = new Date()
): boolean {
  return now.getTime() <= getEffectiveClassEnd(session, defaultClassMinutes).getTime()
}

export const PAST_CLASS_EDIT_MESSAGE =
  'Solo coordinación puede modificar asistencias de clases pasadas.'
