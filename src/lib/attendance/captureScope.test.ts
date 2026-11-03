import { describe, it, expect } from 'vitest'
import { redactCaptureFields, sessionCapturesLocation } from './captureScope'

describe('sessionCapturesLocation', () => {
  it('captures for in-person classes', () => {
    expect(sessionCapturesLocation('PRESENCIAL')).toBe(true)
  })

  it('does not capture for virtual classes', () => {
    expect(sessionCapturesLocation('VIRTUAL')).toBe(false)
  })

  it('treats a missing modality (legacy rows, callers without one) as in person', () => {
    expect(sessionCapturesLocation(null)).toBe(true)
    expect(sessionCapturesLocation(undefined)).toBe(true)
  })
})

describe('redactCaptureFields', () => {
  const row = { id: 'a1', ip_address: '203.0.113.7', latitude: 4.6, longitude: -74.1 }

  it('blanks IP and coordinates for a virtual class without touching other fields', () => {
    expect(redactCaptureFields('VIRTUAL', row)).toEqual({
      id: 'a1',
      ip_address: null,
      latitude: null,
      longitude: null,
    })
    // the input row is not mutated
    expect(row.ip_address).toBe('203.0.113.7')
  })

  it('returns the row as is for in-person and legacy classes', () => {
    expect(redactCaptureFields('PRESENCIAL', row)).toBe(row)
    expect(redactCaptureFields(null, row)).toBe(row)
  })
})
