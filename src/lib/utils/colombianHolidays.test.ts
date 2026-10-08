import { describe, it, expect } from 'vitest'
import { colombianHolidays, easterSunday, isColombianHoliday } from './colombianHolidays'

describe('easterSunday', () => {
  it.each([
    [1961, '1961-04-02'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2038, '2038-04-25'],
  ])('computes Easter %i as %s', (year, expected) => {
    expect(easterSunday(year).toISOString().slice(0, 10)).toBe(expected)
  })
})

describe('colombianHolidays', () => {
  // Official calendar for 2026 (Easter on April 5).
  it('returns the 18 holidays of 2026', () => {
    expect(colombianHolidays(2026)).toEqual([
      '2026-01-01', // Año Nuevo
      '2026-01-12', // Reyes Magos (Tue 6 -> Mon)
      '2026-03-23', // San José (Thu 19 -> Mon)
      '2026-04-02', // Jueves Santo
      '2026-04-03', // Viernes Santo
      '2026-05-01', // Día del Trabajo
      '2026-05-18', // Ascensión
      '2026-06-08', // Corpus Christi
      '2026-06-15', // Sagrado Corazón
      '2026-06-29', // San Pedro y San Pablo (already a Monday)
      '2026-07-20', // Independencia
      '2026-08-07', // Batalla de Boyacá
      '2026-08-17', // Asunción (Sat 15 -> Mon)
      '2026-10-12', // Día de la Raza (already a Monday)
      '2026-11-02', // Todos los Santos (Sun 1 -> Mon)
      '2026-11-16', // Independencia de Cartagena (Wed 11 -> Mon)
      '2026-12-08', // Inmaculada Concepción
      '2026-12-25', // Navidad
    ])
  })

  // Easter on April 20; San Pedro y San Pablo (Sun 29 -> Mon 30) lands on
  // the same day as Sagrado Corazón, so the year has 17 distinct dates.
  it('returns the holidays of 2025 and de-duplicates the June 30 coincidence', () => {
    expect(colombianHolidays(2025)).toEqual([
      '2025-01-01',
      '2025-01-06',
      '2025-03-24',
      '2025-04-17',
      '2025-04-18',
      '2025-05-01',
      '2025-06-02',
      '2025-06-23',
      '2025-06-30',
      '2025-07-20',
      '2025-08-07',
      '2025-08-18',
      '2025-10-13',
      '2025-11-03',
      '2025-11-17',
      '2025-12-08',
      '2025-12-25',
    ])
  })

  it('returns the 18 holidays of 2024 (leap year, Easter on March 31)', () => {
    expect(colombianHolidays(2024)).toEqual([
      '2024-01-01',
      '2024-01-08',
      '2024-03-25',
      '2024-03-28',
      '2024-03-29',
      '2024-05-01',
      '2024-05-13',
      '2024-06-03',
      '2024-06-10',
      '2024-07-01',
      '2024-07-20',
      '2024-08-07',
      '2024-08-19',
      '2024-10-14',
      '2024-11-04',
      '2024-11-11',
      '2024-12-08',
      '2024-12-25',
    ])
  })

  it('never moves the fixed holidays', () => {
    // 2027-07-20 is a Tuesday: Independencia stays on the 20th.
    expect(colombianHolidays(2027)).toContain('2027-07-20')
    expect(colombianHolidays(2027)).not.toContain('2027-07-26')
  })

  it('keeps an Emiliani holiday on its own day when it already falls on a Monday', () => {
    expect(colombianHolidays(2026)).toContain('2026-06-29')
    expect(colombianHolidays(2026)).not.toContain('2026-07-06')
  })

  it('returns sorted unique ISO dates', () => {
    for (const year of [2023, 2025, 2026, 2030]) {
      const list = colombianHolidays(year)
      expect([...list].sort()).toEqual(list)
      expect(new Set(list).size).toBe(list.length)
      expect(list.every((d) => d.startsWith(String(year)))).toBe(true)
    }
  })
})

describe('isColombianHoliday', () => {
  it('recognizes a holiday and a regular day', () => {
    expect(isColombianHoliday('2026-03-23')).toBe(true)
    expect(isColombianHoliday('2026-03-19')).toBe(false) // the original date was moved
    expect(isColombianHoliday('2026-03-24')).toBe(false)
  })
})
