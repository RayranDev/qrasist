import { describe, it, expect } from 'vitest'
import { collectCutColumns, cutLabel, MAX_CUT_LABEL_LENGTH } from './cutColumns'

const cut = (cutId: string | null, name: string, sequence: number | null) => ({
  cutId,
  name,
  sequence,
})

describe('cutLabel', () => {
  it('leaves names up to the limit untouched (trimmed)', () => {
    expect(cutLabel('  Corte 1 ')).toBe('Corte 1')
    const exact = 'x'.repeat(MAX_CUT_LABEL_LENGTH)
    expect(cutLabel(exact)).toBe(exact)
  })

  it('truncates longer names with an ellipsis within the limit', () => {
    const label = cutLabel('Primer corte '.repeat(20))
    expect(label.length).toBeLessThanOrEqual(MAX_CUT_LABEL_LENGTH)
    expect(label.endsWith('...')).toBe(true)
  })
})

describe('collectCutColumns', () => {
  it('truncates legacy over-long names so a header never overflows a report', () => {
    const [column] = collectCutColumns([[cut('k1', 'N'.repeat(500), 1)]])
    expect(column.name.length).toBeLessThanOrEqual(MAX_CUT_LABEL_LENGTH)
  })

  it('orders the union by sequence and puts the unassigned bucket last', () => {
    const columns = collectCutColumns([
      [cut('k2', 'Corte 2', 2), cut(null, 'Sin corte asignado', null)],
      [cut('k1', 'Corte 1', 1), cut('k2', 'Corte 2', 2)],
    ])
    expect(columns.map((c) => c.name)).toEqual(['Corte 1', 'Corte 2', 'Sin corte asignado'])
  })

  it('returns no columns when no row has cuts', () => {
    expect(collectCutColumns([[], []])).toEqual([])
  })
})
