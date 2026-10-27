import { describe, it, expect } from 'vitest'
import { userReportUrl } from './userReportUrl'
import { parseUserReportParams } from './userReportParams'

const UUID = '3f2b8c1e-0a4d-4c55-9e2a-7d1f6b9a1c10'

describe('userReportUrl', () => {
  it('builds a URL the route accepts, with and without a range', () => {
    const full = userReportUrl({
      userId: UUID,
      format: 'pdf',
      from: '2026-10-01',
      to: '2026-10-31',
    })
    const parsed = parseUserReportParams(new URL(full, 'http://localhost').searchParams)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.params).toMatchObject({ format: 'pdf', from: '2026-10-01' })

    const open = userReportUrl({ userId: UUID, format: 'xlsx' })
    expect(open).not.toContain('from=')
    expect(open).not.toContain('to=')
  })

  it('drops a half-filled range instead of sending an invalid request', () => {
    expect(
      userReportUrl({ userId: UUID, format: 'xlsx', from: '2026-10-01', to: '' })
    ).not.toContain('from=')
  })
})
