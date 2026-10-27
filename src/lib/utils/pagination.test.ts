import { describe, it, expect } from 'vitest'
import { pageBounds, parsePageParam, totalPagesFor } from './pagination'

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
