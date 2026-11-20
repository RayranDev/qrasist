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
  const base = { registrationWindowMinutes: 5, defaultClassMinutes: 120, qrRotationSeconds: 20 }

  it('accepts values on the range edges', () => {
    const result = parseAppSettingsInput({
      registrationWindowMinutes: 1,
      defaultClassMinutes: 360,
      qrRotationSeconds: 60,
    })
    expect(result).toEqual({
      ok: true,
      settings: { registrationWindowMinutes: 1, defaultClassMinutes: 360, qrRotationSeconds: 60 },
    })
    expect(parseAppSettingsInput({ ...base, qrRotationSeconds: 10 }).ok).toBe(true)
  })

  it('coerces numeric strings coming from a form', () => {
    const result = parseAppSettingsInput({
      registrationWindowMinutes: '7',
      defaultClassMinutes: '90',
      qrRotationSeconds: '30',
    })
    expect(result.ok).toBe(true)
  })

  it.each([0, 61, 2.5, NaN, -3])('rejects registration window %s', (value) => {
    expect(parseAppSettingsInput({ ...base, registrationWindowMinutes: value }).ok).toBe(false)
  })

  it.each([29, 361, 100.5])('rejects class duration %s', (value) => {
    expect(parseAppSettingsInput({ ...base, defaultClassMinutes: value }).ok).toBe(false)
  })

  it.each([9, 61, 20.5, NaN, 0, undefined, ''])('rejects QR rotation %s', (value) => {
    const result = parseAppSettingsInput({ ...base, qrRotationSeconds: value })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/rotación del código QR/)
  })

  it('rejects an empty payload', () => {
    expect(parseAppSettingsInput(undefined).ok).toBe(false)
  })
})

describe('getAppSettings', () => {
  it('maps the singleton row', async () => {
    const settings = await getAppSettings(
      clientReturning({
        registration_window_minutes: 10,
        default_class_minutes: 90,
        qr_rotation_seconds: 30,
      })
    )
    expect(settings).toEqual({
      registrationWindowMinutes: 10,
      defaultClassMinutes: 90,
      qrRotationSeconds: 30,
    })
  })

  it('uses the default rotation when the row has none', async () => {
    const settings = await getAppSettings(
      clientReturning({ registration_window_minutes: 10, default_class_minutes: 90 })
    )
    expect(settings.qrRotationSeconds).toBe(20)
  })

  it('retries without the rotation column when it does not exist yet (038 not applied)', async () => {
    const selects: string[] = []
    const chain = {
      select: (columns: string) => {
        selects.push(columns)
        return chain
      },
      eq: () => chain,
      maybeSingle: async () =>
        selects.length === 1
          ? { data: null, error: { message: 'column qr_rotation_seconds does not exist' } }
          : { data: { registration_window_minutes: 12, default_class_minutes: 100 }, error: null },
    }
    const settings = await getAppSettings({ from: () => chain } as unknown as SupabaseClient)

    expect(selects).toHaveLength(2)
    expect(selects[1]).not.toMatch(/qr_rotation_seconds/)
    expect(settings).toEqual({
      registrationWindowMinutes: 12,
      defaultClassMinutes: 100,
      qrRotationSeconds: 20,
    })
  })

  it('falls back to defaults when the row is missing', async () => {
    expect(await getAppSettings(clientReturning(null))).toEqual(DEFAULT_APP_SETTINGS)
  })
})
