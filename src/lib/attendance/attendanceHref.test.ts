import { describe, it, expect } from 'vitest'
import { attendanceHref } from './attendanceHref'

describe('attendanceHref', () => {
  it('returns the bare path with no params', () => {
    expect(attendanceHref({})).toBe('/admin/attendance')
  })

  it('builds list links with filters and page, skipping page 1', () => {
    expect(attendanceHref({ subjectId: 's1', careerId: 'c1', page: 2, sessionId: 'x' })).toBe(
      '/admin/attendance?careerId=c1&subjectId=s1&sessionId=x&page=2'
    )
    expect(attendanceHref({ subjectId: 's1', page: 1 })).toBe('/admin/attendance?subjectId=s1')
  })

  it('builds calendar links keeping month, day and filters', () => {
    expect(
      attendanceHref({
        view: 'calendar',
        month: '2026-10',
        day: '2026-10-27',
        subjectId: 's1',
        sessionId: 'x',
        page: 3,
      })
    ).toBe('/admin/attendance?view=calendar&month=2026-10&day=2026-10-27&subjectId=s1&sessionId=x')
  })

  it('does not leak calendar params into the list view', () => {
    expect(attendanceHref({ view: 'list', month: '2026-10', day: '2026-10-27' })).toBe(
      '/admin/attendance'
    )
  })
})
