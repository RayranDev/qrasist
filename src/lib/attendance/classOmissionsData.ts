/**
 * I/O de la detección de omisiones (RF22): arma, con consultas acotadas y
 * paginadas, lo que necesita la lógica pura de classOmissions.ts. No es un
 * archivo 'use server': lo importan páginas del servidor y server actions.
 *
 * Qué materias entran: activas (is_active), con período asignado que tenga
 * fechas y con al menos un bloque de horario. El estado del período NO se
 * filtra -- una materia con fechas de período y horario se vigila aunque el
 * período no esté marcado como activo (en producción puede no haber ninguno
 * activo y el horario sigue siendo la fuente de verdad); lo que sí frena
 * el ruido es que solo se cuentan días ya vencidos y desde la creación de
 * cada bloque.
 *
 * Quién ve qué lo decide RLS (profesor: sus materias; ADMIN: todas), así
 * que se puede llamar con el cliente del usuario.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { bogotaInstant } from '@/lib/utils/bogotaDay'
import { bogotaCalendarDate, endOfBogotaDay } from '@/lib/utils/businessDays'
import {
  findClassOmissions,
  summarizeClassStats,
  type ClassOmission,
  type ClassStats,
  type OmissionPeriod,
  type OmissionScheduleBlock,
} from './classOmissions'

/** Cuántas materias por consulta `.in(...)`: mantiene corta la URL de PostgREST. */
const SUBJECT_CHUNK = 100

interface SubjectRow {
  id: string
  name: string
  code: string
  professor_id: string | null
  period: OmissionPeriod | OmissionPeriod[] | null
  professor: { name: string } | { name: string }[] | null
}

interface ScheduleRow extends OmissionScheduleBlock {
  subject_id: string
}

interface SessionRow {
  subject_id: string
  date: string
  is_active: boolean | null
  suspended_at: string | null
}

interface JustificationRow {
  subject_id: string
  class_date: string
  reason: string
}

export interface SubjectOmissionContext {
  subjectId: string
  subjectName: string
  subjectCode: string
  professorId: string | null
  professorName: string | null
  period: OmissionPeriod
  blocks: OmissionScheduleBlock[]
  sessions: { date: string; is_active: boolean | null; suspended_at: string | null }[]
  justifications: { class_date: string; reason: string }[]
}

export interface ClassOmissionItem extends ClassOmission {
  subjectName: string
  subjectCode: string
  professorId: string | null
  professorName: string | null
}

export interface SubjectClassStats extends ClassStats {
  subjectId: string
  subjectName: string
  subjectCode: string
  professorId: string | null
  professorName: string | null
}

export interface ClassOmissionQuery {
  /** Limita a estas materias; sin esto, todas las que RLS deja ver. */
  subjectIds?: string[]
  now?: Date
  /** 'YYYY-MM-DD' inclusivos, para recortar el rango. */
  from?: string
  to?: string
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function loadContexts(
  supabase: SupabaseClient,
  { subjectIds, now = new Date() }: ClassOmissionQuery
): Promise<SubjectOmissionContext[]> {
  if (subjectIds && subjectIds.length === 0) return []

  const { data: subjectRows } = await fetchAllRows<SubjectRow>((from, to) => {
    let query = supabase
      .from('subjects')
      .select(
        'id, name, code, professor_id, period:periods(start_date, end_date), professor:profiles(name)'
      )
      .eq('is_active', true)
      .not('period_id', 'is', null)
    if (subjectIds) query = query.in('id', subjectIds)
    return query.order('id').range(from, to)
  })

  const subjects = subjectRows
    .map((row) => ({ row, period: first(row.period) }))
    .filter(
      (s): s is { row: SubjectRow; period: OmissionPeriod } =>
        !!s.period?.start_date && !!s.period.end_date
    )
  if (subjects.length === 0) return []

  const ids = subjects.map((s) => s.row.id)

  // 1. Horarios: sin bloques no hay clases esperadas, ahorra el resto de consultas.
  const blocksBySubject = new Map<string, OmissionScheduleBlock[]>()
  for (const part of chunk(ids, SUBJECT_CHUNK)) {
    const { data } = await fetchAllRows<ScheduleRow>((from, to) =>
      supabase
        .from('subject_schedules')
        .select('id, subject_id, day_of_week, start_time, end_time, created_at')
        .in('subject_id', part)
        .order('id')
        .range(from, to)
    )
    for (const block of data) {
      blocksBySubject.set(block.subject_id, [
        ...(blocksBySubject.get(block.subject_id) || []),
        block,
      ])
    }
  }

  const scheduled = subjects.filter((s) => blocksBySubject.has(s.row.id))
  if (scheduled.length === 0) return []

  const scheduledIds = scheduled.map((s) => s.row.id)
  const periodBySubject = new Map(scheduled.map((s) => [s.row.id, s.period]))
  const today = bogotaCalendarDate(now)

  // 2. Sesiones (cualquier estado) y justificaciones, solo de esas materias.
  const sessionsBySubject = new Map<string, SessionRow[]>()
  const justificationsBySubject = new Map<string, JustificationRow[]>()
  for (const part of chunk(scheduledIds, SUBJECT_CHUNK)) {
    // Ventana de sesiones por lote: desde el inicio más temprano de los
    // períodos del lote hasta el menor entre el fin más tardío y hoy (las
    // sesiones posteriores a hoy no pueden cubrir un día ya vencido).
    const periods = part.map((id) => periodBySubject.get(id) as OmissionPeriod)
    const windowStart = periods
      .map((p) => p.start_date as string)
      .reduce((min, d) => (d < min ? d : min))
    const latestEnd = periods
      .map((p) => p.end_date as string)
      .reduce((max, d) => (d > max ? d : max))
    const sessionsSince = bogotaInstant(windowStart, 0).toISOString()
    const sessionsUntil = endOfBogotaDay(latestEnd < today ? latestEnd : today).toISOString()

    const [{ data: sessions }, { data: justifications }] = await Promise.all([
      fetchAllRows<SessionRow>((from, to) =>
        supabase
          .from('sessions')
          .select('id, subject_id, date, is_active, suspended_at')
          .in('subject_id', part)
          .gte('date', sessionsSince)
          .lte('date', sessionsUntil)
          .order('id')
          .range(from, to)
      ),
      fetchAllRows<JustificationRow>((from, to) =>
        supabase
          .from('class_omissions')
          .select('id, subject_id, class_date, reason')
          .in('subject_id', part)
          .order('id')
          .range(from, to)
      ),
    ])
    for (const s of sessions) {
      sessionsBySubject.set(s.subject_id, [...(sessionsBySubject.get(s.subject_id) || []), s])
    }
    for (const j of justifications) {
      justificationsBySubject.set(j.subject_id, [
        ...(justificationsBySubject.get(j.subject_id) || []),
        j,
      ])
    }
  }

  return scheduled.map(({ row, period }) => ({
    subjectId: row.id,
    subjectName: row.name,
    subjectCode: row.code,
    professorId: row.professor_id,
    professorName: first(row.professor)?.name ?? null,
    period,
    blocks: blocksBySubject.get(row.id) || [],
    sessions: sessionsBySubject.get(row.id) || [],
    justifications: justificationsBySubject.get(row.id) || [],
  }))
}

/**
 * Clases programadas sin ninguna sesión (justificadas o no), de más
 * reciente a más antigua. Vacío si no hay materias con período + horario.
 */
export async function fetchClassOmissions(
  supabase: SupabaseClient,
  query: ClassOmissionQuery = {}
): Promise<ClassOmissionItem[]> {
  const now = query.now ?? new Date()
  const contexts = await loadContexts(supabase, query)

  const items: ClassOmissionItem[] = []
  for (const ctx of contexts) {
    const omissions = findClassOmissions({
      subjectId: ctx.subjectId,
      blocks: ctx.blocks,
      period: ctx.period,
      sessions: ctx.sessions,
      justifications: ctx.justifications,
      now,
      from: query.from,
      to: query.to,
    })
    for (const omission of omissions) {
      items.push({
        ...omission,
        subjectName: ctx.subjectName,
        subjectCode: ctx.subjectCode,
        professorId: ctx.professorId,
        professorName: ctx.professorName,
      })
    }
  }

  return items.sort(
    (a, b) => b.date.localeCompare(a.date) || a.subjectName.localeCompare(b.subjectName)
  )
}

/**
 * Conteos por materia { scheduled, held, suspended, omitted,
 * omittedJustified } para un rango de fechas, con su profesor. Pensado para
 * el reporte de cumplimiento docente: agrupar por `professorId` suma las
 * materias de cada profesor.
 */
export async function fetchClassStats(
  supabase: SupabaseClient,
  query: ClassOmissionQuery = {}
): Promise<SubjectClassStats[]> {
  const now = query.now ?? new Date()
  const contexts = await loadContexts(supabase, query)

  return contexts.map((ctx) => ({
    subjectId: ctx.subjectId,
    subjectName: ctx.subjectName,
    subjectCode: ctx.subjectCode,
    professorId: ctx.professorId,
    professorName: ctx.professorName,
    ...summarizeClassStats({
      subjectId: ctx.subjectId,
      blocks: ctx.blocks,
      period: ctx.period,
      sessions: ctx.sessions,
      justifications: ctx.justifications,
      now,
      from: query.from,
      to: query.to,
    }),
  }))
}

/** Omisiones aún sin justificar, para el contador del dashboard del admin. */
export function countUnjustified(items: { justified: boolean }[]): number {
  return items.filter((item) => !item.justified).length
}
