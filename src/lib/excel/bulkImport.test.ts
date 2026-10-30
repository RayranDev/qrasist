import { describe, it, expect, vi } from 'vitest'
import { runBulkImport } from './bulkImport'

const rows = [{ n: 'a' }, { n: 'bad' }, { n: 'c' }, { n: 'boom' }]
const validate = (row: Record<string, string>) =>
  row.n === 'bad' ? { error: 'inválida' } : { data: row.n }

describe('runBulkImport', () => {
  it('keeps going after a validation error or a thrown insert, reporting each row', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const insert = vi.fn(async (n: string) => {
      if (n === 'boom') throw new Error('network')
      return { success: true }
    })

    const result = await runBulkImport(rows, validate, insert)

    expect(result.successCount).toBe(2)
    expect(result.errors).toEqual([
      { row: 3, message: 'inválida' },
      { row: 5, message: 'Error inesperado al procesar la fila.' },
    ])
  })

  it('uses the real sheet row numbers when provided', async () => {
    const result = await runBulkImport([{ n: 'bad' }], validate, async () => ({ success: true }), {
      rowNumbers: [9],
    })
    expect(result.errors).toEqual([{ row: 9, message: 'inválida' }])
  })

  it('runs inserts concurrently up to the limit and returns errors sorted by row', async () => {
    let active = 0
    let peak = 0
    const many = Array.from({ length: 10 }, (_, i) => ({ n: String(i) }))
    const result = await runBulkImport(
      many,
      (row) => ({ data: Number(row.n) }),
      async (n) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5 * (10 - n)))
        active--
        return n % 2 === 0 ? { success: true } : { success: false, error: `fallo ${n}` }
      },
      { concurrency: 3 }
    )

    expect(peak).toBe(3)
    expect(result.successCount).toBe(5)
    expect(result.errors.map((e) => e.row)).toEqual([3, 5, 7, 9, 11])
  })
})
