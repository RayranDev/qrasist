import { describe, it, expect } from 'vitest'
import {
  pageBounds,
  parsePageParam,
  resolveListPage,
  resolveTwoListRedirect,
  totalPagesFor,
} from './pagination'

describe('parsePageParam', () => {
  it('defaults to 1 for missing or invalid values', () => {
    expect(parsePageParam(undefined)).toBe(1)
    expect(parsePageParam('')).toBe(1)
    expect(parsePageParam('abc')).toBe(1)
    expect(parsePageParam('0')).toBe(1)
    expect(parsePageParam('-3')).toBe(1)
  })

  it('parses valid pages and takes the first of repeated params', () => {
    expect(parsePageParam('4')).toBe(4)
    expect(parsePageParam(['2', '9'])).toBe(2)
  })
})

describe('totalPagesFor', () => {
  it('never returns fewer than one page', () => {
    expect(totalPagesFor(0, 25)).toBe(1)
    expect(totalPagesFor(-5, 25)).toBe(1)
  })

  it('rounds up partial pages', () => {
    expect(totalPagesFor(25, 25)).toBe(1)
    expect(totalPagesFor(26, 25)).toBe(2)
    expect(totalPagesFor(100, 25)).toBe(4)
  })
})

describe('pageBounds', () => {
  it('returns inclusive range bounds', () => {
    expect(pageBounds(1, 25)).toEqual({ from: 0, to: 24 })
    expect(pageBounds(3, 25)).toEqual({ from: 50, to: 74 })
  })
})

describe('resolveListPage', () => {
  it('keeps a valid page', () => {
    expect(resolveListPage({ page: 2, total: 60, outOfRange: false }, 25)).toBe(2)
  })

  it('clamps a page past the end to the last one', () => {
    expect(resolveListPage({ page: 4, total: 60, outOfRange: false }, 25)).toBe(3)
    expect(resolveListPage({ page: 3, total: 0, outOfRange: false }, 25)).toBe(1)
  })

  it('falls back to page 1 on an out-of-range error (count unknown)', () => {
    expect(resolveListPage({ page: 5, total: null, outOfRange: true }, 25)).toBe(1)
  })

  it('leaves the page alone when the count is unknown for another reason', () => {
    expect(resolveListPage({ page: 5, total: null, outOfRange: false }, 25)).toBe(5)
  })
})

describe('resolveTwoListRedirect', () => {
  const ok = (page: number, total: number) => ({ page, total, outOfRange: false })

  it('returns null when both pages are valid', () => {
    expect(resolveTwoListRedirect({ available: ok(1, 10), enrolled: ok(2, 60) }, 25)).toBeNull()
  })

  it('fixes only the list that is past its end', () => {
    expect(resolveTwoListRedirect({ available: ok(3, 10), enrolled: ok(2, 60) }, 25)).toEqual({
      page: 1,
      epage: 2,
    })
  })

  it('redirects to page 1 of the list that came back out of range (PGRST103)', () => {
    expect(
      resolveTwoListRedirect(
        {
          available: ok(2, 40),
          enrolled: { page: 4, total: null, outOfRange: true },
        },
        25
      )
    ).toEqual({ page: 2, epage: 1 })
  })
})
