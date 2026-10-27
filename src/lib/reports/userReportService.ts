/**
 * Orquestación del reporte de asistencia de UN usuario (estudiante o docente)
 * pedido por coordinación. No decide permisos de quien llama: el route handler
 * ya verificó que es ADMIN activo. Sí valida al usuario reportado: debe
 * existir, estar activo y ser estudiante o docente.
 *
 * Estudiante: historial por materia con ausencias y porcentaje
 * (generateStudentReport). Docente: clases por materia (dictadas, suspendidas,
 * sin registrar) y asistentes por clase (professorUserReport.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { dayBounds } from '@/lib/attendance/calendarGrid'
import { fetchClassStats, fetchClassStatsByWindow } from '@/lib/attendance/classOmissionsData'
import { fetchAllRows, unwrapRows } from '@/lib/supabase/fetchAll'
import type { ReportClassStatsInput, StudentSubjectHistory } from './attendanceReport'
import { loadReportData } from './attendanceReportData'
import { buildProfessorUserReport, type ProfessorUserReport } from './professorUserReport'
import { formatDateEs } from './pdf/format'
import { generateStudentReport } from './studentReportService'

const STATS_CHUNK = 100

export interface UserReportRange {
  from: string
  to: string
}

export type UserReportResult =
  | {
      ok: true
      kind: 'student'
      name: string
      code: string | null
      history: StudentSubjectHistory[]
      scopeLabel: string
    }
  | {
      ok: true
      kind: 'professor'
      name: string
      report: ProfessorUserReport
      scopeLabel: string
    }
  | { ok: false; status: number; error: string }

function fail(status: number, error: string): UserReportResult {
  return { ok: false, status, error }
}

export function describeRange(range: UserReportRange | null): string {
  if (!range) return 'Todo el historial'
  return range.from === range.to
    ? formatDateEs(range.from)
    : `${formatDateEs(range.from)} - ${formatDateEs(range.to)}`
}

export async function generateUserReport(
  supabase: SupabaseClient,
  params: { userId: string; range: UserReportRange | null }
): Promise<UserReportResult> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, role, is_active, student_code')
    .eq('id', params.userId)
    .maybeSingle()
  if (profileError) throw new Error('No se pudo cargar el perfil.', { cause: profileError })
  if (!profile || profile.is_active === false) {
    return fail(404, 'Usuario no encontrado o inactivo.')
  }
  if (profile.role !== 'STUDENT' && profile.role !== 'PROFESSOR') {
    return fail(400, 'Solo hay reporte de asistencia para estudiantes y docentes.')
  }

  const scopeLabel = describeRange(params.range)

  if (profile.role === 'STUDENT') {
    const result = await generateStudentReport(supabase, profile.id as string, {
      range: params.range ?? undefined,
    })
    if (!result.ok) return result
    return {
      ok: true,
      kind: 'student',
      name: result.report.studentName,
      code: result.report.studentCode,
      history: result.report.history,
      scopeLabel,
    }
  }

  // Docente: sus materias vigentes.
  const subjectsResult = await fetchAllRows<{ id: string }>((from, to) =>
    supabase
      .from('subjects')
      .select('id')
      .eq('professor_id', profile.id)
      .eq('is_active', true)
      .order('id')
      .range(from, to)
  )
  const subjectIds = unwrapRows(subjectsResult, 'las materias del docente').map((s) => s.id)
  if (subjectIds.length === 0) {
    return fail(404, 'Este docente no tiene materias activas asignadas.')
  }

  const data = await loadReportData(supabase, {
    subjectIds,
    activeOnly: true,
    // buildProfessorUserReport no usa justificaciones: se evita la consulta.
    skipJustifications: true,
    // El desglose por corte es semestral: con rango se cargan también las
    // clases de los cortes (acotado al período, no a todo el historial).
    widenToCuts: true,
    dateRange: params.range
      ? {
          startIso: dayBounds(params.range.from).startIso,
          endIso: dayBounds(params.range.to).endIso,
        }
      : undefined,
  })

  const classStats: ReportClassStatsInput[] = []
  const loadedIds = data.subjects.map((s) => s.id)
  for (let i = 0; i < loadedIds.length; i += STATS_CHUNK) {
    classStats.push(
      ...(await fetchClassStats(supabase, {
        subjectIds: loadedIds.slice(i, i + STATS_CHUNK),
        from: params.range?.from,
        to: params.range?.to,
      }))
    )
  }

  // Cumplimiento por corte (semestral) de las materias que tienen cortes. Las
  // consultas se hacen una vez por lote de materias y los cortes solo
  // recalculan conteos (fetchClassStatsByWindow).
  const cutsById = new Map(data.subjects.flatMap((s) => s.cuts).map((c) => [c.id, c]))
  const cutStats = new Map<string, ReportClassStatsInput[]>()
  const idsWithCuts = data.subjects.filter((s) => s.cuts.length > 0).map((s) => s.id)
  for (let i = 0; i < idsWithCuts.length; i += STATS_CHUNK) {
    const batch = idsWithCuts.slice(i, i + STATS_CHUNK)
    const batchCuts = [...cutsById.values()].filter((cut) =>
      data.subjects.some((s) => batch.includes(s.id) && s.cuts.some((c) => c.id === cut.id))
    )
    const byWindow = await fetchClassStatsByWindow(supabase, {
      subjectIds: batch,
      windows: batchCuts.map((cut) => ({ key: cut.id, from: cut.startDate, to: cut.endDate })),
    })
    for (const cut of batchCuts) {
      const subjectIdsWithCut = new Set(
        data.subjects.filter((s) => s.cuts.some((c) => c.id === cut.id)).map((s) => s.id)
      )
      const rows = (byWindow.get(cut.id) ?? []).filter((r) => subjectIdsWithCut.has(r.subjectId))
      cutStats.set(cut.id, [...(cutStats.get(cut.id) ?? []), ...rows])
    }
  }
  const cutClassStats = [...cutStats].map(([cutId, stats]) => ({ cutId, stats }))

  return {
    ok: true,
    kind: 'professor',
    name: profile.name as string,
    report: buildProfessorUserReport({
      subjects: data.subjects,
      sessions: data.sessions,
      enrollments: data.enrollments,
      attendances: data.attendances,
      classStats,
      cutClassStats,
      from: params.range?.from ?? null,
      to: params.range?.to ?? null,
      held: data.held,
    }),
    scopeLabel,
  }
}
