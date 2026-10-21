/**
 * Adaptadores para mostrar el desglose por corte (cutsBreakdown.ts) en
 * pantallas de estudiante/profesor: normalizan las filas de period_cuts,
 * descartan lo inutilizable (período con fechas invertidas, cortes
 * inválidos) y devuelven un arreglo vacío cuando no hay nada que mostrar,
 * para que la UI simplemente oculte la sección.
 *
 * Todo es informativo: el veredicto de pérdida por fallas sigue siendo
 * semestral (computeAttendanceSummary).
 */
import {
  computeCutsBreakdown,
  type CutBreakdown,
  type CutInput,
  type SessionAttendance,
} from './cutsBreakdown'

/** Fila de period_cuts tal como llega de Supabase. */
export interface PeriodCutRow {
  id: string
  name: string
  start_date: string
  end_date: string
  sequence: number
}

export interface PeriodDates {
  start_date: string | null
  end_date: string | null
}

/**
 * Cortes utilizables de un período: ninguno si el período tiene fechas
 * invertidas (inicio posterior al fin: datos mal cargados, los cortes
 * colgados de él no tienen sentido) y se descartan los cortes con rango
 * inválido. Un período sin fechas conserva sus cortes.
 */
export function usableCuts(
  period: PeriodDates | null | undefined,
  rows: PeriodCutRow[] | null | undefined
): CutInput[] {
  if (period?.start_date && period.end_date && period.start_date > period.end_date) return []
  return (rows || [])
    .filter((r) => r.start_date && r.end_date && r.start_date <= r.end_date)
    .map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      sequence: r.sequence,
    }))
}

export interface CutBreakdownInput {
  cuts: CutInput[]
  /** Sesiones de la materia en cualquier estado; solo las activas cuentan como dictadas. */
  sessions: { id: string; date: string; is_active: boolean | null }[]
  /** Asistencias del estudiante, por id de sesión. */
  attendanceBySessionId: Map<string, SessionAttendance>
  /** Sesiones con justificación APROBADA del estudiante. */
  justifiedSessionIds: Set<string>
}

/**
 * Desglose por corte de un estudiante en una materia. Vacío si el período
 * no tiene cortes utilizables.
 */
export function buildStudentCutBreakdown({
  cuts,
  sessions,
  attendanceBySessionId,
  justifiedSessionIds,
}: CutBreakdownInput): CutBreakdown[] {
  if (cuts.length === 0) return []
  const held = sessions
    .filter((s) => s.is_active !== false)
    .map((s) => ({ id: s.id, date: s.date }))
  return computeCutsBreakdown(cuts, held, attendanceBySessionId, justifiedSessionIds)
}

export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

/** "Corte 1: 80% (4/5)" -- "sin clases dictadas" si el corte aún no tiene sesiones. */
export function formatCutLine(cut: CutBreakdown): string {
  if (cut.sessionsHeld === 0) return `${cut.name}: sin clases dictadas`
  return `${cut.name}: ${formatPercent(cut.percentage)} (${cut.attended}/${cut.sessionsHeld})`
}
