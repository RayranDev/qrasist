// Límites del día calendario en hora de Colombia (America/Bogota, UTC-5
// fijo, sin horario de verano). Se usa para acotar consultas de "hoy" en
// JS del lado del servidor de forma consistente con la función SQL
// public.attendance_day() (ver migración 007), que aplica el mismo
// offset para el índice único de "una asistencia por materia por día".
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000

export function getBogotaDayRange(reference: Date = new Date()): { start: Date; end: Date } {
  const bogotaNow = new Date(reference.getTime() - BOGOTA_OFFSET_MS)
  const y = bogotaNow.getUTCFullYear()
  const m = bogotaNow.getUTCMonth()
  const d = bogotaNow.getUTCDate()

  return {
    start: new Date(Date.UTC(y, m, d, 0, 0, 0, 0) + BOGOTA_OFFSET_MS),
    end: new Date(Date.UTC(y, m, d, 23, 59, 59, 999) + BOGOTA_OFFSET_MS),
  }
}
