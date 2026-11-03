import { describe, it, expect } from 'vitest'
import { scheduledModalityForDay } from './scheduledModality'

// 2026-03-02 13:20Z is Monday 08:20 in Bogota (day_of_week = 1)
const MONDAY = new Date('2026-03-02T13:20:00Z')
// 2026-03-03 03:00Z is still Monday 22:00 in Bogota
const MONDAY_NIGHT = new Date('2026-03-03T03:00:00Z')

describe('scheduledModalityForDay', () => {
  it('returns the modality of that day block', () => {
    expect(scheduledModalityForDay([{ day_of_week: 1, modality: 'PRESENCIAL' }], MONDAY)).toBe(
      'PRESENCIAL'
    )
    expect(scheduledModalityForDay([{ day_of_week: 1, modality: 'VIRTUAL' }], MONDAY)).toBe(
      'VIRTUAL'
    )
  })

  it('uses the Bogota weekday, not UTC', () => {
    const blocks = [
      { day_of_week: 1, modality: 'PRESENCIAL' },
      { day_of_week: 2, modality: 'VIRTUAL' },
    ]
    expect(scheduledModalityForDay(blocks, MONDAY_NIGHT)).toBe('PRESENCIAL')
  })

  it('is null without a block that day, with unknown values, or when the blocks disagree', () => {
    expect(scheduledModalityForDay([], MONDAY)).toBeNull()
    expect(scheduledModalityForDay([{ day_of_week: 3, modality: 'VIRTUAL' }], MONDAY)).toBeNull()
    expect(scheduledModalityForDay([{ day_of_week: 1, modality: 'ONLINE' }], MONDAY)).toBeNull()
    expect(scheduledModalityForDay([{ day_of_week: 1, modality: null }], MONDAY)).toBeNull()
    expect(
      scheduledModalityForDay(
        [
          { day_of_week: 1, modality: 'PRESENCIAL' },
          { day_of_week: 1, modality: 'VIRTUAL' },
        ],
        MONDAY
      )
    ).toBeNull()
  })

  it('accepts several blocks that agree', () => {
    expect(
      scheduledModalityForDay(
        [
          { day_of_week: 1, modality: 'VIRTUAL' },
          { day_of_week: 1, modality: 'VIRTUAL' },
        ],
        MONDAY
      )
    ).toBe('VIRTUAL')
  })
})
