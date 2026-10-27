/**
 * Pure helpers for assigning subjects to a professor from the admin screens.
 * Shared by the server action (input validation) and the picker dialog.
 */

/** Max subjects that can be assigned in a single call. */
export const MAX_ASSIGN_SUBJECTS = 50

/** Results shown at once in the picker; the admin narrows down with the search box. */
export const ASSIGNABLE_SUBJECTS_PAGE_SIZE = 20

/**
 * Candidate subjects fetched (name, id order) before enrolled ones are filtered out in
 * memory when listing what a student can be enrolled in. If the window is full the
 * list is flagged as truncated and the admin is asked to narrow the search.
 */
export const ENROLLABLE_CANDIDATE_CAP = 500

export type NormalizedSubjectIds = { ok: true; ids: string[] } | { ok: false; error: string }

/** Trims, drops blanks, removes duplicates and enforces the 1..MAX_ASSIGN_SUBJECTS range. */
export function normalizeSubjectIds(
  input: unknown,
  verb: 'asignar' | 'inscribir' = 'asignar'
): NormalizedSubjectIds {
  if (!Array.isArray(input)) return { ok: false, error: 'Selección de materias inválida.' }
  const ids = Array.from(
    new Set(
      input
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  )
  if (ids.length === 0) return { ok: false, error: 'Selecciona al menos una materia.' }
  if (ids.length > MAX_ASSIGN_SUBJECTS) {
    return {
      ok: false,
      error: `Puedes ${verb} hasta ${MAX_ASSIGN_SUBJECTS} materias a la vez.`,
    }
  }
  return { ok: true, ids }
}
