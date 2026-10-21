/**
 * Formato de fechas, porcentajes y estados para los reportes (PDF y Excel).
 * Todo en hora de Bogotá, sin depender de la zona horaria del servidor.
 */
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import { formatBogotaDateTime } from '@/lib/utils/bogotaDay'
import type { AttendanceStatus } from '@/lib/utils/attendancePolicy'
import type { HistoryEntryState } from '@/lib/reports/attendanceReport'
import type { PdfTone } from './pdfDocument'

/** 'YYYY-MM-DD' o timestamptz ISO -> 'dd/MM/yyyy' (día civil de Bogotá). */
export function formatDateEs(value: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : bogotaCalendarDate(new Date(value))
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

/** Momento de generación del reporte: '20 oct 2026, 3:45 p. m.' (Bogotá). */
export function formatGeneratedAt(now: Date = new Date()): string {
  return formatBogotaDateTime(now.toISOString())
}

/** 82.5 -> '82,5%'; null -> '---'. */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '---'
  return `${String(value).replace('.', ',')}%`
}

export function statusTone(status: AttendanceStatus): PdfTone {
  if (status === 'FAILED_ATTENDANCE') return 'danger'
  if (status === 'WARNING') return 'warning'
  return 'success'
}

export const HISTORY_STATE_LABELS: Record<HistoryEntryState, string> = {
  PRESENT: 'Presente',
  LATE: 'Tarde',
  JUSTIFIED: 'Justificada',
  ABSENT: 'Falta',
  SUSPENDED: 'Suspendida',
}

export const HISTORY_STATE_TONES: Record<HistoryEntryState, PdfTone> = {
  PRESENT: 'success',
  LATE: 'warning',
  JUSTIFIED: 'info',
  ABSENT: 'danger',
  SUSPENDED: 'neutral',
}

/** Nombre de archivo seguro para Content-Disposition. */
export function safeFileName(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'reporte'
  )
}

/** Nota al pie de las "faltas contadas" en los reportes (PDF y Excel). */
export const COUNTED_ABSENCES_NOTE =
  'Las faltas contadas descuentan las clases justificadas y suman la penalización por tardanzas (cada N tardanzas cuentan como una falta, según la política de la materia). Esa penalización se calcula sobre el alcance elegido, por lo que las faltas de cada corte no tienen por qué sumar las del semestre.'
