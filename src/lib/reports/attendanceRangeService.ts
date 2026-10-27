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
import { buildRangeReport, type RangeReport } from './attendanceRangeReport'
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

export async function generateRangeReport(
  supabase: SupabaseClient,
  query: RangeReportQuery
): Promise<RangeReportResult> {
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

  // Materias a cargar: la pedida, o las que realmente tuvieron clase en el
  // rango (no se arrastran inscripciones de materias sin clases).
  let subjectIds: string[]
  if (query.subjectId) {
    if (careerSubjectIds && !careerSubjectIds.includes(query.subjectId)) {
      return fail(404, 'La materia no pertenece a la carrera elegida.')
    }
    subjectIds = [query.subjectId]
  } else {
    const batches = careerSubjectIds ? chunk(careerSubjectIds, SUBJECT_CHUNK) : [null]
    const found = new Set<string>()
    for (const batch of batches) {
      const result = await fetchAllRows<{ subject_id: string }>((from, to) => {
        let q = supabase
          .from('sessions')
          .select('subject_id')
          .gte('date', window.startIso)
          .lt('date', window.endIso)
        if (batch) q = q.in('subject_id', batch)
        return q.order('id').range(from, to)
      })
      for (const row of unwrapRows(result, 'las clases del rango')) found.add(row.subject_id)
    }
    subjectIds = [...found]
  }

  const data = await loadReportData(supabase, {
    subjectIds,
    activeOnly: true,
    dateRange: window,
  })
  if (data.subjects.length === 0) {
    return fail(404, 'No hay clases de materias activas en ese rango.')
  }

  const report = buildRangeReport({ ...data, from: query.from, to: query.to })
  if (report.summary.length === 0) {
    return fail(404, 'No hay clases registradas en ese rango.')
  }
  if (report.detail.length > MAX_RANGE_DETAIL_ROWS) {
    return fail(
      422,
      'El reporte es demasiado grande. Reduce el rango de fechas o filtra por carrera o materia.'
    )
  }

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
