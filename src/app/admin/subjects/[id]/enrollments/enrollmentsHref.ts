export interface EnrollmentsListState {
  q?: string
  /** Page of the "available students" list (1-based). */
  page?: number
  /** Page of the "enrolled students" list (1-based). */
  epage?: number
}

/**
 * Builds a query string for the enrollments screen. Page 1 and empty search are
 * omitted so URLs stay clean; every list keeps its own page param.
 */
export function buildEnrollmentsHref(basePath: string, state: EnrollmentsListState): string {
  const params = new URLSearchParams()
  if (state.q?.trim()) params.set('q', state.q.trim())
  if (state.page && state.page > 1) params.set('page', String(state.page))
  if (state.epage && state.epage > 1) params.set('epage', String(state.epage))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
