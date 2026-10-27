import { describe, it, expect } from 'vitest'
import { countsLabel, plural } from './calendarLabels'

describe('calendar labels', () => {
  it('pluralizes in Spanish', () => {
    expect(plural(1, 'clase', 'clases')).toBe('1 clase')
    expect(plural(0, 'clase', 'clases')).toBe('0 clases')
    expect(plural(2, 'clase', 'clases')).toBe('2 clases')
  })

  it('lists held classes first and suspended ones apart', () => {
    expect(countsLabel({ held: 2, suspended: 0 })).toBe('2 clases')
    expect(countsLabel({ held: 1, suspended: 1 })).toBe('1 clase, 1 suspendida')
    expect(countsLabel({ held: 0, suspended: 3 })).toBe('0 clases, 3 suspendidas')
  })
})
