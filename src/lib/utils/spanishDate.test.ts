import { describe, expect, it } from 'vitest'
import {
  capitalizeFirst,
  formatBogotaClock,
  formatBogotaDateNumeric,
  formatBogotaDateTimeLong,
  formatBogotaDayLong,
  INVALID_DATE_TEXT,
} from './spanishDate'

describe('capitalizeFirst', () => {
  it('capitalizes only the first letter and leaves the rest untouched', () => {
    expect(capitalizeFirst('miércoles 21 de octubre')).toBe('Miércoles 21 de octubre')
    expect(capitalizeFirst('Ya capitalizada De Algo')).toBe('Ya capitalizada De Algo')
    expect(capitalizeFirst('')).toBe('')
  })

  it('never title-cases the connectors ("de") or the month', () => {
    const text = capitalizeFirst(formatBogotaDayLong('2026-10-21T15:00:00Z'))
    expect(text).toBe('Miércoles 21 de octubre')
    expect(text).not.toMatch(/ De | Octubre/)
  })
})

describe('formatBogotaDayLong', () => {
  it('uses lowercase weekday, "de" and month', () => {
    expect(formatBogotaDayLong('2026-10-21T15:00:00Z')).toBe('miércoles 21 de octubre')
    expect(formatBogotaDayLong('2026-01-01T15:00:00Z')).toBe('jueves 1 de enero')
  })

  it('uses the Bogotá day, not the UTC day, across midnight', () => {
    // 03:30 UTC of the 22nd is still the 21st at 22:30 in Bogotá.
    expect(formatBogotaDayLong('2026-10-22T03:30:00Z')).toBe('miércoles 21 de octubre')
  })
})

describe('formatBogotaClock', () => {
  it('renders the Bogotá time, not the UTC one (DEF: Última clase)', () => {
    // 23:02 UTC is 6:02 p. m. in Bogotá.
    expect(formatBogotaClock('2026-10-21T23:02:00Z')).toBe('6:02 p. m.')
  })

  it('handles noon, midnight and the morning', () => {
    expect(formatBogotaClock('2026-10-21T17:00:00Z')).toBe('12:00 p. m.')
    expect(formatBogotaClock('2026-10-21T05:05:00Z')).toBe('12:05 a. m.')
    expect(formatBogotaClock('2026-10-21T13:59:00Z')).toBe('8:59 a. m.')
  })

  it('is independent of the host timezone (same output on server and browser)', () => {
    const original = process.env.TZ
    try {
      const outputs = ['UTC', 'America/Bogota', 'Asia/Tokyo'].map((tz) => {
        process.env.TZ = tz
        return formatBogotaDateTimeLong(new Date('2026-10-21T23:02:00Z'))
      })
      expect(new Set(outputs).size).toBe(1)
      expect(outputs[0]).toBe('miércoles 21 de octubre, 6:02 p. m.')
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
})

describe('formatBogotaDateNumeric', () => {
  it('pads day and month and uses the Bogotá calendar day', () => {
    expect(formatBogotaDateNumeric('2026-03-02T15:00:00Z')).toBe('02/03/2026')
    expect(formatBogotaDateNumeric('2026-03-03T03:30:00Z')).toBe('02/03/2026')
  })
})

describe('invalid dates', () => {
  const inputs: (string | Date)[] = ['', 'not a date', '2026-13-45', '2026-02-31', new Date(NaN)]

  it.each(inputs.map((v) => [String(v), v] as const))(
    'every formatter returns the placeholder for %j',
    (_label, value) => {
      expect(formatBogotaDayLong(value)).toBe(INVALID_DATE_TEXT)
      expect(formatBogotaClock(value)).toBe(INVALID_DATE_TEXT)
      expect(formatBogotaDateTimeLong(value)).toBe(INVALID_DATE_TEXT)
      expect(formatBogotaDateNumeric(value)).toBe(INVALID_DATE_TEXT)
    }
  )

  it('never leaks NaN or throws', () => {
    expect(() => formatBogotaDateTimeLong(new Date(NaN))).not.toThrow()
    expect(formatBogotaDateTimeLong('garbage')).not.toMatch(/NaN|undefined/)
  })
})

describe('date-only strings', () => {
  it('are a civil day, not UTC midnight (which would be the previous day in Bogotá)', () => {
    expect(formatBogotaDayLong('2026-10-21')).toBe('miércoles 21 de octubre')
    expect(formatBogotaDateNumeric('2026-10-21')).toBe('21/10/2026')
  })
})
