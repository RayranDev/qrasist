import { describe, it, expect } from 'vitest'
import { groupRequests, paginateGroups, type PendingRequest, type RequestGroup } from './grouping'

const req = (
  id: string,
  student: string,
  subject: string,
  requestedAt = '2026-10-01T10:00:00Z'
): PendingRequest => ({
  id,
  requestedAt,
  studentId: `st-${student}`,
  studentName: student,
  studentCode: `code-${student}`,
  subjectId: `su-${subject}`,
  subjectName: subject,
  subjectCode: `${subject.toUpperCase()}-1`,
})

describe('groupRequests', () => {
  const requests = [
    req('1', 'Zoe', 'Física', '2026-10-03T10:00:00Z'),
    req('2', 'Ana', 'Álgebra', '2026-10-02T10:00:00Z'),
    req('3', 'Ana', 'Física', '2026-10-01T10:00:00Z'),
    req('4', 'Bruno', 'Álgebra', '2026-10-01T09:00:00Z'),
  ]

  it('groups by subject, sorted by title, oldest request first', () => {
    const groups = groupRequests(requests, 'subject')

    expect(groups.map((g) => g.title)).toEqual(['Álgebra', 'Física'])
    expect(groups[0].code).toBe('ÁLGEBRA-1')
    expect(groups[0].requests.map((r) => r.id)).toEqual(['4', '2'])
    expect(groups[1].requests.map((r) => r.id)).toEqual(['3', '1'])
  })

  it('groups by student with the student code as the group code', () => {
    const groups = groupRequests(requests, 'student')

    expect(groups.map((g) => g.title)).toEqual(['Ana', 'Bruno', 'Zoe'])
    expect(groups[0].code).toBe('code-Ana')
    expect(groups[0].requests.map((r) => r.id)).toEqual(['3', '2'])
  })

  it('never loses or duplicates a request', () => {
    for (const view of ['subject', 'student'] as const) {
      const ids = groupRequests(requests, view).flatMap((g) => g.requests.map((r) => r.id))
      expect(ids.sort()).toEqual(['1', '2', '3', '4'])
    }
  })

  it('records the full size of each group', () => {
    const groups = groupRequests(requests, 'subject')

    expect(groups.map((g) => [g.totalCount, g.continued])).toEqual([
      [2, false],
      [2, false],
    ])
  })

  it('returns no groups for no requests', () => {
    expect(groupRequests([], 'subject')).toEqual([])
  })

  it('keeps different subjects with the same name apart', () => {
    const a = { ...req('1', 'Ana', 'Cálculo'), subjectId: 'su-a' }
    const b = { ...req('2', 'Bruno', 'Cálculo'), subjectId: 'su-b' }

    expect(groupRequests([a, b], 'subject')).toHaveLength(2)
  })
})

describe('paginateGroups', () => {
  const group = (key: string, size: number): RequestGroup => ({
    key,
    title: key,
    code: null,
    requests: Array.from({ length: size }, (_, i) => req(`${key}-${i}`, 's', key)),
    totalCount: size,
    continued: false,
  })

  it('fills a page up to maxGroups groups', () => {
    const pages = paginateGroups([group('a', 1), group('b', 1), group('c', 1)], {
      maxGroups: 2,
      maxRows: 100,
    })

    expect(pages.map((p) => p.map((g) => g.key))).toEqual([['a', 'b'], ['c']])
  })

  it('starts a new page when the next group would exceed maxRows', () => {
    const pages = paginateGroups([group('a', 6), group('b', 5), group('c', 2)], {
      maxGroups: 10,
      maxRows: 10,
    })

    expect(pages.map((p) => p.map((g) => g.key))).toEqual([['a'], ['b', 'c']])
  })

  it('splits a group larger than maxRows across pages with continuation parts', () => {
    const pages = paginateGroups([group('a', 25), group('b', 1)], { maxGroups: 10, maxRows: 10 })

    expect(pages.map((p) => p.map((g) => [g.key, g.requests.length, g.continued]))).toEqual([
      [['a', 10, false]],
      [['a#1', 10, true]],
      [
        ['a#2', 5, true],
        ['b', 1, false],
      ],
    ])
    // Cada trozo conserva el total real del grupo para el encabezado.
    expect(pages.flat().every((g) => g.key === 'b' || g.totalCount === 25)).toBe(true)
  })

  it('keeps every request of a split group exactly once, in order', () => {
    const big = group('a', 23)
    const pages = paginateGroups([big], { maxGroups: 10, maxRows: 10 })

    expect(pages.flat().flatMap((g) => g.requests.map((r) => r.id))).toEqual(
      big.requests.map((r) => r.id)
    )
  })

  it('does not split a group that fits in a page', () => {
    const pages = paginateGroups([group('a', 10)], { maxGroups: 10, maxRows: 10 })

    expect(pages).toHaveLength(1)
    expect(pages[0][0].continued).toBe(false)
  })

  it('returns no pages for no groups', () => {
    expect(paginateGroups([], { maxGroups: 5, maxRows: 5 })).toEqual([])
  })

  it('keeps every group exactly once across pages', () => {
    const groups = Array.from({ length: 23 }, (_, i) => group(`g${i}`, (i % 4) + 1))
    const pages = paginateGroups(groups, { maxGroups: 5, maxRows: 9 })

    expect(pages.flat().map((g) => g.key)).toEqual(groups.map((g) => g.key))
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(5)
      const rows = page.reduce((sum, g) => sum + g.requests.length, 0)
      expect(rows).toBeLessThanOrEqual(9)
    }
  })
})
