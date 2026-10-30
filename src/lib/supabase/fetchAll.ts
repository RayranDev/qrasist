/**
 * PostgREST (la API que expone Supabase) trunca silenciosamente las
 * respuestas a `db-max-rows` filas (1000 por defecto) cuando la query
 * no pide un `.range()` explícito -- no es un error, la respuesta
 * simplemente viene incompleta. Cualquier query que pueda devolver más
 * de mil filas en producción (sesiones/asistencias/justificaciones de
 * un período completo, por ejemplo) necesita paginar con `.range()` en
 * vez de confiar en traer "todo" de una sola vez.
 *
 * Este helper repite la consulta pidiendo páginas de `pageSize` filas
 * hasta que una página vuelve más corta que `pageSize` (o vacía), que
 * es la señal de que ya no queda nada más. Se recibe un callback en vez
 * de un query builder de Supabase para no acoplarse a sus tipos
 * genéricos -- el caller arma la query completa (select/eq/in/etc.) y
 * solo le aplica el `.range(from, to)` que le llega por parámetro.
 *
 * Por defecto el final se detecta con una página corta (< `pageSize`), lo
 * que supone que el `db-max-rows` del servidor es >= `pageSize`. Si el
 * servidor tuviera un tope menor (500, por ejemplo), una página parcial no
 * significa que se acabaron las filas y el resultado quedaría truncado en
 * silencio. `{ untilEmpty: true }` no se fía de eso: pide hasta recibir una
 * página VACÍA y cada pedido arranca donde terminó realmente el anterior
 * (`from += filas recibidas`), a costa de una consulta extra al final. Es
 * opt-in porque varias suites de tests simulan el query builder con datos
 * fijos que ignoran `.range()`: con este modo nunca verían una página vacía.
 *
 * El callback devuelve `PromiseLike<FetchAllPage<T>>` (no `Promise`)
 * porque el query builder de supabase-js es "thenable" pero no un
 * `Promise` de verdad (le faltan `.catch`/`.finally`) -- `PromiseLike`
 * es justamente el tipo que solo exige `.then`, así que se le puede
 * pasar el builder directo (`(from, to) => supabase.from(...).range(from, to)`)
 * sin envolverlo en una función async aparte.
 */

export interface FetchAllPage<T> {
  data: T[] | null
  error: unknown
}

export interface FetchAllResult<T> {
  data: T[]
  error: unknown
}

const DEFAULT_PAGE_SIZE = 1000

export interface FetchAllOptions {
  /** Corta solo con una página vacía (robusto ante un `db-max-rows` < pageSize). */
  untilEmpty?: boolean
}

export async function fetchAllRows<T>(
  runPage: (from: number, to: number) => PromiseLike<FetchAllPage<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE,
  options: FetchAllOptions = {}
): Promise<FetchAllResult<T>> {
  const allRows: T[] = []
  let from = 0

  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await runPage(from, to)

    if (error) {
      return { data: allRows, error }
    }

    const rows = data || []
    allRows.push(...rows)

    if (options.untilEmpty) {
      if (rows.length === 0) break
      from += rows.length
    } else {
      if (rows.length < pageSize) break
      from += pageSize
    }
  }

  return { data: allRows, error: null }
}

/**
 * Devuelve las filas de un resultado de `fetchAllRows` o lanza si la
 * consulta falló. `fetchAllRows` devuelve en `data` lo que alcanzó a traer
 * antes del error, así que usar `data` sin mirar `error` produce
 * resultados truncados en silencio -- inaceptable en un reporte oficial.
 */
export function unwrapRows<T>(result: FetchAllResult<T>, what: string): T[] {
  if (result.error) {
    throw new Error(`No se pudieron cargar ${what}.`, { cause: result.error })
  }
  return result.data
}
