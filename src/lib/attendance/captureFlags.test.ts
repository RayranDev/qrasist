import { describe, it, expect } from 'vitest'
import {
  SUSPICIOUS_DISTANCE_METERS,
  distanceMeters,
  evaluateCapture,
  evaluateSessionCapture,
  mostCommonIp,
  sessionGroupIp,
} from './captureFlags'

const CLASSROOM = { modality: 'PRESENCIAL', latitude: 4.6097, longitude: -74.0817 }
// ~11 m per 0.0001 degrees of latitude.
const NEAR = { latitude: 4.6098, longitude: -74.0817 }
const FAR = { latitude: 4.6197, longitude: -74.0817 } // ~1.1 km

function att(ip: string | null, coords: { latitude: number; longitude: number } | null = null) {
  return {
    ip_address: ip,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  }
}

describe('distanceMeters', () => {
  it('is zero for the same point and about 1.1 km for 0.01 degrees of latitude', () => {
    expect(distanceMeters(4.6, -74.1, 4.6, -74.1)).toBe(0)
    expect(distanceMeters(4.6, -74.1, 4.61, -74.1)).toBeGreaterThan(1100)
    expect(distanceMeters(4.6, -74.1, 4.61, -74.1)).toBeLessThan(1120)
  })
})

describe('mostCommonIp', () => {
  it('returns the IP shared by at least two attendances', () => {
    expect(mostCommonIp(['1.1.1.1', '1.1.1.1', '2.2.2.2'])).toBe('1.1.1.1')
  })

  it('has no group when every IP is different or there is a single attendance', () => {
    expect(mostCommonIp(['1.1.1.1', '2.2.2.2'])).toBeNull()
    expect(mostCommonIp(['1.1.1.1'])).toBeNull()
    expect(mostCommonIp([])).toBeNull()
  })

  it('ignores missing, unknown and manual markers', () => {
    expect(mostCommonIp([null, undefined, 'unknown', 'unknown', 'manual', 'manual'])).toBeNull()
    expect(mostCommonIp(['manual', 'manual', '3.3.3.3', '3.3.3.3'])).toBe('3.3.3.3')
  })
})

describe('sessionGroupIp', () => {
  const rows = [att('1.1.1.1'), att('1.1.1.1'), att('2.2.2.2')]

  it('is computed for in-person and legacy classes', () => {
    expect(sessionGroupIp({ modality: 'PRESENCIAL' }, rows)).toBe('1.1.1.1')
    expect(sessionGroupIp({ modality: null }, rows)).toBe('1.1.1.1')
  })

  it('is null for a virtual class', () => {
    expect(sessionGroupIp({ modality: 'VIRTUAL' }, rows)).toBeNull()
  })
})

describe('evaluateCapture', () => {
  it('flags an IP different from the group', () => {
    const ev = evaluateCapture(CLASSROOM, att('2.2.2.2'), '1.1.1.1')
    expect(ev).toMatchObject({ kind: 'captured', ip: '2.2.2.2', ipDiffers: true, farAway: false })
  })

  it('does not flag the group IP, an unknown IP, or a class without a group', () => {
    expect(evaluateCapture(CLASSROOM, att('1.1.1.1'), '1.1.1.1').ipDiffers).toBe(false)
    const unknown = evaluateCapture(CLASSROOM, att('unknown'), '1.1.1.1')
    expect(unknown).toMatchObject({ ip: null, ipDiffers: false })
    expect(evaluateCapture(CLASSROOM, att('2.2.2.2'), null).ipDiffers).toBe(false)
  })

  it('measures the distance and flags more than 300 m away', () => {
    const near = evaluateCapture(CLASSROOM, att('1.1.1.1', NEAR), null)
    expect(near.distanceMeters).toBeGreaterThan(0)
    expect(near.distanceMeters as number).toBeLessThan(SUSPICIOUS_DISTANCE_METERS)
    expect(near.farAway).toBe(false)

    const far = evaluateCapture(CLASSROOM, att('1.1.1.1', FAR), null)
    expect(far.distanceMeters as number).toBeGreaterThan(SUSPICIOUS_DISTANCE_METERS)
    expect(far.farAway).toBe(true)
  })

  it('has no distance when the student or the professor location is missing', () => {
    expect(evaluateCapture(CLASSROOM, att('1.1.1.1'), null).distanceMeters).toBeNull()
    const noClassroom = { modality: 'PRESENCIAL', latitude: null, longitude: null }
    const ev = evaluateCapture(noClassroom, att('1.1.1.1', FAR), null)
    expect(ev).toMatchObject({ distanceMeters: null, farAway: false })
  })

  it('never evaluates a virtual class, even if the row still holds historical values', () => {
    const virtual = { ...CLASSROOM, modality: 'VIRTUAL' }
    expect(evaluateCapture(virtual, att('2.2.2.2', FAR), '1.1.1.1')).toEqual({
      kind: 'virtual',
      ip: null,
      latitude: null,
      longitude: null,
      distanceMeters: null,
      ipDiffers: false,
      farAway: false,
    })
  })

  it('treats manual marks as having no capture', () => {
    expect(evaluateCapture(CLASSROOM, att('manual'), '1.1.1.1')).toMatchObject({
      kind: 'manual',
      ip: null,
      ipDiffers: false,
      farAway: false,
    })
  })
})

describe('evaluateSessionCapture', () => {
  it('compares every attendance against the IP shared by the class', () => {
    const rows = [att('1.1.1.1', NEAR), att('1.1.1.1'), att('9.9.9.9', FAR), att('manual')]
    const result = evaluateSessionCapture(CLASSROOM, rows)

    expect(result.map((r) => r.evaluation.kind)).toEqual([
      'captured',
      'captured',
      'captured',
      'manual',
    ])
    expect(result.map((r) => r.evaluation.ipDiffers)).toEqual([false, false, true, false])
    expect(result.map((r) => r.evaluation.farAway)).toEqual([false, false, true, false])
    expect(result[0].attendance).toBe(rows[0])
  })

  it('returns virtual evaluations for every row of a virtual class', () => {
    const rows = [att('1.1.1.1', NEAR), att('1.1.1.1', NEAR)]
    const result = evaluateSessionCapture({ ...CLASSROOM, modality: 'VIRTUAL' }, rows)
    expect(result.every((r) => r.evaluation.kind === 'virtual')).toBe(true)
  })
})
