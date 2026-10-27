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

/** Inclusive `.range(from, to)` bounds for a 1-based page. */
export function pageBounds(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize
  return { from, to: from + pageSize - 1 }
}
