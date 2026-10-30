import { describe, it, expect } from 'vitest'
import { IMPORT_SCHEMA, isExampleRow, type ImportType } from './importSchemas'

/** La fila de ejemplo tal como la leería el parser: encabezado -> valor. */
function exampleAsParsed(type: ImportType) {
  const { columns, exampleRow } = IMPORT_SCHEMA[type]
  return Object.fromEntries(columns.map((c) => [c.header, exampleRow[c.key] ?? '']))
}

describe('isExampleRow', () => {
  it.each(['STUDENT', 'PROFESSOR', 'SUBJECT', 'ENROLLMENT'] as const)(
    'flags the untouched %s example row',
    (type) => {
      expect(isExampleRow(type, exampleAsParsed(type))).toBe(true)
    }
  )

  it('ignores case, accents and spaces when comparing', () => {
    const row = { ...exampleAsParsed('STUDENT'), Correo: ' JUAN.PEREZ@urepublicana.edu.co ' }
    expect(isExampleRow('STUDENT', row)).toBe(true)
  })

  it('does not flag a row once its identifying data was changed', () => {
    const row = { ...exampleAsParsed('STUDENT'), Código: '202500000001' }
    expect(isExampleRow('STUDENT', row)).toBe(false)
  })
})
