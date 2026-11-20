import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LATE_AFTER_MINUTES,
  lateTrackingReachable,
  smallestUnreachableLateAfter,
} from './lateTracking'
import { DEFAULT_REGISTRATION_WINDOW_MINUTES } from '@/lib/settings/appSettings'

describe('defaults', () => {
  it('keep late tracking reachable out of the box (window > tolerance)', () => {
    expect(DEFAULT_REGISTRATION_WINDOW_MINUTES).toBe(30)
    expect(DEFAULT_LATE_AFTER_MINUTES).toBe(20)
    expect(
      lateTrackingReachable(DEFAULT_REGISTRATION_WINDOW_MINUTES, DEFAULT_LATE_AFTER_MINUTES)
    ).toBe(true)
  })
})

describe('lateTrackingReachable', () => {
  it('is true when the window is longer than the tolerance', () => {
    expect(lateTrackingReachable(30, 20)).toBe(true)
    expect(lateTrackingReachable(21, 20)).toBe(true)
  })

  it('is false when the window equals the tolerance: the scan that would be late is rejected', () => {
    expect(lateTrackingReachable(20, 20)).toBe(false)
  })

  it('is false when the window is shorter than the tolerance', () => {
    expect(lateTrackingReachable(5, 15)).toBe(false)
  })

  it('is true (not applicable) when late tracking is disabled', () => {
    expect(lateTrackingReachable(5, null)).toBe(true)
    expect(lateTrackingReachable(1, undefined)).toBe(true)
  })
})

describe('smallestUnreachableLateAfter', () => {
  it('returns null when every tolerance is reachable', () => {
    expect(smallestUnreachableLateAfter(30, [20, 15, 10])).toBeNull()
  })

  it('returns the smallest tolerance the window does not exceed', () => {
    expect(smallestUnreachableLateAfter(10, [30, 20, 15, 5])).toBe(15)
  })

  it('ignores disabled (null) tolerances and handles an empty list', () => {
    expect(smallestUnreachableLateAfter(10, [null, undefined])).toBeNull()
    expect(smallestUnreachableLateAfter(10, [])).toBeNull()
  })
})
