import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  CLASS_END_REFRESH_MARGIN_MS,
  msUntilNextClassEnd,
  useRefreshAtClassEnd,
} from './useRefreshAtClassEnd'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const NOW = new Date('2026-10-21T15:00:00.000Z').getTime()
const inMs = (ms: number) => new Date(NOW + ms).toISOString()

describe('msUntilNextClassEnd', () => {
  it('returns null when nothing is in the future', () => {
    expect(msUntilNextClassEnd([], NOW)).toBeNull()
    expect(msUntilNextClassEnd([null, undefined, inMs(-5000), inMs(0)], NOW)).toBeNull()
    expect(msUntilNextClassEnd(['not a date'], NOW)).toBeNull()
  })

  it('targets the nearest future end plus the margin', () => {
    expect(msUntilNextClassEnd([inMs(90_000), inMs(30_000), inMs(-1000)], NOW)).toBe(
      30_000 + CLASS_END_REFRESH_MARGIN_MS
    )
  })

  it('caps the delay at the setTimeout maximum', () => {
    expect(msUntilNextClassEnd([inMs(40 * 24 * 3600 * 1000)], NOW)).toBe(2_147_483_647)
  })
})

describe('useRefreshAtClassEnd', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockRefresh.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('refreshes once, right after the nearest class end', () => {
    renderHook(() => useRefreshAtClassEnd([inMs(60_000), inMs(3_600_000)]))
    vi.advanceTimersByTime(60_000)
    expect(mockRefresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CLASS_END_REFRESH_MARGIN_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('does nothing when every class already ended', () => {
    renderHook(() => useRefreshAtClassEnd([inMs(-60_000)]))
    vi.advanceTimersByTime(10 * 60_000)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('cancels the timer on unmount', () => {
    const { unmount } = renderHook(() => useRefreshAtClassEnd([inMs(60_000)]))
    unmount()
    vi.advanceTimersByTime(120_000)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('reschedules when the list of ends changes', () => {
    const { rerender } = renderHook(({ ends }) => useRefreshAtClassEnd(ends), {
      initialProps: { ends: [inMs(60_000)] },
    })
    rerender({ ends: [inMs(5 * 60_000)] })
    vi.advanceTimersByTime(60_000 + CLASS_END_REFRESH_MARGIN_MS)
    expect(mockRefresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4 * 60_000)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})
