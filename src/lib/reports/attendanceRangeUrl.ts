/** URL de descarga del reporte de asistencia por rango (ver attendance-range/route.ts). */
export function attendanceRangeUrl(params: {
  /** 'YYYY-MM-DD' (día civil de Bogotá), inclusivo. */
  from: string
  to: string
  careerId?: string
  subjectId?: string
  /** Agrega IP y ubicación al detalle (coordinación; queda en la bitácora). */
  includeCapture?: boolean
}): string {
  const qs = new URLSearchParams({ from: params.from, to: params.to, format: 'xlsx' })
  if (params.careerId) qs.set('careerId', params.careerId)
  if (params.subjectId) qs.set('subjectId', params.subjectId)
  if (params.includeCapture) qs.set('includeCapture', '1')
  return `/admin/reports/attendance-range?${qs.toString()}`
}
