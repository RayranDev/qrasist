/**
 * Ayuda a estimar `total_planned_sessions` a partir del horario semanal
 * real de una materia (subject_schedules) en vez de dejarlo como un
 * número adivinado a mano. Pura: el caller resuelve cuántos bloques
 * semanales tiene la materia y qué período (con sus fechas) está
 * seleccionado.
 *
 * El resultado sigue siendo editable/sobreescribible en el formulario
 * -- esto solo calcula un valor inicial razonable.
 */
export function computePlannedSessions(
  scheduleBlockCount: number,
  periodStartDate: string | null | undefined,
  periodEndDate: string | null | undefined
): number | null {
  if (scheduleBlockCount <= 0 || !periodStartDate || !periodEndDate) return null

  const start = new Date(periodStartDate)
  const end = new Date(periodEndDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null

  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
  const weeks = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_WEEK))

  return scheduleBlockCount * weeks
}
