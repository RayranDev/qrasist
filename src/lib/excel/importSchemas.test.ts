import { describe, it, expect } from 'vitest'
import { codeCandidates, IMPORT_SCHEMA, isExampleRow, type ImportType } from './importSchemas'

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

describe('codeCandidates', () => {
  it('offers the full value first, then the code before the canonical " — " separator', () => {
    expect(codeCandidates('ALG-201 — Álgebra Lineal')).toEqual([
      'ALG-201 — Álgebra Lineal',
      'ALG-201',
    ])
    expect(codeCandidates('202500000001 — Ana Torres')).toEqual([
      '202500000001 — Ana Torres',
      '202500000001',
    ])
  })

  it('keeps a spaced dash that belongs to the code when the value has the canonical separator', () => {
    expect(codeCandidates('CALC - 101 — Cálculo')).toEqual(['CALC - 101 — Cálculo', 'CALC - 101'])
  })

  it('does not cut names that contain dashes after the canonical separator', () => {
    expect(codeCandidates('ALG-201 — Álgebra - Lineal — II')[1]).toBe('ALG-201')
  })

  it('offers a plain code once, even if it contains a spaced dash', () => {
    expect(codeCandidates(' 202500000001 ')).toEqual(['202500000001'])
    expect(codeCandidates('CALC-101')).toEqual(['CALC-101'])
    // La división tolerante existe, pero siempre DESPUÉS del valor completo.
    expect(codeCandidates('CALC - 101')).toEqual(['CALC - 101', 'CALC'])
  })

  it('tolerates en dash and hyphen separators only as a fallback candidate', () => {
    expect(codeCandidates('ALG-201 – Álgebra')).toEqual(['ALG-201 – Álgebra', 'ALG-201'])
    expect(codeCandidates('ALG-201 - Álgebra')).toEqual(['ALG-201 - Álgebra', 'ALG-201'])
  })

  it('returns an empty first candidate for an empty value', () => {
    expect(codeCandidates('')).toEqual([''])
  })
})
