import { describe, expect, it } from 'vitest'
import { buildPolicyCountChangedMessage, buildPolicyOverwriteMessage } from './policyOverwrite'

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
