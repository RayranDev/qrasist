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

describe('capture data export audit display', () => {
  it('labels the action in Spanish', () => {
    expect(auditActionLabel('report.export_capture_data')).toBe(
      'Descargó un reporte con IP y ubicación de los estudiantes'
    )
  })

  it('summarizes which report and how many rows', () => {
    expect(
      summarizeAuditDetails('report.export_capture_data', {
        report: 'attendance-range',
        rows: 120,
      })
    ).toBe('asistencia por rango · 120 filas')
  })
})

describe('modality override audit display', () => {
  it('labels the action in Spanish and summarizes chosen vs scheduled modality', () => {
    expect(auditActionLabel('session.modality_differs_from_schedule')).toBe(
      'Abrió una clase con una modalidad distinta a la del horario'
    )
    expect(
      summarizeAuditDetails('session.modality_differs_from_schedule', {
        chosen_modality: 'VIRTUAL',
        scheduled_modality: 'PRESENCIAL',
      })
    ).toBe('virtual (horario: presencial)')
  })
})
