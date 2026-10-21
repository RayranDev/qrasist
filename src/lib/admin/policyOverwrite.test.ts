import { describe, expect, it } from 'vitest'
import {
  buildPolicyAppliedMismatchMessage,
  buildPolicyCountChangedMessage,
  buildPolicyOverwriteMessage,
} from './policyOverwrite'

describe('buildPolicyOverwriteMessage', () => {
  it('states the exact number of active subjects and the audit notice', () => {
    expect(buildPolicyOverwriteMessage(37)).toBe(
      'Se reemplazará la política de 37 materias activas. Esta acción queda en la auditoría.'
    )
  })

  it('uses the singular for a single subject', () => {
    expect(buildPolicyOverwriteMessage(1)).toBe(
      'Se reemplazará la política de 1 materia activa. Esta acción queda en la auditoría.'
    )
  })
})

describe('buildPolicyCountChangedMessage', () => {
  it('reports the current count so the admin can confirm again', () => {
    expect(buildPolicyCountChangedMessage(38)).toContain('ahora son 38')
  })
})

describe('buildPolicyAppliedMismatchMessage', () => {
  it('states both the confirmed and the updated count', () => {
    const message = buildPolicyAppliedMismatchMessage(37, 36)
    expect(message).toContain('36 materias activas')
    expect(message).toContain('confirmado 37')
  })
})
