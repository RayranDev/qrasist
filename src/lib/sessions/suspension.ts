/**
 * Reglas puras de la suspensión de clase (RF20 / proceso 6 del documento
 * de requisitos). Sin dependencias de Supabase para poder probarlas con
 * fechas fijas.
 *
 * Una clase suspendida se guarda con is_active = false (ver migración
 * 029): así queda fuera de toda cuenta de "clases dictadas" y no genera
 * inasistencias. Lo que la distingue de una archivada es suspended_at.
 */
import { parseTimeToMinutes, type ScheduleBlockTime } from './classWindow'
import { bogotaInstant } from '@/lib/utils/bogotaDay'

export const MIN_SUSPENSION_REASON_LENGTH = 5
export const MAX_SUSPENSION_REASON_LENGTH = 500

export const SUSPENDED_NO_ABSENCES_NOTICE =
  'La clase no contará como dictada: no se generarán inasistencias para los estudiantes.'

export function validateSuspensionReason(reason: string): string | null {
  const trimmed = reason.trim()
  if (trimmed.length < MIN_SUSPENSION_REASON_LENGTH) {
    return `El motivo debe tener al menos ${MIN_SUSPENSION_REASON_LENGTH} caracteres.`
  }
  if (trimmed.length > MAX_SUSPENSION_REASON_LENGTH) {
    return `El motivo no puede superar ${MAX_SUSPENSION_REASON_LENGTH} caracteres.`
  }
  return null
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** ¿Es 'YYYY-MM-DD' una fecha de calendario real? (rechaza 2026-02-31) */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export interface PeriodRange {
  start_date: string | null
  end_date: string | null
}

/**
 * Valida el día de una suspensión "sin sesión previa" (clase programada
 * que todavía no tiene registro).
 *
 *  - PROFESSOR: solo la clase de HOY (hora de Bogotá).
 *  - ADMIN: cualquier fecha dentro del período de la materia.
 */
export function validateSuspensionDay({
  role,
  date,
  today,
  period,
}: {
  role: 'ADMIN' | 'PROFESSOR'
  date: string
  today: string
  period: PeriodRange | null
}): string | null {
  if (!isValidIsoDate(date)) return 'La fecha no es válida.'

  if (role === 'PROFESSOR') {
    return date === today ? null : 'Solo puedes suspender la clase de hoy.'
  }

  if (!period?.start_date || !period.end_date) {
    return 'La materia no tiene un período con fechas: no se puede suspender un día.'
  }
  if (date < period.start_date || date > period.end_date) {
    return 'La fecha está fuera del período de la materia.'
  }
  return null
}

/**
 * Un profesor solo puede suspender "sin sesión previa" mientras la clase de
 * hoy todavía no terminó: el horario debe tener un bloque hoy y el último
 * bloque no haber acabado. Si no, bastaría con registrar una "suspensión" a
 * las 18:00 para borrar una omisión; después de la clase el camino es
 * justificar la clase no registrada. (Coordinación no tiene esta restricción.)
 */
export function validateProfessorSuspensionWindow({
  blocks,
  dayOfWeek,
  isoDate,
  now,
}: {
  blocks: ScheduleBlockTime[]
  dayOfWeek: number
  /** Fecha civil de hoy en Bogotá. */
  isoDate: string
  now: Date
}): string | null {
  const todayEnds = blocks
    .filter((b) => b.day_of_week === dayOfWeek)
    .map((b) => parseTimeToMinutes(b.end_time))
    .filter((end): end is number => end !== null)

  if (todayEnds.length === 0) {
    return 'Hoy no hay clase en el horario de esta materia.'
  }
  if (bogotaInstant(isoDate, Math.max(...todayEnds)).getTime() <= now.getTime()) {
    return 'La clase de hoy ya terminó. Si no se registró asistencia, justifícala desde "clases sin registrar".'
  }
  return null
}

export interface SuspendedSessionTimes {
  date: Date
  classEndsAt: Date
  /** Modalidad del bloque de horario que coincide ese día, si lo hay. */
  modality: 'PRESENCIAL' | 'VIRTUAL' | null
}

/**
 * Horas del registro de una clase suspendida que nunca llegó a tener
 * sesión. Si el día coincide con bloques del horario semanal, la clase
 * empieza al inicio del primero y termina al fin del último (así la
 * detección de omisiones la ve como cubierta ese día). Sin bloque: hoy
 * se usa el instante actual, otro día el mediodía de Bogotá.
 */
export function resolveSuspendedSessionTimes({
  isoDate,
  dayOfWeek,
  blocks,
  now,
  today,
}: {
  isoDate: string
  /** 0 = domingo ... 6 = sábado, del día `isoDate` */
  dayOfWeek: number
  blocks: (ScheduleBlockTime & { modality?: 'PRESENCIAL' | 'VIRTUAL' })[]
  now: Date
  today: string
}): SuspendedSessionTimes {
  const parsed = blocks
    .filter((b) => b.day_of_week === dayOfWeek)
    .map((b) => ({
      start: parseTimeToMinutes(b.start_time),
      end: parseTimeToMinutes(b.end_time),
      modality: b.modality ?? null,
    }))
    .filter((b): b is { start: number; end: number; modality: 'PRESENCIAL' | 'VIRTUAL' | null } => {
      return b.start !== null && b.end !== null
    })
    .sort((a, b) => a.start - b.start)

  if (parsed.length > 0) {
    const first = parsed[0]
    const lastEnd = Math.max(...parsed.map((b) => b.end))
    return {
      date: bogotaInstant(isoDate, first.start),
      classEndsAt: bogotaInstant(isoDate, lastEnd),
      modality: first.modality,
    }
  }

  if (isoDate === today) return { date: now, classEndsAt: now, modality: null }

  const noon = bogotaInstant(isoDate, 12 * 60)
  return { date: noon, classEndsAt: noon, modality: null }
}

/** Día de la semana (0 = domingo) de una fecha civil 'YYYY-MM-DD'. */
export function dayOfWeekOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay()
}
