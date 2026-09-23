// Nota: no se importa el paquete `server-only` porque no está entre
// las dependencias del proyecto (ver AGENTS.md/instrucciones de fase).
// Este módulo ya es server-only de hecho: usa el cliente service-role
// (SUPABASE_SERVICE_ROLE_KEY), que revienta si se evalúa en el
// cliente por no tener esa env var expuesta al bundle del navegador.
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'

/**
 * Acciones de auditoría registradas por la app. Se mantiene como
 * unión cerrada (en vez de `string` suelto) para que agregar una
 * acción nueva sea un cambio explícito y el admin/audit UI pueda
 * traducir cada valor a un texto legible sin adivinar.
 */
export type AuditAction =
  | 'attendance.mark'
  | 'attendance.update'
  | 'attendance.remove'
  | 'attendance.relocate'
  | 'enrollment_request.approve'
  | 'enrollment_request.reject'
  | 'user.role_change'
  | 'user.create'
  | 'user.deactivate'
  | 'user.reactivate'
  | 'user.update_account'
  | 'policy.update_global_absence'
  | 'justification.approve'
  | 'justification.reject'

interface LogAuditInput {
  actorId: string | null
  action: AuditAction
  entityType: string
  entityId?: string | null
  subjectId?: string | null
  details?: Record<string, unknown>
}

/**
 * Inserta una entrada en audit_log usando el cliente service-role
 * (la tabla no tiene policies de INSERT para authenticated/anon, ver
 * migración 023). Nunca lanza: una falla de auditoría no debe tumbar
 * la acción del usuario que la disparó, solo queda en el log del
 * servidor para investigarla aparte.
 */
export async function logAudit({
  actorId,
  action,
  entityType,
  entityId,
  subjectId,
  details,
}: LogAuditInput): Promise<void> {
  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('audit_log').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      subject_id: subjectId ?? null,
      details: details ?? {},
    })
    if (error) {
      console.error('[audit] failed to insert audit_log row', { action, entityType, error })
    }
  } catch (err) {
    console.error('[audit] unexpected error logging action', { action, entityType, err })
  }
}
