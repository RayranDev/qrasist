import { foldText } from '@/lib/utils/normalizeText'

export type NameMatch<T> =
  { ok: true; item: T } | { ok: false; reason: 'unknown' | 'inactive' | 'ambiguous' }

/**
 * Busca registros por nombre ignorando mayúsculas, tildes y espacios
 * sobrantes (lo que el admin escribe a mano en el Excel). Distingue "no
 * existe" de "existe pero está inactiva" para dar un mensaje claro. El
 * nombre no es único en la base y al plegarlo dos nombres distintos pueden
 * colisionar: si hay más de un activo, solo se acepta si exactamente uno
 * coincide letra por letra; si no, es ambiguo y la fila debe fallar.
 */
export function buildNameLookup<T extends { name: string; is_active: boolean }>(items: T[]) {
  const byName = new Map<string, T[]>()
  for (const item of items) {
    const key = foldText(item.name)
    byName.set(key, [...(byName.get(key) ?? []), item])
  }

  return (raw: string): NameMatch<T> => {
    const matches = byName.get(foldText(raw)) ?? []
    const active = matches.filter((m) => m.is_active)
    if (active.length === 1) return { ok: true, item: active[0] }
    if (active.length > 1) {
      const exact = active.filter((m) => m.name.trim() === raw.trim())
      return exact.length === 1 ? { ok: true, item: exact[0] } : { ok: false, reason: 'ambiguous' }
    }
    return { ok: false, reason: matches.length > 0 ? 'inactive' : 'unknown' }
  }
}
