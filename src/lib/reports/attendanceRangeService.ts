/**
 * Orquestación del reporte de asistencia por rango de fechas: resuelve el
 * alcance (materia, carrera o todas las que tuvieron clase), carga SOLO lo
 * que cae en el rango con loadReportData y arma el reporte. No decide
 * permisos: el route handler ya verificó que quien llama es ADMIN activo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { dayBounds } from '@/lib/attendance/calendarGrid'
import { fetchAllRows, unwrapRows } from '@/lib/supabase/fetchAll'
import { loadReportData } from './attendanceReportData'
import {
  buildRangeReport,
  RangeReportTooLargeError,
  type RangeReport,
} from './attendanceRangeReport'
import { formatDateEs } from './pdf/format'

/** Cuántas materias por consulta `.in(...)`: mantiene corta la URL de PostgREST. */
const SUBJECT_CHUNK = 100

/** Tope de filas del detalle: más allá el archivo deja de ser útil y pesa demasiado. */
export const MAX_RANGE_DETAIL_ROWS = 100_000

export interface RangeReportQuery {
  from: string
  to: string
  careerId?: string
  subjectId?: string
}

export type RangeReportResult =
  | { ok: true; report: RangeReport; scopeLabel: string; filtersLabel: string }
  | { ok: false; status: number; error: string }

function fail(status: number, error: string): RangeReportResult {
  return { ok: false, status, error }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const TOO_LARGE_MESSAGE =
  'El reporte es demasiado grande. Reduce el rango de fechas o filtra por carrera o materia.'

export interface RangeReportOptions {
  /** Tope de filas del detalle; por defecto MAX_RANGE_DETAIL_ROWS. */
  maxDetailRows?: number
}

export async function generateRangeReport(
  supabase: SupabaseClient,
  query: RangeReportQuery,
  options: RangeReportOptions = {}
): Promise<RangeReportResult> {
  const maxDetailRows = options.maxDetailRows ?? MAX_RANGE_DETAIL_ROWS
  const window = {
    startIso: dayBounds(query.from).startIso,
    endIso: dayBounds(query.to).endIso,
  }

  // Carrera: sus materias vigentes (y el nombre, para la etiqueta del archivo).
  let careerName: string | null = null
  let careerSubjectIds: string[] | null = null
  if (query.careerId) {
    const { data: career, error } = await supabase
      .from('careers')
      .select('name')
      .eq('id', query.careerId)
      .maybeSingle()
    if (error) throw new Error('No se pudo cargar la carrera.', { cause: error })
    if (!career) return fail(404, 'Carrera no encontrada.')
    careerName = career.name as string

    const links = await fetchAllRows<{ subject_id: string }>((from, to) =>
      supabase
        .from('subject_careers')
        .select('subject_id')
        .eq('career_id', query.careerId as string)
        .eq('is_active', true)
        .order('subject_id')
        .range(from, to)
    )
    careerSubjectIds = unwrapRows(links, 'las materias de la carrera').map((l) => l.subject_id)
  }

  if (query.subjectId && careerSubjectIds && !careerSubjectIds.includes(query.subjectId)) {
    return fail(404, 'La materia no pertenece a la carrera elegida.')
  }

  // Paso liviano (solo conteos, sin asistencias ni justificaciones): cuántas
  // clases vigentes tuvo cada materia en el rango. Descubre las materias con
  // clase y permite estimar el tamaño del detalle ANTES de cargar nada pesado.
  const candidateBatches = query.subjectId
    ? [[query.subjectId]]
    : careerSubjectIds
      ? chunk(careerSubjectIds, SUBJECT_CHUNK)
      : [null]
  const sessionsBySubject = new Map<string, number>()
  for (const batch of candidateBatches) {
    const result = await fetchAllRows<{
      subject_id: string
      is_active: boolean | null
      suspended_at: string | null
    }>((from, to) => {
      let q = supabase
        .from('sessions')
        .select('subject_id, is_active, suspended_at')
        .gte('date', window.startIso)
        .lt('date', window.endIso)
      if (batch) q = q.in('subject_id', batch)
      return q.order('id').range(from, to)
    })
    for (const row of unwrapRows(result, 'las clases del rango')) {
      // Archivada (inactiva sin suspensión) no es una clase vigente.
      if (!row.suspended_at && row.is_active === false) continue
      sessionsBySubject.set(row.subject_id, (sessionsBySubject.get(row.subject_id) || 0) + 1)
    }
  }

  // Solo materias activas (igual que el resto de los reportes).
  const withSessions = [...sessionsBySubject.keys()]
  const subjectIds: string[] = []
  for (const part of chunk(withSessions, SUBJECT_CHUNK)) {
    const result = await fetchAllRows<{ id: string }>((from, to) =>
      supabase
        .from('subjects')
        .select('id')
        .in('id', part)
        .eq('is_active', true)
        .order('id')
        .range(from, to)
    )
    subjectIds.push(...unwrapRows(result, 'las materias del rango').map((r) => r.id))
  }
  if (subjectIds.length === 0) {
    return fail(404, 'No hay clases de materias activas en ese rango.')
  }

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
    for (const row of unwrapRows(result, 'los inscritos del rango')) {
      enrolledBySubject.set(row.subject_id, (enrolledBySubject.get(row.subject_id) || 0) + 1)
    }
  }
  // Cota superior del detalle: una fila por inscrito y clase vigente.
  const estimatedRows = subjectIds.reduce(
    (sum, id) => sum + (enrolledBySubject.get(id) || 0) * (sessionsBySubject.get(id) || 0),
    0
  )
  if (estimatedRows > maxDetailRows) return fail(422, TOO_LARGE_MESSAGE)

  const data = await loadReportData(supabase, {
    subjectIds,
    activeOnly: true,
    dateRange: window,
  })
  if (data.subjects.length === 0) {
    return fail(404, 'No hay clases de materias activas en ese rango.')
  }

  let report: RangeReport
  try {
    report = buildRangeReport({ ...data, from: query.from, to: query.to, maxDetailRows })
  } catch (error) {
    if (error instanceof RangeReportTooLargeError) return fail(422, TOO_LARGE_MESSAGE)
    throw error
  }
  if (report.summary.length === 0) {
    return fail(404, 'No hay clases registradas en ese rango.')
  }
  // Red de seguridad: el tope también se aplica al resultado final.
  if (report.detail.length > maxDetailRows) return fail(422, TOO_LARGE_MESSAGE)

  const filterParts: string[] = []
  if (careerName) filterParts.push(`Carrera: ${careerName}`)
  if (query.subjectId) {
    const s = data.subjects[0]
    filterParts.push(`Materia: ${s.code} ${s.name}`)
  }

  return {
    ok: true,
    report,
    scopeLabel:
      query.from === query.to
        ? formatDateEs(query.from)
        : `${formatDateEs(query.from)} - ${formatDateEs(query.to)}`,
    filtersLabel: filterParts.join(' · '),
  }
}
