import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveReviewableSubjects } from '@/lib/actions/authGuards'
import { evaluateStudentEnrollable } from '@/lib/actions/enrollmentGuards'
import { logAuditMany } from '@/lib/audit/auditLog'
import { isUuid } from './filters'
import type { ReviewFailure } from './messages'

export interface ApproveResult {
  approved: string[]
  failures: ReviewFailure[]
}

export interface RejectResult {
  rejected: string[]
  failures: ReviewFailure[]
}

interface RequestRow {
  id: string
  student_id: string
  subject_id: string
  status: string
}

const MSG = {
  notFound: 'Solicitud no encontrada.',
  forbidden: 'No tienes permiso para revisar esta solicitud.',
  processed: 'Esta solicitud ya fue procesada.',
  claimed: 'La solicitud ya fue revisada.',
  load: 'No se pudieron cargar las solicitudes.',
  careers: 'No se pudo validar la carrera del estudiante.',
  claimFailed: 'No se pudo actualizar la solicitud.',
  approveFailed: 'No se pudo aprobar la solicitud.',
  rejectFailed: 'No se pudo rechazar la solicitud.',
} as const

/** Quita duplicados conservando el orden. */
export function dedupeIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

/**
 * Lee las solicitudes y descarta las que no se pueden revisar: inexistentes,
 * sin permiso sobre su materia o ya procesadas. Las demás quedan en `eligible`.
 * Primero se mira el permiso y después el estado, así quien no puede revisar
 * una solicitud no averigua en qué estado está.
 */
async function loadReviewable(supabase: SupabaseClient, userId: string, ids: string[]) {
  const failures: ReviewFailure[] = []
  const valid = ids.filter(isUuid)
  for (const id of ids) if (!isUuid(id)) failures.push({ id, message: MSG.notFound })

  if (valid.length === 0) return { eligible: [] as RequestRow[], failures }

  const { data, error } = await supabase
    .from('enrollment_requests')
    .select('id, student_id, subject_id, status')
    .in('id', valid)
  if (error) {
    console.error('Error leyendo solicitudes de inscripción:', error)
    for (const id of valid) failures.push({ id, message: MSG.load })
    return { eligible: [] as RequestRow[], failures }
  }

  const found = new Map(((data || []) as RequestRow[]).map((r) => [r.id, r]))
  const reviewable = await resolveReviewableSubjects(
    supabase,
    userId,
    [...found.values()].map((r) => r.subject_id)
  )

  const eligible: RequestRow[] = []
  for (const id of valid) {
    const request = found.get(id)
    if (!request) failures.push({ id, message: MSG.notFound })
    else if (!reviewable.has(request.subject_id)) failures.push({ id, message: MSG.forbidden })
    else if (request.status !== 'pending') failures.push({ id, message: MSG.processed })
    else eligible.push(request)
  }
  return { eligible, failures }
}

/** Carreras activas por materia y por estudiante, en dos consultas. */
async function loadCareerMaps(supabase: SupabaseClient, requests: RequestRow[]) {
  const subjectIds = dedupeIds(requests.map((r) => r.subject_id))
  const studentIds = dedupeIds(requests.map((r) => r.student_id))

  const [subjectRes, studentRes] = await Promise.all([
    supabase
      .from('subject_careers')
      .select('subject_id, career_id')
      .in('subject_id', subjectIds)
      .eq('is_active', true),
    supabase
      .from('student_careers')
      .select('student_id, career_id')
      .in('student_id', studentIds)
      .eq('is_active', true),
  ])
  if (subjectRes.error || studentRes.error) return null

  const group = (rows: Record<string, string>[] | null, key: string) => {
    const map = new Map<string, string[]>()
    for (const row of rows || []) {
      map.set(row[key], [...(map.get(row[key]) || []), row.career_id])
    }
    return map
  }
  return {
    bySubject: group(subjectRes.data as Record<string, string>[] | null, 'subject_id'),
    byStudent: group(studentRes.data as Record<string, string>[] | null, 'student_id'),
  }
}

/**
 * Inserta las inscripciones de las solicitudes ya reclamadas. Camino
 * rápido: un solo upsert que ignora duplicados (quien ya estaba inscrito
 * por otra vía no es un error). Si ese lote falla, se reintenta fila a
 * fila para saber cuáles fallaron en vez de perder a todo el lote.
 */
async function insertEnrollments(supabase: SupabaseClient, claimed: RequestRow[]) {
  const rows = claimed.map((r) => ({ subject_id: r.subject_id, student_id: r.student_id }))
  const { error } = await supabase
    .from('enrollments')
    .upsert(rows, { onConflict: 'student_id,subject_id', ignoreDuplicates: true })
  if (!error) return { inserted: claimed, failed: [] as RequestRow[] }

  const inserted: RequestRow[] = []
  const failed: RequestRow[] = []
  for (const request of claimed) {
    const { error: rowError } = await supabase
      .from('enrollments')
      .insert({ subject_id: request.subject_id, student_id: request.student_id })
    // 23505 = ya estaba inscrito por otra vía: no es un error real acá.
    if (rowError && rowError.code !== '23505') failed.push(request)
    else inserted.push(request)
  }
  return { inserted, failed }
}

/**
 * Aprueba solicitudes de inscripción en lote. Por cada una: permiso sobre
 * su materia, estado pendiente, carrera en común (gates de
 * checkStudentEnrollable), reclamo atómico pending -> approved,
 * inscripción y auditoría. Devuelve el resultado por id: una falla no
 * detiene a las demás.
 *
 * El reclamo va ANTES de la inscripción: un UPDATE atómico filtrado por
 * status='pending' hace que, ante un reject() concurrente, solo uno de los
 * dos gane (si se insertara primero, el reject podía perder la carrera y
 * dejar una inscripción viva para una solicitud rechazada). Si la
 * inscripción falla después de reclamar, el reclamo se revierte a
 * 'pending' para que la solicitud no quede aprobada sin inscripción.
 */
export async function approveRequests(
  supabase: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<ApproveResult> {
  const { eligible, failures } = await loadReviewable(supabase, userId, dedupeIds(ids))
  if (eligible.length === 0) return { approved: [], failures }

  // Revalidar por si algo cambió desde que se hizo la solicitud (ej. un
  // admin quitó la carrera del estudiante o de la materia).
  const careers = await loadCareerMaps(supabase, eligible)
  if (!careers) {
    for (const r of eligible) failures.push({ id: r.id, message: MSG.careers })
    return { approved: [], failures }
  }
  const enrollable: RequestRow[] = []
  for (const request of eligible) {
    const check = evaluateStudentEnrollable(
      careers.bySubject.get(request.subject_id) || [],
      careers.byStudent.get(request.student_id) || []
    )
    if (check.ok) enrollable.push(request)
    else failures.push({ id: request.id, message: check.error })
  }
  if (enrollable.length === 0) return { approved: [], failures }

  const { data: claimedRows, error: claimError } = await supabase
    .from('enrollment_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: userId })
    .in(
      'id',
      enrollable.map((r) => r.id)
    )
    .eq('status', 'pending')
    .select('id')
  if (claimError) {
    console.error('Error reclamando solicitudes de inscripción:', claimError)
    for (const r of enrollable) failures.push({ id: r.id, message: MSG.claimFailed })
    return { approved: [], failures }
  }

  const claimedIds = new Set(((claimedRows || []) as { id: string }[]).map((r) => r.id))
  const claimed: RequestRow[] = []
  for (const request of enrollable) {
    if (claimedIds.has(request.id)) claimed.push(request)
    else failures.push({ id: request.id, message: MSG.claimed })
  }
  if (claimed.length === 0) return { approved: [], failures }

  const { inserted, failed } = await insertEnrollments(supabase, claimed)

  if (failed.length > 0) {
    const { error: revertError } = await supabase
      .from('enrollment_requests')
      .update({ status: 'pending', reviewed_at: null, reviewed_by: null })
      .in(
        'id',
        failed.map((r) => r.id)
      )
      .eq('status', 'approved')
      .eq('reviewed_by', userId)
    if (revertError) {
      // No hay más que hacer acá: queda aprobada sin inscripción y la falla
      // se reporta igual. Se deja rastro para repararla a mano. El
      // estudiante también se recupera solo: al volver a solicitar la
      // materia, createEnrollmentRequest hace upsert y deja la solicitud
      // otra vez en 'pending'.
      console.error('No se pudo revertir el reclamo de solicitudes:', {
        ids: failed.map((r) => r.id),
        error: revertError,
      })
    }
    for (const r of failed) failures.push({ id: r.id, message: MSG.approveFailed })
  }

  await logAuditMany(
    inserted.map((r) => ({
      actorId: userId,
      action: 'enrollment_request.approve' as const,
      entityType: 'enrollment_request',
      entityId: r.id,
      subjectId: r.subject_id,
      details: { student_id: r.student_id },
    }))
  )

  const approvedIds = new Set(inserted.map((r) => r.id))
  return { approved: dedupeIds(ids).filter((id) => approvedIds.has(id)), failures }
}

/**
 * Rechaza solicitudes en lote, con las mismas reglas de permiso y el mismo
 * reclamo atómico (solo cambia las que siguen pendientes).
 */
export async function rejectRequests(
  supabase: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<RejectResult> {
  const { eligible, failures } = await loadReviewable(supabase, userId, dedupeIds(ids))
  if (eligible.length === 0) return { rejected: [], failures }

  const { data: claimedRows, error } = await supabase
    .from('enrollment_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: userId })
    .in(
      'id',
      eligible.map((r) => r.id)
    )
    .eq('status', 'pending')
    .select('id')
  if (error) {
    console.error('Error rechazando solicitudes de inscripción:', error)
    for (const r of eligible) failures.push({ id: r.id, message: MSG.rejectFailed })
    return { rejected: [], failures }
  }

  const claimedIds = new Set(((claimedRows || []) as { id: string }[]).map((r) => r.id))
  const rejectedRows: RequestRow[] = []
  for (const request of eligible) {
    if (claimedIds.has(request.id)) rejectedRows.push(request)
    else failures.push({ id: request.id, message: MSG.claimed })
  }

  await logAuditMany(
    rejectedRows.map((r) => ({
      actorId: userId,
      action: 'enrollment_request.reject' as const,
      entityType: 'enrollment_request',
      entityId: r.id,
      subjectId: r.subject_id,
      details: { student_id: r.student_id },
    }))
  )

  const rejectedIds = new Set(rejectedRows.map((r) => r.id))
  return { rejected: dedupeIds(ids).filter((id) => rejectedIds.has(id)), failures }
}
