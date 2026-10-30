import { describe, it, expect } from 'vitest'
import { chunk, selectionState, setSelected } from './selection'

describe('selectionState', () => {
  it('reports none, some and all', () => {
    const selected = new Set(['a', 'b'])

    expect(selectionState(selected, ['c', 'd'])).toBe('none')
    expect(selectionState(selected, ['a', 'c'])).toBe('some')
    expect(selectionState(selected, ['a', 'b'])).toBe('all')
  })

  it('treats an empty list as none', () => {
    expect(selectionState(new Set(['a']), [])).toBe('none')
  })
})

describe('setSelected', () => {
  it('adds and removes without mutating the original', () => {
    const original = new Set(['a'])

    const added = setSelected(original, ['b', 'c'], true)
    const removed = setSelected(added, ['a', 'c'], false)

    expect([...original]).toEqual(['a'])
    expect([...added].sort()).toEqual(['a', 'b', 'c'])
    expect([...removed]).toEqual(['b'])
  })
})

describe('chunk', () => {
  it('splits into batches of at most size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns no batches for an empty list', () => {
    expect(chunk([], 3)).toEqual([])
  })

  it('splits 250 ids into 100/100/50', () => {
    const batches = chunk(
      Array.from({ length: 250 }, (_, i) => i),
      100
    )

    expect(batches.map((b) => b.length)).toEqual([100, 100, 50])
  })
})
