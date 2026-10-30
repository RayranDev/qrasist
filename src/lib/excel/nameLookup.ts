import { foldText } from '@/lib/utils/normalizeText'

export type NameMatch<T> = { ok: true; item: T } | { ok: false; reason: 'unknown' | 'inactive' }

/**
 * Busca registros por nombre ignorando mayúsculas, tildes y espacios
 * sobrantes (lo que el admin escribe a mano en el Excel). Distingue "no
 * existe" de "existe pero está inactiva" para dar un mensaje claro, y si
 * hay homónimos prefiere el activo.
 */
export function buildNameLookup<T extends { name: string; is_active: boolean }>(items: T[]) {
  const byName = new Map<string, T[]>()
  for (const item of items) {
    const key = foldText(item.name)
    byName.set(key, [...(byName.get(key) ?? []), item])
  }

  return (raw: string): NameMatch<T> => {
    const matches = byName.get(foldText(raw)) ?? []
    const active = matches.find((m) => m.is_active)
    if (active) return { ok: true, item: active }
    return { ok: false, reason: matches.length > 0 ? 'inactive' : 'unknown' }
  }
}
