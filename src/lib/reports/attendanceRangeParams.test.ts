import { describe, it, expect } from 'vitest'
import { MAX_RANGE_DAYS, parseRangeReportParams } from './attendanceRangeParams'

const UUID = '3f2b8c1e-0a4d-4c55-9e2a-7d1f6b9a1c10'

function parse(query: string) {
  return parseRangeReportParams(new URLSearchParams(query))
}

describe('parseRangeReportParams', () => {
  it('accepts a valid range and defaults the format to xlsx', () => {
    const result = parse('from=2026-10-01&to=2026-10-31')
    expect(result).toEqual({
      ok: true,
      params: { from: '2026-10-01', to: '2026-10-31', format: 'xlsx' },
    })
  })

  it('accepts a single day and optional filters', () => {
    const result = parse(
      `from=2026-10-27&to=2026-10-27&careerId=${UUID}&subjectId=${UUID}&format=xlsx`
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.params).toMatchObject({ careerId: UUID, subjectId: UUID })
  })

  it('treats empty filters as absent', () => {
    const result = parse('from=2026-10-01&to=2026-10-02&careerId=&subjectId=')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.params.careerId).toBeUndefined()
  })

  it('requires both dates in YYYY-MM-DD form and real calendar days', () => {
    for (const q of [
      '',
      'from=2026-10-01',
      'to=2026-10-01',
      'from=01/10/2026&to=2026-10-02',
      'from=2026-02-31&to=2026-03-02',
      'from=hoy&to=2026-10-02',
    ]) {
      expect(parse(q).ok, q).toBe(false)
    }
  })

  it('rejects a reversed range', () => {
    const result = parse('from=2026-10-05&to=2026-10-01')
    expect(result).toEqual({ ok: false, error: expect.stringContaining('anterior') })
  })

  it('caps the range at 366 inclusive days', () => {
    expect(MAX_RANGE_DAYS).toBe(366)
    // 2028 is a leap year: 2028-01-01 .. 2028-12-31 is exactly 366 days.
    expect(parse('from=2028-01-01&to=2028-12-31').ok).toBe(true)
    const tooLong = parse('from=2028-01-01&to=2029-01-01')
    expect(tooLong).toEqual({ ok: false, error: expect.stringContaining('366') })
  })

  it('rejects unknown formats and malformed ids', () => {
    expect(parse('from=2026-10-01&to=2026-10-02&format=pdf').ok).toBe(false)
    expect(parse('from=2026-10-01&to=2026-10-02&format=csv').ok).toBe(false)
    expect(parse("from=2026-10-01&to=2026-10-02&subjectId=1' or '1'='1").ok).toBe(false)
    expect(parse('from=2026-10-01&to=2026-10-02&careerId=abc').ok).toBe(false)
  })

  it('rejects malformed ids that merely have 36 id-like characters', () => {
    const base = 'from=2026-10-01&to=2026-10-02'
    expect(parse(`${base}&subjectId=${'-'.repeat(36)}`).ok).toBe(false)
    expect(parse(`${base}&careerId=${'a'.repeat(36)}`).ok).toBe(false)
    expect(parse(`${base}&subjectId=${UUID}`).ok).toBe(true)
  })

  it('restricts the years to 2000-2100', () => {
    for (const q of [
      'from=0050-05-01&to=0050-05-02',
      'from=1999-12-31&to=2000-01-02',
      'from=2026-01-01&to=2101-01-01',
      'from=9999-12-01&to=9999-12-31',
    ]) {
      expect(parse(q).ok, q).toBe(false)
    }
    expect(parse('from=2000-01-01&to=2000-01-31').ok).toBe(true)
    expect(parse('from=2100-12-01&to=2100-12-31').ok).toBe(true)
  })
})
