const DEFAULT_MAX_LENGTH = 100

/**
 * Cleans free text typed in a search box before it is interpolated into a
 * PostgREST `.or('col.ilike.%term%,...')` filter.
 *
 * Commas and parentheses have meaning in the `.or()` filter grammar (a name with
 * a comma would otherwise alter the filter instead of being searched), and
 * `%`, `*` and `\` are LIKE wildcards/escapes the user never meant to type.
 */
export function sanitizeSearchTerm(raw: string | null | undefined, maxLength = DEFAULT_MAX_LENGTH) {
  return (raw || '')
    .trim()
    .replace(/[,()%*\\]/g, '')
    .slice(0, maxLength)
}
