export type SelectionState = 'none' | 'some' | 'all'

/** Cuántos de `ids` están seleccionados: ninguno, algunos o todos. */
export function selectionState(
  selected: ReadonlySet<string>,
  ids: readonly string[]
): SelectionState {
  if (ids.length === 0) return 'none'
  let count = 0
  for (const id of ids) if (selected.has(id)) count++
  if (count === 0) return 'none'
  return count === ids.length ? 'all' : 'some'
}

/** Devuelve una selección nueva con `ids` marcados o desmarcados. */
export function setSelected(
  selected: ReadonlySet<string>,
  ids: readonly string[],
  on: boolean
): Set<string> {
  const next = new Set(selected)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return next
}

/** Parte `items` en lotes de como máximo `size` elementos. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
