import { describe, it, expect } from 'vitest'
import {
  JUSTIFICATION_BUSINESS_DAYS,
  getJustificationDeadline,
  isSessionAlreadyHeld,
  isWithinJustificationWindow,
  validateAttachmentMeta,
} from './eligibility'

describe('justification window (RF26: 3 business days)', () => {
  it('is three business days', () => {
    expect(JUSTIFICATION_BUSINESS_DAYS).toBe(3)
  })

  it('ends on the last instant of the third business day after the session', () => {
    // Monday 2 Mar 2026 -> deadline Thursday 5 Mar, 23:59:59.999 Bogota
    expect(getJustificationDeadline('2026-03-02T13:00:00Z').toISOString()).toBe(
      '2026-03-06T04:59:59.999Z'
    )
  })

  it('accepts the last second of the deadline day and rejects the next one', () => {
    const session = '2026-03-02T13:00:00Z'
    expect(isWithinJustificationWindow(session, new Date('2026-03-06T04:59:59Z'))).toBe(true)
    expect(isWithinJustificationWindow(session, new Date('2026-03-06T05:00:00Z'))).toBe(false)
  })

  it('extends across a weekend and a Monday holiday', () => {
    // Thursday 19 Mar 2026: Fri 20, (Sat, Sun, Mon 23 holiday), Tue 24, Wed 25
    const session = '2026-03-19T15:00:00Z'
    // The 26th was still inside the old 7-calendar-day window but is past 3 business days
    expect(isWithinJustificationWindow(session, new Date('2026-03-25T20:00:00Z'))).toBe(true)
    expect(isWithinJustificationWindow(session, new Date('2026-03-26T12:00:00Z'))).toBe(false)
  })

  it('does not penalize a session right before a long weekend', () => {
    // Wednesday 1 Apr 2026 (Holy Thursday/Friday follow): deadline Wed 8 Apr
    const session = '2026-04-01T15:00:00Z'
    expect(isWithinJustificationWindow(session, new Date('2026-04-08T20:00:00Z'))).toBe(true)
    expect(isWithinJustificationWindow(session, new Date('2026-04-09T12:00:00Z'))).toBe(false)
  })

  it('accepts Date objects as well as ISO strings', () => {
    const session = new Date('2026-03-02T13:00:00Z')
    expect(isWithinJustificationWindow(session, new Date('2026-03-04T12:00:00Z'))).toBe(true)
  })
})

describe('isSessionAlreadyHeld', () => {
  const date = '2026-03-02T13:00:00Z' // 08:00 Bogota

  it('is false while the class is running even though the 5-minute QR window already closed', () => {
    const session = { date, class_ends_at: '2026-03-02T15:00:00Z' }
    // 20 minutes in: registration window (5 min) is over, class is not
    expect(isSessionAlreadyHeld(session, 120, new Date('2026-03-02T13:20:00Z'))).toBe(false)
  })

  it('becomes true only after the class end', () => {
    const session = { date, class_ends_at: '2026-03-02T15:00:00Z' }
    expect(isSessionAlreadyHeld(session, 120, new Date('2026-03-02T15:00:00Z'))).toBe(false)
    expect(isSessionAlreadyHeld(session, 120, new Date('2026-03-02T15:00:01Z'))).toBe(true)
  })

  it('falls back to date + default minutes when class_ends_at is missing', () => {
    const legacy = { date, class_ends_at: null }
    expect(isSessionAlreadyHeld(legacy, 120, new Date('2026-03-02T14:59:00Z'))).toBe(false)
    expect(isSessionAlreadyHeld(legacy, 120, new Date('2026-03-02T15:01:00Z'))).toBe(true)
  })
})

describe('validateAttachmentMeta', () => {
  it('accepts a PDF within the size limit', () => {
    expect(
      validateAttachmentMeta({ fileName: 'a.pdf', contentType: 'application/pdf', size: 1000 })
    ).toEqual({ ok: true, extension: 'pdf' })
  })

  it('treats .jpeg as jpg', () => {
    expect(
      validateAttachmentMeta({ fileName: 'a.JPEG', contentType: 'image/jpeg', size: 1000 })
    ).toEqual({ ok: true, extension: 'jpg' })
  })

  it('rejects a mismatched extension', () => {
    expect(
      validateAttachmentMeta({ fileName: 'a.exe', contentType: 'application/pdf', size: 1000 }).ok
    ).toBe(false)
  })

  it('rejects an unknown content type', () => {
    expect(
      validateAttachmentMeta({ fileName: 'a.gif', contentType: 'image/gif', size: 1000 }).ok
    ).toBe(false)
  })

  it('rejects empty and oversized files', () => {
    expect(
      validateAttachmentMeta({ fileName: 'a.pdf', contentType: 'application/pdf', size: 0 }).ok
    ).toBe(false)
    expect(
      validateAttachmentMeta({
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        size: 5 * 1024 * 1024 + 1,
      }).ok
    ).toBe(false)
  })
})
