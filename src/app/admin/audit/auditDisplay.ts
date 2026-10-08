import type { AuditAction } from '@/lib/audit/auditLog'

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'attendance.mark': 'Marcó asistencia manual',
  'attendance.update': 'Corrigió asistencia',
  'attendance.remove': 'Quitó asistencia',
  'attendance.relocate': 'Reubicó asistencia de otra sesión',
  'session.register_past': 'Registró una clase pasada',
  'session.archive': 'Archivó una clase',
  'session.reactivate': 'Reactivó una clase',
  'enrollment_request.approve': 'Aprobó solicitud de inscripción',
  'enrollment_request.reject': 'Rechazó solicitud de inscripción',
  'user.role_change': 'Cambió el rol de un usuario',
  'user.create': 'Creó una cuenta',
  'user.deactivate': 'Desactivó una cuenta',
  'user.reactivate': 'Reactivó una cuenta',
  'user.update_account': 'Editó una cuenta',
  'policy.update_global_absence': 'Actualizó la política global de inasistencias',
  'settings.update_attendance': 'Actualizó la configuración de asistencia',
  'justification.approve': 'Aprobó una justificación',
  'justification.reject': 'Rechazó una justificación',
  'justification.register': 'Registró una excusa para un estudiante',
  'auth.password_reset': 'Restableció su contraseña por enlace de correo',
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] || action
}

/**
 * Resumen corto y legible de `details` para la tabla -- el JSON
 * completo queda disponible en el detalle expandible de cada fila,
 * esto es solo para escanear la lista rápido.
 */
export function summarizeAuditDetails(action: string, details: Record<string, unknown>): string {
  const parts: string[] = []

  switch (action as AuditAction) {
    case 'attendance.update':
      if (details.status_before || details.status_after) {
        parts.push(`${details.status_before ?? '?'} → ${details.status_after ?? '?'}`)
      }
      break
    case 'session.register_past':
      if (details.note) parts.push(`nota: ${String(details.note)}`)
      break
    case 'attendance.relocate':
      parts.push('sesión reubicada')
      break
    case 'settings.update_attendance':
      parts.push(
        `registro ${details.registration_window_minutes_before ?? '?'} → ${details.registration_window_minutes_after ?? '?'} min`,
        `clase ${details.default_class_minutes_before ?? '?'} → ${details.default_class_minutes_after ?? '?'} min`
      )
      break
    case 'user.role_change':
      parts.push(`${details.role_before ?? '?'} → ${details.role_after ?? '?'}`)
      break
    case 'user.update_account':
      parts.push(
        Object.keys(details)
          .filter((k) => details[k] === true)
          .join(', ') || 'sin cambios de datos'
      )
      break
    case 'justification.register':
    case 'justification.reject':
    case 'justification.approve':
      if (details.note) parts.push(`nota: ${String(details.note)}`)
      break
    default:
      break
  }

  if (details.reason && typeof details.reason === 'string') {
    parts.push(`motivo: ${details.reason}`)
  }

  return parts.length > 0 ? parts.join(' · ') : '—'
}
