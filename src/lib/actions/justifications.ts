'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkAdmin } from './authGuards'
import { logAudit } from '@/lib/audit/auditLog'
import {
  JUSTIFICATION_BUSINESS_DAYS,
  validateAttachmentMeta,
  isSessionAlreadyHeld,
  isWithinJustificationWindow,
  validateReasonLength,
} from '@/lib/justifications/eligibility'
import { revalidatePath } from 'next/cache'

const JUSTIFICATIONS_BUCKET = 'justifications'
const MIN_REVIEW_NOTE_LENGTH = 5

interface ActionResult {
  success: boolean
  error?: string
}

interface EligibleSession {
  id: string
  date: string
  subject_id: string
  is_active: boolean | null
  expires_at: string | null
}

/**
 * Vuelve a validar TODO del lado del servidor: sesión ya dictada,
 * dentro de la ventana de 3 días hábiles, estudiante activo e inscrito en la
 * materia, y sin asistencia registrada para esa sesión. Nunca se
 * confía en subject_id/student_id que pudiera mandar el cliente --
 * se derivan siempre de la sesión y de la sesión de auth.
 */
async function checkJustificationEligibility(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string
): Promise<{ ok: true; session: EligibleSession } | { ok: false; error: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .single()

  if (!profile || profile.role !== 'STUDENT' || !profile.is_active) {
    return { ok: false, error: 'Solo un estudiante activo puede justificar una inasistencia.' }
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, date, subject_id, is_active, expires_at')
    .eq('id', sessionId)
    .single()

  if (!session) return { ok: false, error: 'Sesión no encontrada.' }

  if (!isSessionAlreadyHeld(session)) {
    return { ok: false, error: 'Esta sesión todavía está en curso.' }
  }

  if (!isWithinJustificationWindow(session.date)) {
    return {
      ok: false,
      error: `El plazo de ${JUSTIFICATION_BUSINESS_DAYS} días hábiles para justificar esta sesión ya venció.`,
    }
  }

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', session.subject_id)
    .eq('student_id', userId)
    .maybeSingle()

  if (!enrollment) {
    return { ok: false, error: 'No estás inscrito en la materia de esta sesión.' }
  }

  const { data: attendance } = await supabase
    .from('attendances')
    .select('id')
    .eq('session_id', sessionId)
    .eq('student_id', userId)
    .maybeSingle()

  if (attendance) {
    return { ok: false, error: 'Ya tenés asistencia registrada para esta sesión.' }
  }

  return { ok: true, session }
}

export interface CreateJustificationUploadUrlResult extends ActionResult {
  signedUrl?: string
  token?: string
  path?: string
}

export async function createJustificationUploadUrl({
  sessionId,
  fileName,
  contentType,
  size,
}: {
  sessionId: string
  fileName: string
  contentType: string
  size: number
}): Promise<CreateJustificationUploadUrlResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const attachment = validateAttachmentMeta({ fileName, contentType, size })
  if (!attachment.ok) return { success: false, error: attachment.error }
  const extension = attachment.extension

  const eligibility = await checkJustificationEligibility(supabase, user.id, sessionId)
  if (!eligibility.ok) return { success: false, error: eligibility.error }

  const { data: existingJustification } = await supabase
    .from('absence_justifications')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (existingJustification && existingJustification.status !== 'REJECTED') {
    return { success: false, error: 'Ya existe una justificación para esta sesión.' }
  }

  const path = `${user.id}/${sessionId}/${crypto.randomUUID()}.${extension}`
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.storage
    .from(JUSTIFICATIONS_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    console.error('[justifications] failed to create signed upload url', error)
    return { success: false, error: 'No se pudo preparar la subida del adjunto.' }
  }

  return { success: true, signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function submitJustification({
  sessionId,
  reason,
  attachmentPath,
}: {
  sessionId: string
  reason: string
  attachmentPath?: string | null
}): Promise<ActionResult> {
  const reasonError = validateReasonLength(reason)
  if (reasonError) return { success: false, error: reasonError }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const eligibility = await checkJustificationEligibility(supabase, user.id, sessionId)
  if (!eligibility.ok) return { success: false, error: eligibility.error }
  const { session } = eligibility

  const trimmedReason = reason.trim()
  const admin = getSupabaseAdmin()

  if (attachmentPath) {
    const ownPrefix = `${user.id}/${sessionId}/`
    if (!attachmentPath.startsWith(ownPrefix)) {
      return { success: false, error: 'Adjunto inválido.' }
    }

    const fileName = attachmentPath.slice(ownPrefix.length)
    const { data: files, error: listError } = await admin.storage
      .from(JUSTIFICATIONS_BUCKET)
      .list(`${user.id}/${sessionId}`)

    const exists = !listError && (files || []).some((f) => f.name === fileName)
    if (!exists) {
      return { success: false, error: 'El adjunto no se subió correctamente. Intenta de nuevo.' }
    }
  }

  const { data: existing } = await admin
    .from('absence_justifications')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle()

  if (existing && existing.status !== 'REJECTED') {
    return { success: false, error: 'Ya existe una justificación para esta sesión.' }
  }

  if (existing) {
    // Reenvío tras rechazo: vuelve a PENDING y limpia la revisión anterior.
    const { error } = await admin
      .from('absence_justifications')
      .update({
        reason: trimmedReason,
        attachment_path: attachmentPath ?? null,
        status: 'PENDING',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
      })
      .eq('id', existing.id)
      .eq('status', 'REJECTED')

    if (error) return { success: false, error: 'No se pudo reenviar la justificación.' }
  } else {
    const { error } = await admin.from('absence_justifications').insert({
      student_id: user.id,
      session_id: sessionId,
      subject_id: session.subject_id,
      reason: trimmedReason,
      attachment_path: attachmentPath ?? null,
      status: 'PENDING',
    })

    if (error) return { success: false, error: 'No se pudo enviar la justificación.' }
  }

  revalidatePath('/student/subjects')
  revalidatePath('/student/history')
  revalidatePath('/professor/justifications')
  revalidatePath('/admin/justifications')
  return { success: true }
}

export async function reviewJustification({
  justificationId,
  decision,
  note,
}: {
  justificationId: string
  decision: 'APPROVED' | 'REJECTED'
  note?: string
}): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  // Process 3 del documento de requisitos: la revisión de excusas la hace
  // coordinación (ADMIN); el profesor solo consulta su estado.
  if (!(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'Solo coordinación puede revisar justificaciones.' }
  }

  const trimmedNote = (note || '').trim()
  if (decision === 'REJECTED' && trimmedNote.length < MIN_REVIEW_NOTE_LENGTH) {
    return {
      success: false,
      error: `El motivo de rechazo debe tener al menos ${MIN_REVIEW_NOTE_LENGTH} caracteres.`,
    }
  }

  const { data: justification } = await supabase
    .from('absence_justifications')
    .select('id, student_id, session_id, subject_id, status')
    .eq('id', justificationId)
    .single()

  if (!justification) return { success: false, error: 'Justificación no encontrada.' }
  if (justification.status !== 'PENDING') {
    return { success: false, error: 'Esta justificación ya fue revisada.' }
  }

  const admin = getSupabaseAdmin()
  // Claim atómico igual que approveEnrollmentRequest: solo gana una
  // revisión concurrente si status seguía en PENDING al momento del UPDATE.
  const { data: claimed, error } = await admin
    .from('absence_justifications')
    .update({
      status: decision,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: trimmedNote || null,
    })
    .eq('id', justificationId)
    .eq('status', 'PENDING')
    .select('id')

  if (error) return { success: false, error: 'No se pudo registrar la revisión.' }
  if (!claimed || claimed.length === 0) {
    return { success: false, error: 'Esta justificación ya fue revisada.' }
  }

  await logAudit({
    actorId: user.id,
    action: decision === 'APPROVED' ? 'justification.approve' : 'justification.reject',
    entityType: 'absence_justification',
    entityId: justificationId,
    subjectId: justification.subject_id,
    details: {
      student_id: justification.student_id,
      session_id: justification.session_id,
      note: trimmedNote || null,
    },
  })

  revalidatePath('/admin/justifications')
  revalidatePath('/professor/justifications')
  revalidatePath('/student/subjects')
  revalidatePath('/student/history')
  return { success: true }
}

export interface JustificationAttachmentUrlResult extends ActionResult {
  url?: string
}

export async function getJustificationAttachmentUrl(
  justificationId: string
): Promise<JustificationAttachmentUrlResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  // RLS de absence_justifications_select (migración 024) ya limita
  // esta fila a: el propio estudiante, el profesor dueño de la
  // materia o un ADMIN -- si la consulta no la devuelve, es que no
  // tiene permiso (o no existe), y el mensaje puede ser genérico.
  const { data: justification } = await supabase
    .from('absence_justifications')
    .select('attachment_path')
    .eq('id', justificationId)
    .maybeSingle()

  if (!justification || !justification.attachment_path) {
    return { success: false, error: 'Adjunto no encontrado.' }
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin.storage
    .from(JUSTIFICATIONS_BUCKET)
    .createSignedUrl(justification.attachment_path, 60)

  if (error || !data) {
    return { success: false, error: 'No se pudo generar el enlace del adjunto.' }
  }

  return { success: true, url: data.signedUrl }
}
