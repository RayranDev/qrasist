/**
 * I/O del calendario de /admin/attendance. Todas las consultas están
 * acotadas al mes (o al día) visible y paginadas con fetchAllRows: nunca se
 * lee una tabla completa. Quién ve qué lo decide RLS (la página ya exige
 * ADMIN), así que se llama con el cliente del usuario.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, unwrapRows } from '@/lib/supabase/fetchAll'
import { isCalendarClass, type CalendarSessionInput } from './calendarGrid'

/** Cuántas materias por consulta `.in(...)`: mantiene corta la URL de PostgREST. */
const SUBJECT_CHUNK = 100

export interface CalendarScope {
  /** Una materia concreta... */
  subjectId?: string
  /** ...o las de una carrera (ids ya resueltos por la página). */
  careerSubjectIds?: string[]
}

export interface DaySession {
  id: string
  subjectId: string
  subjectName: string
  subjectCode: string
  /** timestamptz ISO */
  date: string
  modality: 'PRESENCIAL' | 'VIRTUAL' | null
  isMakeup: boolean
  isActive: boolean | null
  expiresAt: string | null
  suspendedAt: string | null
  suspensionReason: string | null
  /** Asistencias registradas en la clase. */
  registered: number
  /** Inscritos de la materia. */
  enrolled: number
}

interface MonthSessionRow {
  date: string
  is_active: boolean | null
  suspended_at: string | null
  subjects: { is_active: boolean | null } | { is_active: boolean | null }[] | null
}

interface DaySessionRow {
  id: string
  subject_id: string
  date: string
  modality: 'PRESENCIAL' | 'VIRTUAL' | null
  is_makeup: boolean | null
  is_active: boolean | null
  expires_at: string | null
  suspended_at: string | null
  suspension_reason: string | null
  attendances: { count: number }[] | null
  subjects:
    | { name: string; code: string; is_active: boolean | null }
    | { name: string; code: string; is_active: boolean | null }[]
    | null
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Listas de ids a consultar según el alcance: null = sin filtro de materia. */
function subjectIdBatches(scope: CalendarScope): string[][] | null {
  if (scope.subjectId) return [[scope.subjectId]]
  if (scope.careerSubjectIds) return chunk(scope.careerSubjectIds, SUBJECT_CHUNK)
  return null
}

/**
 * Sesiones (solo las columnas que hacen falta para los contadores) cuya fecha
 * cae en [startIso, endIso). Mismo alcance que los reportes descargables: solo
 * materias activas (inner join filtrado) y sin sesiones archivadas (ver
 * isCalendarClass). Con alcance de carrera sin materias devuelve [].
 */
export async function fetchMonthSessions(
  supabase: SupabaseClient,
  range: { startIso: string; endIso: string },
  scope: CalendarScope
): Promise<CalendarSessionInput[]> {
  const batches = subjectIdBatches(scope) ?? [null]
  const out: CalendarSessionInput[] = []
  for (const batch of batches) {
    const result = await fetchAllRows<MonthSessionRow>((from, to) => {
      let q = supabase
        .from('sessions')
        .select('date, is_active, suspended_at, subjects!inner(is_active)')
        .eq('subjects.is_active', true)
        .gte('date', range.startIso)
        .lt('date', range.endIso)
      if (batch) q = q.in('subject_id', batch)
      return q.order('date').order('id').range(from, to)
    })
    for (const row of unwrapRows(result, 'las clases del mes')) {
      const session: CalendarSessionInput = {
        date: row.date,
        isActive: row.is_active,
        suspendedAt: row.suspended_at,
        subjectActive: firstOf(row.subjects)?.is_active ?? null,
      }
      if (isCalendarClass(session)) out.push(session)
    }
  }
  return out
}

/**
 * Clases de un día con su materia, asistencias registradas e inscritos, con la
 * misma regla que las celdas del mes (isCalendarClass: materias activas, sin
 * archivadas). Los inscritos se cuentan solo para las materias con clase ese día.
 */
export async function fetchDaySessions(
  supabase: SupabaseClient,
  range: { startIso: string; endIso: string },
  scope: CalendarScope
): Promise<DaySession[]> {
  const batches = subjectIdBatches(scope) ?? [null]
  const rows: DaySessionRow[] = []
  for (const batch of batches) {
    const result = await fetchAllRows<DaySessionRow>((from, to) => {
      let q = supabase
        .from('sessions')
        .select(
          'id, subject_id, date, modality, is_makeup, is_active, expires_at, suspended_at, suspension_reason, attendances(count), subjects!inner(name, code, is_active)'
        )
        .eq('subjects.is_active', true)
        .gte('date', range.startIso)
        .lt('date', range.endIso)
      if (batch) q = q.in('subject_id', batch)
      return q.order('date').order('id').range(from, to)
    })
    rows.push(
      ...unwrapRows(result, 'las clases del día').filter((r) =>
        isCalendarClass({
          isActive: r.is_active,
          suspendedAt: r.suspended_at,
          subjectActive: firstOf(r.subjects)?.is_active ?? null,
        })
      )
    )
  }

  const subjectIds = [...new Set(rows.map((r) => r.subject_id))]
  const enrolledBySubject = new Map<string, number>()
  for (const part of chunk(subjectIds, SUBJECT_CHUNK)) {
    const result = await fetchAllRows<{ subject_id: string }>((from, to) =>
      supabase
        .from('enrollments')
        .select('subject_id')
        .in('subject_id', part)
        .order('id')
        .range(from, to)
    )
    for (const e of unwrapRows(result, 'los inscritos de las materias')) {
      enrolledBySubject.set(e.subject_id, (enrolledBySubject.get(e.subject_id) || 0) + 1)
    }
  }

  return rows
    .map((r): DaySession => {
      const subject = firstOf(r.subjects)
      return {
        id: r.id,
        subjectId: r.subject_id,
        subjectName: subject?.name ?? 'Materia',
        subjectCode: subject?.code ?? '',
        date: r.date,
        modality: r.modality,
        isMakeup: !!r.is_makeup,
        isActive: r.is_active,
        expiresAt: r.expires_at,
        suspendedAt: r.suspended_at,
        suspensionReason: r.suspension_reason,
        registered: r.attendances?.[0]?.count ?? 0,
        enrolled: enrolledBySubject.get(r.subject_id) ?? 0,
      }
    })
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.subjectName.localeCompare(b.subjectName, 'es')
    )
}
