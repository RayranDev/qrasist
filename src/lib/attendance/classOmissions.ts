/**
 * Detección de clases programadas que el profesor no registró (RF22
 * "Justificación de omisión"). Pura y sin Supabase: recibe el horario
 * semanal, el período, las sesiones existentes y "ahora", y devuelve los
 * días de clase esperados que quedaron sin ninguna sesión.
 *
 * Se calcula al leer (sin cron): lo que se persiste es solo la
 * justificación del profesor (tabla class_omissions, migración 029).
 *
 * Reglas (todas en hora de Bogotá, America/Bogota = UTC-5 fijo):
 *
 *  - Un día de clase esperado sale de los bloques de subject_schedules
 *    para cada día de la semana entre el inicio del período y el fin del
 *    período, sin pasar de hoy.
 *  - Solo cuenta si el día ya "venció": un día anterior a hoy, o hoy una
 *    vez terminado el último bloque del día (no se acusa a nadie de omitir
 *    una clase que todavía no termina).
 *  - Un bloque solo cuenta desde que existe: se ignoran los días en que el
 *    bloque terminó antes de su created_at. Así agregar un bloque a mitad
 *    de período no marca las semanas anteriores.
 *  - Los festivos colombianos no tienen clase esperada.
 *  - Está "cubierto" si existe CUALQUIER sesión de la materia ese día de
 *    Bogotá, en cualquier estado: normal, archivada, suspendida (RF20),
 *    reposición o registrada a mano. Solo la ausencia total de registro es
 *    una omisión.
 *  - Período inactivo: se calcula igual mientras tenga fechas (el estado
 *    activo lo decide quien llama; ver classOmissionsData.ts). Sin período
 *    o sin fechas no hay clases esperadas y el resultado es vacío.
 */
import { parseTimeToMinutes } from '@/lib/sessions/classWindow'
import { bogotaInstant } from '@/lib/utils/bogotaDay'
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import { isColombianHoliday } from '@/lib/utils/colombianHolidays'

const DAY_MS = 24 * 60 * 60 * 1000

export interface OmissionScheduleBlock {
  id: string
  /** 0 = domingo ... 6 = sábado */
  day_of_week: number
  /** TIME de Postgres: 'HH:MM' o 'HH:MM:SS' */
  start_time: string
  end_time: string
  /** Instante en que se creó el bloque (ISO). */
  created_at: string
}

export interface OmissionPeriod {
  /** 'YYYY-MM-DD' */
  start_date: string | null
  end_date: string | null
}

export interface ExpectedClassDay {
  /** 'YYYY-MM-DD' (Bogotá) */
  date: string
  /** Bloque que abre el día (el de inicio más temprano). */
  scheduleId: string
  startTime: string
  /** Fin del último bloque del día. */
  endTime: string
}

export interface ClassOmission extends ExpectedClassDay {
  subjectId: string
  justified: boolean
  reason?: string
}

export interface ListExpectedDaysInput {
  blocks: OmissionScheduleBlock[]
  period: OmissionPeriod | null
  now: Date
  /** Recorta el rango a [from, to] (ambos 'YYYY-MM-DD', inclusivos). */
  from?: string
  to?: string
}

function addDaysIso(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

function dayOfWeekOfIso(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay()
}

/** 'HH:MM[:SS]' sin los segundos, para mostrar. */
export function formatBlockTime(time: string): string {
  return time.slice(0, 5)
}

/**
 * Días de clase esperados (vencidos, no festivos) de una materia, sin
 * mirar si hubo sesión. Ordenados de más antiguo a más reciente.
 */
export function listExpectedClassDays({
  blocks,
  period,
  now,
  from,
  to,
}: ListExpectedDaysInput): ExpectedClassDay[] {
  if (!period?.start_date || !period.end_date || blocks.length === 0) return []

  const today = bogotaCalendarDate(now)
  let first = period.start_date
  if (from && from > first) first = from
  let last = period.end_date
  if (to && to < last) last = to
  if (today < last) last = today

  const parsedBlocks = blocks
    .map((block) => ({
      block,
      start: parseTimeToMinutes(block.start_time),
      end: parseTimeToMinutes(block.end_time),
      createdAt: new Date(block.created_at).getTime(),
    }))
    .filter(
      (b): b is typeof b & { start: number; end: number } =>
        b.start !== null && b.end !== null && !Number.isNaN(b.createdAt)
    )
  if (parsedBlocks.length === 0) return []

  const days: ExpectedClassDay[] = []
  for (let date = first; date <= last; date = addDaysIso(date, 1)) {
    if (isColombianHoliday(date)) continue

    const dow = dayOfWeekOfIso(date)
    // Bloques de ese día que ya existían cuando la clase terminó.
    const active = parsedBlocks.filter(
      (b) => b.block.day_of_week === dow && bogotaInstant(date, b.end).getTime() > b.createdAt
    )
    if (active.length === 0) continue

    const lastEnd = Math.max(...active.map((b) => b.end))
    // Hoy: solo cuando ya terminó el último bloque.
    if (bogotaInstant(date, lastEnd).getTime() > now.getTime()) continue

    const opening = active.reduce((a, b) => (b.start < a.start ? b : a))
    const closing = active.reduce((a, b) => (b.end > a.end ? b : a))
    days.push({
      date,
      scheduleId: opening.block.id,
      startTime: opening.block.start_time,
      endTime: closing.block.end_time,
    })
  }
  return days
}

export interface FindOmissionsInput extends ListExpectedDaysInput {
  subjectId: string
  /** Sesiones de la materia en cualquier estado (activa, archivada, suspendida). */
  sessions: { date: string }[]
  /** Justificaciones ya presentadas por el profesor. */
  justifications?: { class_date: string; reason: string }[]
}

/**
 * Días de clase esperados SIN ninguna sesión ese día de Bogotá, con su
 * estado de justificación.
 */
export function findClassOmissions({
  subjectId,
  sessions,
  justifications = [],
  ...range
}: FindOmissionsInput): ClassOmission[] {
  const expected = listExpectedClassDays(range)
  if (expected.length === 0) return []

  const coveredDays = new Set(sessions.map((s) => bogotaCalendarDate(new Date(s.date))))
  const justificationByDate = new Map(justifications.map((j) => [j.class_date, j.reason]))

  return expected
    .filter((day) => !coveredDays.has(day.date))
    .map((day) => {
      const reason = justificationByDate.get(day.date)
      return {
        ...day,
        subjectId,
        justified: reason !== undefined,
        ...(reason !== undefined ? { reason } : {}),
      }
    })
}

export interface ClassStats {
  /** Días de clase esperados (vencidos, no festivos) en el rango. */
  scheduled: number
  /** Clases dictadas: sesiones activas del rango, incluidas reposiciones. */
  held: number
  /** Clases suspendidas (RF20) del rango. */
  suspended: number
  /** Días esperados sin ningún registro (justificados o no). */
  omitted: number
  /** De las omitidas, las que el profesor ya justificó. */
  omittedJustified: number
}

/**
 * Conteos por materia para un rango de fechas (insumo del reporte de
 * cumplimiento docente). `from`/`to` son 'YYYY-MM-DD' inclusivos.
 */
export function summarizeClassStats(
  input: Omit<FindOmissionsInput, 'sessions'> & {
    sessions: { date: string; is_active: boolean | null; suspended_at: string | null }[]
  }
): ClassStats {
  const { from, to } = input
  const inRange = (isoInstant: string) => {
    const day = bogotaCalendarDate(new Date(isoInstant))
    return (!from || day >= from) && (!to || day <= to)
  }

  const scheduled = listExpectedClassDays(input).length
  const omissions = findClassOmissions(input)

  let held = 0
  let suspended = 0
  for (const session of input.sessions) {
    if (!inRange(session.date)) continue
    if (session.suspended_at) suspended++
    else if (session.is_active !== false) held++
  }

  return {
    scheduled,
    held,
    suspended,
    omitted: omissions.length,
    omittedJustified: omissions.filter((o) => o.justified).length,
  }
}
