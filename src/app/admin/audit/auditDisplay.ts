import type { AuditAction } from '@/lib/audit/auditLog'

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'attendance.mark': 'Marcó asistencia manual',
  'attendance.update': 'Corrigió asistencia',
  'attendance.remove': 'Quitó asistencia',
  'attendance.relocate': 'Reubicó asistencia de otra sesión',
  'session.register_past': 'Registró una clase pasada',
  'session.archive': 'Archivó una clase',
  'session.reactivate': 'Reactivó una clase',
  'session.suspend': 'Suspendió una clase',
  'session.unsuspend': 'Deshizo la suspensión de una clase',
  'class_omission.justify': 'Justificó una clase no registrada',
  'enrollment_request.approve': 'Aprobó solicitud de inscripción',
  'enrollment_request.reject': 'Rechazó solicitud de inscripción',
  'user.role_change': 'Cambió el rol de un usuario',
  'user.role_change_failed': 'Falló un cambio de rol (se revirtió o requiere revisión)',
  'user.assign_subjects': 'Asignó materias a un docente',
  'user.enroll_subjects': 'Matriculó a un estudiante en materias',
  'user.create': 'Creó una cuenta',
  'user.deactivate': 'Desactivó una cuenta',
  'user.reactivate': 'Reactivó una cuenta',
  'user.update_account': 'Editó una cuenta',
  'policy.update_global_absence': 'Actualizó la política global de inasistencias',
  'policy.update_global_refused':
    'Se rechazó actualizar la política global (la cantidad de materias cambió)',
  'settings.update_attendance': 'Actualizó la configuración de asistencia',
  'justification.approve': 'Aprobó una justificación',
  'justification.reject': 'Rechazó una justificación',
  'justification.register': 'Registró una excusa para un estudiante',
  'justification.change_decision': 'Cambió la decisión de una justificación',
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
      if (typeof details.enrollments_removed === 'number' && details.enrollments_removed > 0) {
        parts.push(`desmatriculado de ${details.enrollments_removed}`)
      }
      if (typeof details.subjects_unassigned === 'number' && details.subjects_unassigned > 0) {
        parts.push(`desvinculado de ${details.subjects_unassigned} materias como docente`)
      }
      if (details.pending_requests_cancel_failed === true) {
        parts.push('no se cancelaron las solicitudes pendientes')
      }
      break
    case 'user.role_change_failed':
      parts.push(`${details.role_before ?? '?'} → ${details.role_after ?? '?'}`)
      if (details.outcome === 'revert_failed') parts.push('NO se pudo restaurar el rol')
      else if (details.outcome === 'reverted') parts.push('rol restaurado')
      break
    case 'user.enroll_subjects':
      if (typeof details.enrolled_count === 'number') {
        parts.push(`${details.enrolled_count} materias`)
      }
      break
    case 'user.assign_subjects':
      if (typeof details.assigned_count === 'number') {
        parts.push(`${details.assigned_count} materias`)
      }
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
    case 'justification.change_decision':
      parts.push(`${details.from ?? '?'} → ${details.to ?? '?'}`)
      break
    default:
      break
  }

  if (details.reason && typeof details.reason === 'string') {
    parts.push(`motivo: ${details.reason}`)
  }

  return parts.length > 0 ? parts.join(' · ') : '—'
}
