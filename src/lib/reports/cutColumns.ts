/**
 * Helpers compartidos por los reportes que muestran asistencia por corte
 * (Excel y PDF de coordinación, reportes por usuario y por rango).
 *
 * Regla de negocio: una materia con cortes definidos muestra la asistencia de
 * cada corte y después el general; una materia sin cortes solo muestra el
 * general. Una hoja o tabla puede mezclar materias de ambos tipos, así que
 * las columnas por corte salen de la UNIÓN de los cortes de las filas y la
 * celda de una fila a la que ese corte no le aplica queda vacía. Nunca se
 * inventan columnas de corte cuando ninguna fila tiene cortes.
 */
import type { CutBreakdown } from '@/lib/attendance/cutsBreakdown'

/** Clave estable de un corte; el bucket "Sin corte asignado" no tiene id. */
export const UNASSIGNED_CUT_KEY = '__unassigned__'

export interface CutColumn {
  key: string
  name: string
  sequence: number | null
}

export function cutKeyOf(cut: Pick<CutBreakdown, 'cutId'>): string {
  return cut.cutId ?? UNASSIGNED_CUT_KEY
}

/**
 * Unión ordenada de los cortes de varias filas: por secuencia, con el bucket
 * sin corte al final. Vacía si ninguna fila tiene cortes.
 */
export function collectCutColumns(
  lists: Iterable<Pick<CutBreakdown, 'cutId' | 'name' | 'sequence'>[]>
): CutColumn[] {
  const byKey = new Map<string, CutColumn>()
  for (const list of lists) {
    for (const cut of list) {
      const key = cutKeyOf(cut)
      if (!byKey.has(key)) byKey.set(key, { key, name: cut.name, sequence: cut.sequence })
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name, 'es')
  )
}

export function findCut<T extends Pick<CutBreakdown, 'cutId'>>(
  cuts: T[] | undefined,
  key: string
): T | undefined {
  return cuts?.find((c) => cutKeyOf(c) === key)
}

/** Porcentaje de un corte, o '' si el corte aún no tiene clases dictadas. */
export function cutPercentCell(cut: Pick<CutBreakdown, 'sessionsHeld' | 'percentage'>) {
  return cut.sessionsHeld > 0 ? cut.percentage : ''
}

/**
 * Etiqueta de las cifras generales cuando hay columnas por corte al lado:
 * "(rango)" si el reporte está acotado a un rango y "(general)" si abarca
 * todo el período. Sin cortes el encabezado no cambia.
 */
export function generalHeader(header: string, hasCuts: boolean, ranged: boolean): string {
  if (!hasCuts) return header
  return `${header} (${ranged ? 'rango' : 'general'})`
}
