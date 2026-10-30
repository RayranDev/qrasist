import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TriangleAlert } from 'lucide-react'
import {
  GROUPS_PER_PAGE,
  ROWS_PER_PAGE,
  SCAN_MAX,
  type RequestsView,
} from '@/lib/enrollmentRequests/constants'
import {
  buildRequestsHref,
  parseRequestsParams,
  type RequestsSearchParams,
} from '@/lib/enrollmentRequests/filters'
import { groupRequests, paginateGroups } from '@/lib/enrollmentRequests/grouping'
import { fetchPendingRequests, type RequestScope } from '@/lib/enrollmentRequests/query'
import { countOf } from '@/lib/utils/plural'
import EnrollmentRequestsBoard from './EnrollmentRequestsBoard'
import RequestsFilters from './RequestsFilters'

/**
 * Pantalla de solicitudes de inscripción pendientes, compartida por
 * coordinación (todas las materias), el profesor (las suyas) y la vista de
 * una sola materia. Lee todas las pendientes que coinciden con los filtros
 * (paginando contra PostgREST), las agrupa y pagina POR GRUPOS en el
 * servidor: un grupo nunca se parte entre páginas, así el conteo de su
 * encabezado es el real.
 */
export default async function EnrollmentRequestsPanel({
  supabase,
  scope,
  params,
  basePath,
  careers,
  fixedSubjectId,
}: {
  supabase: SupabaseClient
  scope: RequestScope
  params: RequestsSearchParams
  basePath: string
  careers?: { id: string; name: string }[]
  /** Fija la materia (vista de una sola materia): sin filtros ni cambio de vista. */
  fixedSubjectId?: string
}) {
  const parsed = parseRequestsParams(params)
  const view: RequestsView = fixedSubjectId ? 'subject' : parsed.view
  const filters = fixedSubjectId
    ? { q: '', career: undefined, subjectId: fixedSubjectId }
    : parsed.filters

  const result = await fetchPendingRequests(supabase, { scope, filters })

  if (result.error) {
    return (
      <div
        role="alert"
        className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 text-sm font-medium"
      >
        No se pudieron cargar las solicitudes. Recarga la página; si el problema continúa, avisa a
        soporte.
      </div>
    )
  }

  const groups = groupRequests(result.requests, view)
  const pages = paginateGroups(groups, { maxGroups: GROUPS_PER_PAGE, maxRows: ROWS_PER_PAGE })
  const totalPages = Math.max(1, pages.length)
  const currentPage = Math.min(parsed.page, totalPages)
  const pageGroups = pages[currentPage - 1] ?? []
  const hrefFor = (page: number) =>
    buildRequestsHref(basePath, { view, page, filters: { q: filters.q, career: filters.career } })

  const unit = view === 'subject' ? ['materia', 'materias'] : ['estudiante', 'estudiantes']
  const hasFilters = !!(filters.q || filters.career)

  return (
    <div className="space-y-4">
      {!fixedSubjectId && (
        <RequestsFilters
          basePath={basePath}
          view={view}
          searchQuery={filters.q}
          careerFilter={filters.career}
          careers={careers}
        />
      )}

      {result.truncated && (
        <div
          role="status"
          className="flex gap-2 items-start bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl p-3 text-xs font-medium"
        >
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Hay más de {SCAN_MAX} solicitudes pendientes y aquí solo se muestran las {SCAN_MAX} más
            antiguas. Usa la búsqueda o los filtros para acotar la lista.
          </p>
        </div>
      )}

      {result.total > 0 && (
        <p className="text-xs text-gray-500 font-medium px-1">
          {countOf(result.total, 'solicitud pendiente', 'solicitudes pendientes')}
          {result.truncated ? ' o más' : ''} · {countOf(groups.length, unit[0], unit[1])}
          {hasFilters ? ' con los filtros actuales' : ''}
        </p>
      )}

      <EnrollmentRequestsBoard
        key={`${view}|${currentPage}|${filters.q}|${filters.career ?? ''}`}
        groups={pageGroups}
        view={view}
        totalMatching={result.total}
        truncated={result.truncated}
        filters={filters}
        canApproveAll
        filtered={hasFilters}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-gray-500 font-medium">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex gap-2">
            <PageLink href={hrefFor(currentPage - 1)} disabled={currentPage <= 1}>
              ← Anterior
            </PageLink>
            <PageLink href={hrefFor(currentPage + 1)} disabled={currentPage >= totalPages}>
              Siguiente →
            </PageLink>
          </div>
        </div>
      )}
    </div>
  )
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
        disabled
          ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </Link>
  )
}
