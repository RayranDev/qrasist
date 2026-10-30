import { sanitizeSearchTerm } from '@/lib/utils/searchTerm'
import type { RequestsView } from './constants'

export interface RequestFilters {
  q: string
  career?: string
  subjectId?: string
}

export interface RequestsPageState {
  view: RequestsView
  page: number
  filters: RequestFilters
}

export interface RequestsSearchParams {
  view?: string
  q?: string
  career?: string
  page?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * Normaliza filtros llegados del cliente o de la URL: el texto se limpia
 * antes de ir a un `.or('...ilike...')` y los ids deben ser uuid (un valor
 * malformado haría fallar la consulta entera con un error de tipo).
 */
export function sanitizeRequestFilters(raw: {
  q?: unknown
  career?: unknown
  subjectId?: unknown
}): RequestFilters {
  return {
    q: sanitizeSearchTerm(typeof raw.q === 'string' ? raw.q : ''),
    career: isUuid(raw.career) ? raw.career : undefined,
    subjectId: isUuid(raw.subjectId) ? raw.subjectId : undefined,
  }
}

export function parseRequestsParams(params: RequestsSearchParams): RequestsPageState {
  return {
    view: params.view === 'student' ? 'student' : 'subject',
    page: Math.max(1, parseInt(params.page || '1', 10) || 1),
    filters: sanitizeRequestFilters({ q: params.q, career: params.career }),
  }
}

/** Arma la URL de la lista omitiendo lo que está en su valor por defecto. */
export function buildRequestsHref(basePath: string, state: RequestsPageState): string {
  const qs = new URLSearchParams()
  if (state.view !== 'subject') qs.set('view', state.view)
  if (state.filters.q) qs.set('q', state.filters.q)
  if (state.filters.career) qs.set('career', state.filters.career)
  if (state.page > 1) qs.set('page', String(state.page))
  const query = qs.toString()
  return query ? `${basePath}?${query}` : basePath
}
