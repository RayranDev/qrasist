/**
 * URL de /admin/attendance. El estado de la vista (lista o calendario, mes,
 * día, filtros y clase abierta) vive entero en la URL para que cada enlace
 * sea navegable desde el servidor y compartible.
 */
export interface AttendanceHrefParams {
  view?: 'list' | 'calendar'
  /** 'YYYY-MM' (solo calendario) */
  month?: string
  /** 'YYYY-MM-DD' (solo calendario) */
  day?: string
  careerId?: string
  subjectId?: string
  sessionId?: string
  /** Página de la lista (solo vista lista). */
  page?: number
}

export function attendanceHref(params: AttendanceHrefParams): string {
  const qs = new URLSearchParams()
  if (params.view === 'calendar') qs.set('view', 'calendar')
  if (params.view === 'calendar' && params.month) qs.set('month', params.month)
  if (params.view === 'calendar' && params.day) qs.set('day', params.day)
  if (params.careerId) qs.set('careerId', params.careerId)
  if (params.subjectId) qs.set('subjectId', params.subjectId)
  if (params.sessionId) qs.set('sessionId', params.sessionId)
  if (params.view !== 'calendar' && params.page && params.page > 1) {
    qs.set('page', String(params.page))
  }
  const query = qs.toString()
  return query ? `/admin/attendance?${query}` : '/admin/attendance'
}
