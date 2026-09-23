import { describe, it, expect } from 'vitest'
import { buildWorkbook, type ExportSheet } from './exportWorkbook'

const columns = [
  { header: 'Nombre', key: 'name' },
  { header: 'Nota', key: 'note' },
]

function sheetWith(rows: Record<string, unknown>[]): ExportSheet[] {
  return [{ name: 'Datos', columns, rows }]
}

async function cellValue(rows: Record<string, unknown>[], rowIndex: number, key: string) {
  const workbook = await buildWorkbook(sheetWith(rows))
  const sheet = workbook.getWorksheet('Datos')!
  return sheet.getRow(rowIndex).getCell(key).value
}

describe('buildWorkbook — formula injection prevention', () => {
  it('prefixes a cell starting with "=" with a single quote', async () => {
    expect(await cellValue([{ name: '=SUM(A1:A2)', note: 'x' }], 2, 'name')).toBe("'=SUM(A1:A2)")
  })

  it('prefixes a cell starting with "+"', async () => {
    expect(await cellValue([{ name: '+1+1', note: 'x' }], 2, 'name')).toBe("'+1+1")
  })

  it('prefixes a cell starting with "-"', async () => {
    expect(await cellValue([{ name: '-2+3', note: 'x' }], 2, 'name')).toBe("'-2+3")
  })

  it('prefixes a cell starting with "@"', async () => {
    expect(await cellValue([{ name: '@SUM(1,2)', note: 'x' }], 2, 'name')).toBe("'@SUM(1,2)")
  })

  it('prefixes a cell starting with a tab', async () => {
    expect(await cellValue([{ name: '\t=cmd', note: 'x' }], 2, 'name')).toBe("'\t=cmd")
  })

  it('prefixes a cell starting with a carriage return', async () => {
    expect(await cellValue([{ name: '\r=cmd', note: 'x' }], 2, 'name')).toBe("'\r=cmd")
  })

  it('leaves an ordinary string untouched', async () => {
    expect(await cellValue([{ name: 'Juan Pérez', note: 'x' }], 2, 'name')).toBe('Juan Pérez')
  })

  it('leaves a string with a dangerous character in the middle untouched', async () => {
    expect(await cellValue([{ name: 'Total = 5', note: 'x' }], 2, 'name')).toBe('Total = 5')
  })

  it('leaves non-string values (numbers) untouched', async () => {
    expect(await cellValue([{ name: 'x', note: 42 }], 2, 'note')).toBe(42)
  })

  it('sanitizes every row, not just the first', async () => {
    const rows = [
      { name: 'ok', note: 'fine' },
      { name: '=EVIL()', note: 'fine' },
      { name: 'ok2', note: '@EVIL()' },
    ]
    expect(await cellValue(rows, 2, 'name')).toBe('ok')
    expect(await cellValue(rows, 3, 'name')).toBe("'=EVIL()")
    expect(await cellValue(rows, 4, 'note')).toBe("'@EVIL()")
  })
})
