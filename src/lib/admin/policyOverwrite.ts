/**
 * Textos y reglas puras de la confirmación al reemplazar la política de
 * inasistencias de TODAS las materias activas (DEF-QA-07). Vive fuera del
 * archivo 'use server' porque exporta funciones síncronas y también lo usa
 * el modal del cliente.
 */
import { countOf } from '@/lib/utils/plural'

export function buildPolicyOverwriteMessage(activeSubjects: number): string {
  return `Se reemplazará la política de ${countOf(activeSubjects, 'materia activa', 'materias activas')}. Esta acción queda en la auditoría.`
}

export const POLICY_COUNT_CHANGED_PREFIX = 'La cantidad de materias activas cambió'

export function buildPolicyAppliedMismatchMessage(confirmed: number, updated: number): string {
  return `Se actualizaron ${countOf(updated, 'materia activa', 'materias activas')} y habías confirmado ${confirmed}: la cantidad cambió durante la operación. Quedó registrado en la auditoría.`
}

export function buildPolicyCountChangedMessage(currentCount: number): string {
  return `${POLICY_COUNT_CHANGED_PREFIX} (ahora son ${currentCount}). Revisa y confirma de nuevo.`
}
