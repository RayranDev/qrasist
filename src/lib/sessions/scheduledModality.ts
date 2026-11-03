/**
 * Modalidad que el horario semanal de la materia asigna a un día. Sirve para
 * detectar cuando el profesor abre la clase con otra modalidad (por ejemplo,
 * pasarla a virtual a última hora): es legítimo, pero deja rastro porque la
 * modalidad decide si se captura IP y ubicación.
 */
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import { dayOfWeekOf } from './suspension'

export type ScheduledModality = 'PRESENCIAL' | 'VIRTUAL'

export interface ScheduleModalityBlock {
  day_of_week: number
  modality?: string | null
}

/**
 * null si ese día no hay bloques o si sus bloques mezclan modalidades (no hay
 * una modalidad "del horario" que comparar).
 */
export function scheduledModalityForDay(
  blocks: ScheduleModalityBlock[],
  date: Date
): ScheduledModality | null {
  // Día de la semana en Bogotá (0 = domingo ... 6 = sábado, igual que day_of_week).
  const today = dayOfWeekOf(bogotaCalendarDate(date))
  const modalities = new Set(
    blocks
      .filter((b) => b.day_of_week === today)
      .map((b) => b.modality)
      .filter((m): m is ScheduledModality => m === 'PRESENCIAL' || m === 'VIRTUAL')
  )
  return modalities.size === 1 ? [...modalities][0] : null
}
