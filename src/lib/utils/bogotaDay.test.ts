import { describe, it, expect } from 'vitest'
import { formatBogotaTime } from './bogotaDay'

describe('formatBogotaTime', () => {
  it('renders the time in America/Bogota regardless of the host timezone', () => {
    // 13:59 UTC is 08:59 in Colombia (UTC-5, no DST).
    expect(formatBogotaTime(new Date('2026-03-02T13:59:00Z'))).toMatch(/^08:59\sa\.\sm\.$/)
    // 18:05 UTC is 13:05 -> 01:05 p. m.
    expect(formatBogotaTime('2026-03-02T18:05:00Z')).toMatch(/^01:05\sp\.\sm\.$/)
  })

  it('crosses midnight correctly', () => {
    // 03:30 UTC is 22:30 of the previous day in Colombia.
    expect(formatBogotaTime('2026-03-03T03:30:00Z')).toMatch(/^10:30\sp\.\sm\.$/)
  })
})
