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

export async function fetchAllRows<T>(
  runPage: (from: number, to: number) => PromiseLike<FetchAllPage<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE
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

    if (rows.length < pageSize) break
    from += pageSize
  }

  return { data: allRows, error: null }
}
