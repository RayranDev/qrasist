import { describe, it, expect } from 'vitest'
import { attendanceRangeUrl } from './attendanceRangeUrl'
import { parseRangeReportParams } from './attendanceRangeParams'

describe('attendanceRangeUrl', () => {
  it('builds a URL the route accepts, with and without filters', () => {
    const subjectId = '3f2b8c1e-0a4d-4c55-9e2a-7d1f6b9a1c10'
    const url = attendanceRangeUrl({ from: '2026-10-01', to: '2026-10-31', subjectId })
    expect(url.startsWith('/admin/reports/attendance-range?')).toBe(true)
    const parsed = parseRangeReportParams(new URL(url, 'http://localhost').searchParams)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.params).toMatchObject({ from: '2026-10-01', subjectId })

    const bare = attendanceRangeUrl({ from: '2026-10-05', to: '2026-10-05' })
    expect(bare).not.toContain('careerId')
    expect(bare).not.toContain('subjectId')
  })
})
