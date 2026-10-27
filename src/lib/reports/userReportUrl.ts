/** URL de descarga del reporte de un usuario (ver reports/user/route.ts). */
export function userReportUrl(params: {
  userId: string
  format: 'xlsx' | 'pdf'
  /** 'YYYY-MM-DD'; ambas o ninguna. */
  from?: string
  to?: string
}): string {
  const qs = new URLSearchParams({ userId: params.userId, format: params.format })
  if (params.from && params.to) {
    qs.set('from', params.from)
    qs.set('to', params.to)
  }
  return `/admin/reports/user?${qs.toString()}`
}
