import { describe, it, expect } from 'vitest'
import { auditActionLabel, summarizeAuditDetails } from './auditDisplay'

describe('justification audit display', () => {
  it('labels the change_decision action', () => {
    expect(auditActionLabel('justification.change_decision')).toBe(
      'Cambió la decisión de una justificación'
    )
  })

  it('summarizes a decision change with Spanish status labels and the reason', () => {
    expect(
      summarizeAuditDetails('justification.change_decision', {
        from: 'APPROVED',
        to: 'PENDING',
        reason: 'Falta la constancia',
      })
    ).toBe('Aprobada → Pendiente · motivo: Falta la constancia')
  })

  it('flags bulk approvals', () => {
    expect(summarizeAuditDetails('justification.approve', { bulk: true, note: null })).toBe(
      'aprobación en lote'
    )
    expect(summarizeAuditDetails('justification.approve', { note: null })).toBe('—')
  })
})
