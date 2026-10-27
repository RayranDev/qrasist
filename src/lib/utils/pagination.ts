/**
 * Helpers for server-side pagination driven by URL search params.
 */

/** Parses a `?page=` style param into a 1-based page number (invalid -> 1). */
export function parsePageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  return Math.max(1, parseInt(value || '1', 10) || 1)
}

export function totalPagesFor(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / pageSize))
}

export interface ListPageState {
  /** Requested 1-based page. */
  page: number
  /** Exact row count, or null when the query errored (so it is unknown). */
  total: number | null
  /** The query was rejected because the range starts past the last row (PGRST103). */
  outOfRange: boolean
}

/**
 * Page to land on for a list whose requested page may no longer exist (e.g. the
 * last row of the last page was just removed). Out-of-range errors fall back to
 * page 1 (the count is unknown); otherwise a page past the end is clamped to the
 * last one.
 */
export function resolveListPage(list: ListPageState, pageSize: number): number {
  if (list.outOfRange) return 1
  if (list.total === null) return list.page
  return Math.min(list.page, totalPagesFor(list.total, pageSize))
}

/**
 * Redirect target for a screen with two independently paginated lists, or null
 * when both requested pages are valid.
 */
export function resolveTwoListRedirect(
  lists: { available: ListPageState; enrolled: ListPageState },
  pageSize: number
): { page: number; epage: number } | null {
  const page = resolveListPage(lists.available, pageSize)
  const epage = resolveListPage(lists.enrolled, pageSize)
  return page === lists.available.page && epage === lists.enrolled.page ? null : { page, epage }
}

/** Inclusive `.range(from, to)` bounds for a 1-based page. */
export function pageBounds(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize
  return { from, to: from + pageSize - 1 }
}
