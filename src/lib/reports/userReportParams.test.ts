import { describe, it, expect } from 'vitest'
import { parseUserReportParams } from './userReportParams'

const UUID = '3f2b8c1e-0a4d-4c55-9e2a-7d1f6b9a1c10'

function parse(query: string) {
  return parseUserReportParams(new URLSearchParams(query))
}

describe('parseUserReportParams', () => {
  it('accepts a user alone and defaults the format to xlsx', () => {
    expect(parse(`userId=${UUID}`)).toEqual({
      ok: true,
      params: { userId: UUID, format: 'xlsx' },
    })
  })

  it('accepts both formats and a full range', () => {
    for (const format of ['xlsx', 'pdf']) {
      const result = parse(`userId=${UUID}&format=${format}&from=2026-08-01&to=2026-10-31`)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.params).toMatchObject({ format, from: '2026-08-01' })
    }
  })

  it('requires a well-formed user id', () => {
    expect(parse('')).toEqual({ ok: false, error: 'userId es requerido.' })
    expect(parse('userId=abc').ok).toBe(false)
    expect(parse("userId=1' or '1'='1").ok).toBe(false)
  })

  it('requires from and to together, in order and within 366 days', () => {
    expect(parse(`userId=${UUID}&from=2026-08-01`).ok).toBe(false)
    expect(parse(`userId=${UUID}&to=2026-08-01`).ok).toBe(false)
    expect(parse(`userId=${UUID}&from=2026-08-10&to=2026-08-01`).ok).toBe(false)
    expect(parse(`userId=${UUID}&from=2026-02-31&to=2026-03-05`).ok).toBe(false)
    expect(parse(`userId=${UUID}&from=2026-01-01&to=2027-06-01`)).toEqual({
      ok: false,
      error: expect.stringContaining('366'),
    })
  })

  it('treats empty dates as absent so the modal can leave them blank', () => {
    const result = parse(`userId=${UUID}&from=&to=&format=pdf`)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.params.from).toBeUndefined()
  })

  it('rejects unknown formats', () => {
    expect(parse(`userId=${UUID}&format=csv`).ok).toBe(false)
  })

  it('rejects ids that only look like uuids', () => {
    expect(parse(`userId=${'-'.repeat(36)}`).ok).toBe(false)
    expect(parse(`userId=${'f'.repeat(36)}`).ok).toBe(false)
  })

  it('restricts the years to 2000-2100', () => {
    expect(parse(`userId=${UUID}&from=0050-05-01&to=0050-05-02`).ok).toBe(false)
    expect(parse(`userId=${UUID}&from=2026-01-01&to=2101-01-01`).ok).toBe(false)
    expect(parse(`userId=${UUID}&from=2100-01-01&to=2100-01-31`).ok).toBe(true)
  })
})
