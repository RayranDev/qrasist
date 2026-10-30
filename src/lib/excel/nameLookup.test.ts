import { describe, it, expect } from 'vitest'
import { buildNameLookup } from './nameLookup'

const careers = [
  { id: '1', name: 'Ingeniería de Sistemas', is_active: true },
  { id: '2', name: 'Derecho', is_active: false },
  { id: '3', name: 'Contaduría', is_active: false },
  { id: '4', name: 'Contaduría', is_active: true },
]
const find = buildNameLookup(careers)

describe('buildNameLookup', () => {
  it('matches ignoring case, accents and extra spaces', () => {
    expect(find('  ingenieria   DE sistemas ')).toEqual({ ok: true, item: careers[0] })
  })

  it('reports an existing but inactive record as inactive', () => {
    expect(find('derecho')).toEqual({ ok: false, reason: 'inactive' })
  })

  it('reports a missing record as unknown', () => {
    expect(find('Medicina')).toEqual({ ok: false, reason: 'unknown' })
  })

  it('prefers the active record when names collide', () => {
    expect(find('contaduria')).toEqual({ ok: true, item: careers[3] })
  })
})
