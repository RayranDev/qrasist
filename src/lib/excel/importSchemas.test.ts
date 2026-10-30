import { describe, it, expect } from 'vitest'
import { codeFromListValue, IMPORT_SCHEMA, isExampleRow, type ImportType } from './importSchemas'

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

describe('codeFromListValue', () => {
  it('takes the text before the " — " separator of a dropdown value', () => {
    expect(codeFromListValue('ALG-201 — Álgebra Lineal')).toBe('ALG-201')
    expect(codeFromListValue('202500000001 — Ana Torres')).toBe('202500000001')
  })

  it('tolerates en dash and hyphen variants surrounded by spaces', () => {
    expect(codeFromListValue('ALG-201 – Álgebra')).toBe('ALG-201')
    expect(codeFromListValue('ALG-201 - Álgebra')).toBe('ALG-201')
    expect(codeFromListValue('  ALG-201   —   Álgebra - Lineal ')).toBe('ALG-201')
  })

  it('leaves a plain code untouched, including hyphens inside the code', () => {
    expect(codeFromListValue('CALC-101')).toBe('CALC-101')
    expect(codeFromListValue(' 202500000001 ')).toBe('202500000001')
    expect(codeFromListValue('')).toBe('')
  })
})
