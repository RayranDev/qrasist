import { describe, it, expect } from 'vitest'
import { DEFAULT_APP_SETTINGS, getAppSettings, parseAppSettingsInput } from './appSettings'
import type { SupabaseClient } from '@supabase/supabase-js'

function clientReturning(data: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data }),
  }
  return { from: () => chain } as unknown as SupabaseClient
}

describe('parseAppSettingsInput', () => {
  it('accepts values on the range edges', () => {
    const result = parseAppSettingsInput({ registrationWindowMinutes: 1, defaultClassMinutes: 360 })
    expect(result).toEqual({
      ok: true,
      settings: { registrationWindowMinutes: 1, defaultClassMinutes: 360 },
    })
  })

  it('coerces numeric strings coming from a form', () => {
    const result = parseAppSettingsInput({
      registrationWindowMinutes: '7',
      defaultClassMinutes: '90',
    })
    expect(result.ok).toBe(true)
  })

  it.each([0, 61, 2.5, NaN, -3])('rejects registration window %s', (value) => {
    const result = parseAppSettingsInput({
      registrationWindowMinutes: value,
      defaultClassMinutes: 120,
    })
    expect(result.ok).toBe(false)
  })

  it.each([29, 361, 100.5])('rejects class duration %s', (value) => {
    const result = parseAppSettingsInput({
      registrationWindowMinutes: 5,
      defaultClassMinutes: value,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an empty payload', () => {
    expect(parseAppSettingsInput(undefined).ok).toBe(false)
  })
})

describe('getAppSettings', () => {
  it('maps the singleton row', async () => {
    const settings = await getAppSettings(
      clientReturning({ registration_window_minutes: 10, default_class_minutes: 90 })
    )
    expect(settings).toEqual({ registrationWindowMinutes: 10, defaultClassMinutes: 90 })
  })

  it('falls back to defaults when the row is missing', async () => {
    expect(await getAppSettings(clientReturning(null))).toEqual(DEFAULT_APP_SETTINGS)
  })
})
