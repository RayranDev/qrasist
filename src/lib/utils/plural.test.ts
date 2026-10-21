import { describe, expect, it } from 'vitest'
import { countOf, pluralize, remainingOf } from './plural'

describe('pluralize', () => {
  it('uses the singular only for exactly 1', () => {
    expect(pluralize(1, 'falta')).toBe('falta')
    expect(pluralize(0, 'falta')).toBe('faltas')
    expect(pluralize(2, 'falta')).toBe('faltas')
  })

  it('adds "es" to words ending in a consonant', () => {
    expect(pluralize(1, 'justificación')).toBe('justificación')
    expect(pluralize(3, 'justificación', 'justificaciones')).toBe('justificaciones')
    expect(pluralize(2, 'mes')).toBe('meses')
  })

  it('honours an explicit plural', () => {
    expect(pluralize(2, 'tardanza', 'tardanzas')).toBe('tardanzas')
    expect(pluralize(2, 'lunes', 'lunes')).toBe('lunes')
  })
})

describe('countOf', () => {
  it('prefixes the count', () => {
    expect(countOf(1, 'falta')).toBe('1 falta')
    expect(countOf(2, 'falta')).toBe('2 faltas')
    expect(countOf(0, 'clase')).toBe('0 clases')
    expect(countOf(5, 'estudiante')).toBe('5 estudiantes')
    expect(countOf(2, 'justificada')).toBe('2 justificadas')
  })
})

describe('remainingOf', () => {
  it('agrees the verb and the noun', () => {
    expect(remainingOf(1, 'falta')).toBe('queda 1 falta')
    expect(remainingOf(2, 'falta')).toBe('quedan 2 faltas')
    expect(remainingOf(0, 'falta')).toBe('quedan 0 faltas')
  })
})
