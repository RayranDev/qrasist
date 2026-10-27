/**
 * Calendario mensual de /admin/attendance: helpers PUROS para armar la
 * cuadrícula (semanas de lunes a domingo), acotar las consultas al mes
 * visible y agrupar las sesiones por día civil de Bogotá. Sin I/O ni
 * librerías de fechas: todo es aritmética sobre 'YYYY-MM-DD' en UTC, que es
 * como se representa una fecha civil (ver civilDate.ts).
 */
import { bogotaInstant } from '@/lib/utils/bogotaDay'
import { bogotaCalendarDate } from '@/lib/utils/businessDays'

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

/** Años aceptados en la URL: evita meses absurdos (0050, 9999) que el calendario no sabe mostrar. */
export const MIN_SUPPORTED_YEAR = 2000
export const MAX_SUPPORTED_YEAR = 2100

/** ¿El año de un 'YYYY-...' está dentro de MIN_SUPPORTED_YEAR..MAX_SUPPORTED_YEAR? */
export function isSupportedYear(value: string): boolean {
  const year = Number(value.slice(0, 4))
  return year >= MIN_SUPPORTED_YEAR && year <= MAX_SUPPORTED_YEAR
}

/** Valida un mes 'YYYY-MM' (años 2000-2100); null si no es uno. */
export function parseMonth(value: string | null | undefined): string | null {
  return value && MONTH_RE.test(value) && isSupportedYear(value) ? value : null
}

/** Valida una fecha civil real 'YYYY-MM-DD' (rechaza 2026-02-31 y años fuera de 2000-2100); null si no lo es. */
export function parseCivilDay(value: string | null | undefined): string | null {
  if (!value || !isSupportedYear(value)) return null
  const match = DAY_RE.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return date.toISOString().slice(0, 10) === value ? value : null
}

/** Mes civil de Bogotá de un instante, como 'YYYY-MM'. */
export function bogotaMonthOf(instant: Date): string {
  return bogotaCalendarDate(instant).slice(0, 7)
}

/** Mes siguiente (delta = 1) o anterior (delta = -1) a un 'YYYY-MM'. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}

export interface MonthBounds {
  /** Primer y último día civil del mes, 'YYYY-MM-DD'. */
  firstDay: string
  lastDay: string
  /** Instantes ISO para consultar timestamptz: [startIso, endIso) en hora de Bogotá. */
  startIso: string
  endIso: string
}

export function monthBounds(month: string): MonthBounds {
  const firstDay = `${month}-01`
  const nextFirst = `${shiftMonth(month, 1)}-01`
  const lastDay = new Date(new Date(`${nextFirst}T00:00:00Z`).getTime() - DAY_MS)
    .toISOString()
    .slice(0, 10)
  return {
    firstDay,
    lastDay,
    startIso: bogotaInstant(firstDay, 0).toISOString(),
    endIso: bogotaInstant(nextFirst, 0).toISOString(),
  }
}

/** Instantes ISO [inicio, fin) de un día civil de Bogotá. */
export function dayBounds(day: string): { startIso: string; endIso: string } {
  return {
    startIso: bogotaInstant(day, 0).toISOString(),
    endIso: bogotaInstant(day, 24 * 60).toISOString(),
  }
}

export interface CalendarCell {
  /** 'YYYY-MM-DD' */
  date: string
  dayOfMonth: number
  /** false en los días de relleno de las semanas parciales (mes anterior o siguiente). */
  inMonth: boolean
  isToday: boolean
}

/**
 * Semanas del mes con lunes como primer día. Siempre trae semanas completas
 * (los días de relleno quedan con `inMonth: false`); un mes ocupa 4 a 6 filas.
 */
export function buildMonthGrid(month: string, today: string): CalendarCell[][] {
  const { firstDay, lastDay } = monthBounds(month)
  const first = new Date(`${firstDay}T00:00:00Z`)
  // getUTCDay: 0 = domingo. Desplazamiento hasta el lunes anterior (o el mismo día).
  const leading = (first.getUTCDay() + 6) % 7
  const last = new Date(`${lastDay}T00:00:00Z`)
  const trailing = 6 - ((last.getUTCDay() + 6) % 7)
  const start = first.getTime() - leading * DAY_MS
  const totalDays = leading + Number(lastDay.slice(8)) + trailing

  const weeks: CalendarCell[][] = []
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start + i * DAY_MS).toISOString().slice(0, 10)
    const cell: CalendarCell = {
      date,
      dayOfMonth: Number(date.slice(8)),
      inMonth: date.startsWith(month),
      isToday: date === today,
    }
    if (i % 7 === 0) weeks.push([cell])
    else weeks[weeks.length - 1].push(cell)
  }
  return weeks
}

/** Encabezados de columna, lunes primero: [abreviado, completo]. */
export const WEEKDAY_LABELS: readonly (readonly [string, string])[] = [
  ['Lun', 'lunes'],
  ['Mar', 'martes'],
  ['Mié', 'miércoles'],
  ['Jue', 'jueves'],
  ['Vie', 'viernes'],
  ['Sáb', 'sábado'],
  ['Dom', 'domingo'],
]

/** "octubre de 2026" para el título del mes. */
export function formatMonthLabel(month: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T00:00:00Z`))
}

/** "martes, 27 de octubre de 2026" para el título del día. */
export function formatDayLabel(day: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${day}T00:00:00Z`))
}

export interface CalendarSessionInput {
  /** timestamptz ISO */
  date: string
  isActive: boolean | null
  suspendedAt: string | null
  /** false si la materia está archivada; sus clases no cuentan (igual que en los reportes). */
  subjectActive?: boolean | null
}

export interface DaySummary {
  /** Clases dictadas o por dictar (activas, no suspendidas). */
  held: number
  suspended: number
}

/**
 * Regla ÚNICA de qué cuenta como clase en el calendario (celdas, total del mes
 * y panel del día), alineada con los reportes descargables: solo materias
 * activas, y las sesiones archivadas (is_active = false sin suspensión) no son
 * clases vigentes. Las suspendidas sí son clases del calendario, pero se
 * cuentan aparte de las dictadas.
 */
export function isCalendarClass(
  s: Pick<CalendarSessionInput, 'isActive' | 'suspendedAt' | 'subjectActive'>
): boolean {
  if (s.subjectActive === false) return false
  return !!s.suspendedAt || s.isActive !== false
}

/**
 * Conteo de un conjunto de sesiones: `held` = dictadas o por dictar,
 * `suspended` = suspendidas; el total de clases es held + suspended.
 */
export function countClasses(
  sessions: Pick<CalendarSessionInput, 'isActive' | 'suspendedAt' | 'subjectActive'>[]
): DaySummary {
  const summary: DaySummary = { held: 0, suspended: 0 }
  for (const s of sessions) {
    if (!isCalendarClass(s)) continue
    if (s.suspendedAt) summary.suspended++
    else summary.held++
  }
  return summary
}

/** Cuenta las clases de cada día civil de Bogotá con la regla de isCalendarClass. */
export function summarizeDays(sessions: CalendarSessionInput[]): Map<string, DaySummary> {
  const byDay = new Map<string, CalendarSessionInput[]>()
  for (const s of sessions) {
    if (!isCalendarClass(s)) continue
    const day = bogotaCalendarDate(new Date(s.date))
    const list = byDay.get(day)
    if (list) list.push(s)
    else byDay.set(day, [s])
  }
  return new Map([...byDay].map(([day, list]) => [day, countClasses(list)]))
}
