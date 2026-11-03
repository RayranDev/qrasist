/** URL de descarga del reporte de un usuario (ver reports/user/route.ts). */
export function userReportUrl(params: {
  userId: string
  format: 'xlsx' | 'pdf'
  /** 'YYYY-MM-DD'; ambas o ninguna. */
  from?: string
  to?: string
  /** Agrega IP y ubicación (solo Excel de estudiantes; queda en la bitácora). */
  includeCapture?: boolean
}): string {
  const qs = new URLSearchParams({ userId: params.userId, format: params.format })
  if (params.from && params.to) {
    qs.set('from', params.from)
    qs.set('to', params.to)
  }
  if (params.includeCapture) qs.set('includeCapture', '1')
  return `/admin/reports/user?${qs.toString()}`
}
