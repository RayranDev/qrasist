import { describe, it, expect } from 'vitest'
import { foldText, normalizeName } from './normalizeText'

describe('normalizeName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeName('  Juan   Pérez ')).toBe('Juan Pérez')
  })
})

describe('foldText', () => {
  it('ignores case, accents and surrounding or repeated spaces', () => {
    expect(foldText('  Ingeniería   de  SISTEMAS ')).toBe('ingenieria de sistemas')
    expect(foldText('Contraseña')).toBe('contrasena')
  })

  it('treats non-breaking and zero-width spaces like regular ones', () => {
    expect(foldText('Código Materia')).toBe('codigo materia')
    expect(foldText('﻿Correo​')).toBe('correo')
  })
})
