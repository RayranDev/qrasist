import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows } from './fetchAll'

/**
 * Simula un query builder de Supabase/PostgREST: mantiene una tabla en
 * memoria y, igual que PostgREST con `db-max-rows`, jamás devuelve más
 * de `serverMaxRows` filas en una sola respuesta aunque el `.range()}
 * pedido sea más grande -- así se prueba que el helper realmente pagina
 * en vez de confiar en un único pedido grande.
 */
function makeFakeTable(totalRows: number, serverMaxRows = 1000) {
  const table = Array.from({ length: totalRows }, (_, i) => ({ id: i }))

  const runPage = vi.fn(async (from: number, to: number) => {
    const requestedSlice = table.slice(from, to + 1)
    const cappedSlice = requestedSlice.slice(0, serverMaxRows)
    return { data: cappedSlice, error: null }
  })

  return { runPage }
}

describe('fetchAllRows', () => {
  it('returns everything in one page when the result fits under the page size', async () => {
    const { runPage } = makeFakeTable(50)
    const { data, error } = await fetchAllRows(runPage, 1000)

    expect(error).toBeNull()
    expect(data).toHaveLength(50)
    expect(runPage).toHaveBeenCalledTimes(1)
  })

  it('pages through a result larger than one page (simulates the 1000-row PostgREST cap)', async () => {
    const { runPage } = makeFakeTable(2500, 1000)
    const { data, error } = await fetchAllRows(runPage, 1000)

    expect(error).toBeNull()
    expect(data).toHaveLength(2500)
    expect(data.map((r) => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i))
    // 1000 + 1000 + 500 = 3 páginas, la última más corta que pageSize
    expect(runPage).toHaveBeenCalledTimes(3)
  })

  it('stops as soon as a short page comes back, even if it is not the first page', async () => {
    const { runPage } = makeFakeTable(1000, 1000)
    const { data } = await fetchAllRows(runPage, 1000)

    // Página 1: 1000 filas (llena) -> sigue pidiendo. Página 2: 0 filas
    // -> para. No debería devolver de más ni quedarse pidiendo para siempre.
    expect(data).toHaveLength(1000)
    expect(runPage).toHaveBeenCalledTimes(2)
  })

  it('returns an empty array without erroring when the table is empty', async () => {
    const { runPage } = makeFakeTable(0)
    const { data, error } = await fetchAllRows(runPage, 1000)

    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(runPage).toHaveBeenCalledTimes(1)
  })

  it('stops and surfaces the error as soon as one page fails, keeping rows fetched so far', async () => {
    const runPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })

    const { data, error } = await fetchAllRows(runPage, 2)

    expect(error).toEqual({ message: 'connection reset' })
    expect(data).toEqual([{ id: 1 }, { id: 2 }])
    expect(runPage).toHaveBeenCalledTimes(2)
  })

  it('requests pages with the expected [from, to] ranges', async () => {
    const { runPage } = makeFakeTable(250, 1000)
    await fetchAllRows(runPage, 100)

    expect(runPage).toHaveBeenNthCalledWith(1, 0, 99)
    expect(runPage).toHaveBeenNthCalledWith(2, 100, 199)
    expect(runPage).toHaveBeenNthCalledWith(3, 200, 299)
  })
})
