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

describe('attendance settings audit display', () => {
  it('lists every changed field with before and after, then the reason', () => {
    expect(
      summarizeAuditDetails('settings.update_attendance', {
        changes: {
          late_after_minutes: { before: 20, after: 25 },
          lates_per_absence: { before: null, after: 3 },
        },
        reason: 'Acta de coordinación',
      })
    ).toBe(
      'tolerancia de tardanza: 20 min → 25 min · tardanzas por falta: ninguna → 3 · motivo: Acta de coordinación'
    )
  })

  it('still renders rows written before the global policy existed', () => {
    expect(
      summarizeAuditDetails('settings.update_attendance', {
        registration_window_minutes_before: 5,
        registration_window_minutes_after: 30,
        default_class_minutes_before: 120,
        default_class_minutes_after: 120,
      })
    ).toBe('registro 5 → 30 min · clase 120 → 120 min')
  })

  it('keeps the historical bulk overwrite actions readable', () => {
    expect(auditActionLabel('policy.update_global_absence')).toBe(
      'Actualizó la política global de inasistencias'
    )
    expect(auditActionLabel('policy.update_global_refused')).toContain('política global')
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

describe('relocation audit display', () => {
  it('flags a relocation whose capture data could not be cleared', () => {
    expect(summarizeAuditDetails('attendance.relocate', {})).toBe('sesión reubicada')
    expect(summarizeAuditDetails('attendance.relocate', { capture_clear_failed: true })).toBe(
      'sesión reubicada · NO se pudo borrar la IP y la ubicación'
    )
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
