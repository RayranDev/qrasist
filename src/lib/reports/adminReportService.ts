/**
 * Orquestación del reporte de coordinación: valida período/corte/filtros,
 * carga los datos y arma el reporte. Compartido por los formatos (Excel,
 * PDF y resumen JSON del tablero). No decide permisos: el route handler
 * ya verificó que quien llama es ADMIN activo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchClassStats } from '@/lib/attendance/classOmissionsData'
import { usableCuts, type PeriodCutRow } from '@/lib/attendance/cutsView'
import type { AttendanceStatus } from '@/lib/utils/attendancePolicy'
import {
  buildAttendanceReport,
  resolveReportRange,
  type AttendanceReport,
  type ReportClassStatsInput,
  type ReportFilters,
} from './attendanceReport'
import { fetchAllRows, unwrapRows } from '@/lib/supabase/fetchAll'
import { loadReportData } from './attendanceReportData'
import { formatDateEs } from './pdf/format'

const STATUS_VALUES: AttendanceStatus[] = ['NORMAL', 'WARNING', 'FAILED_ATTENDANCE']
const STATUS_FILTER_LABELS: Record<AttendanceStatus, string> = {
  NORMAL: 'Normal',
  WARNING: 'En riesgo',
  FAILED_ATTENDANCE: 'Perdida por fallas',
}
const STATS_CHUNK = 100

export interface AdminReportParams {
  periodId: string
  cutId?: string | null
  subjectId?: string | null
  professorId?: string | null
  status?: string | null
}

export type AdminReportResult =
  | {
      ok: true
      report: AttendanceReport
      period: { id: string; name: string }
      scopeLabel: string
      filtersLabel: string
    }
  | { ok: false; status: number; error: string }

function fail(status: number, error: string): AdminReportResult {
  return { ok: false, status, error }
}

export async function generateAdminReport(
  supabase: SupabaseClient,
  params: AdminReportParams
): Promise<AdminReportResult> {
  if (params.status && !STATUS_VALUES.includes(params.status as AttendanceStatus)) {
    return fail(400, 'Estado no válido.')
  }

  const { data: period, error: periodError } = await supabase
    .from('periods')
    .select('id, name, start_date, end_date')
    .eq('id', params.periodId)
    .maybeSingle()
  if (periodError) throw new Error('No se pudo cargar el período.', { cause: periodError })
  if (!period) return fail(404, 'Período no encontrado.')

  const { data: cutRows, error: cutsError } = await supabase
    .from('period_cuts')
    .select('id, name, start_date, end_date, sequence')
    .eq('period_id', period.id)
    .order('sequence')
  if (cutsError) throw new Error('No se pudieron cargar los cortes.', { cause: cutsError })
  const cuts = usableCuts(period, (cutRows || []) as PeriodCutRow[])

  const range = resolveReportRange(cuts, params.cutId)
  if (!range) return fail(400, 'El corte no pertenece a este período.')

  const filters: ReportFilters = {
    subjectId: params.subjectId || undefined,
    professorId: params.professorId || undefined,
    status: (params.status as AttendanceStatus | null | undefined) || undefined,
  }

  // Las materias archivadas quedan fuera del reporte (igual que en el
  // historial del estudiante): no tienen horario vigente ni dictan clase.
  // Con filtro de materia o docente la carga se acota a esos ids en lugar
  // de traer todo el período y filtrar en memoria.
  let scopedSubjectIds: string[] | null = null
  if (filters.subjectId || filters.professorId) {
    const idsResult = await fetchAllRows<{ id: string }>((from, to) => {
      let q = supabase
        .from('subjects')
        .select('id')
        .eq('period_id', period.id)
        .eq('is_active', true)
      if (filters.subjectId) q = q.eq('id', filters.subjectId)
      if (filters.professorId) q = q.eq('professor_id', filters.professorId)
      return q.order('id').range(from, to)
    })
    scopedSubjectIds = unwrapRows(idsResult, 'las materias del filtro').map((r) => r.id)
  }

  const data =
    scopedSubjectIds === null
      ? await loadReportData(supabase, { periodId: period.id, activeOnly: true })
      : await loadReportData(supabase, { subjectIds: scopedSubjectIds, activeOnly: true })
  if (data.subjects.length === 0) {
    return fail(
      404,
      scopedSubjectIds === null
        ? 'Este período no tiene materias asociadas.'
        : 'No hay materias que coincidan con los filtros en este período.'
    )
  }

  // Cumplimiento docente por lotes de materias (la URL de PostgREST no
  // admite listas de ids ilimitadas).
  const classStats: ReportClassStatsInput[] = []
  const subjectIds = data.subjects
    .filter(
      (s) =>
        (!filters.subjectId || s.id === filters.subjectId) &&
        (!filters.professorId || s.professorId === filters.professorId)
    )
    .map((s) => s.id)
  for (let i = 0; i < subjectIds.length; i += STATS_CHUNK) {
    const stats = await fetchClassStats(supabase, {
      subjectIds: subjectIds.slice(i, i + STATS_CHUNK),
      from: range.from ?? undefined,
      to: range.to ?? undefined,
    })
    classStats.push(...stats)
  }

  const report = buildAttendanceReport({ ...data, classStats, range, filters })

  const scopeLabel = range.cutId
    ? `${range.label} (${formatDateEs(range.from as string)} - ${formatDateEs(range.to as string)})`
    : range.label

  const filterParts: string[] = []
  if (filters.subjectId) {
    const s = data.subjects.find((x) => x.id === filters.subjectId)
    filterParts.push(`Materia: ${s ? `${s.code} ${s.name}` : filters.subjectId}`)
  }
  if (filters.professorId) {
    const s = data.subjects.find((x) => x.professorId === filters.professorId)
    filterParts.push(`Docente: ${s?.professorName ?? filters.professorId}`)
  }
  if (filters.status) filterParts.push(`Estado: ${STATUS_FILTER_LABELS[filters.status]}`)

  return {
    ok: true,
    report,
    period: { id: period.id, name: period.name },
    scopeLabel,
    filtersLabel: filterParts.join(' · '),
  }
}
