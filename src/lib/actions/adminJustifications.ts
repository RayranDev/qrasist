'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkAdmin } from './authGuards'
import { logAudit } from '@/lib/audit/auditLog'
import { getAppSettings } from '@/lib/settings/appSettings'
import {
  isSessionAlreadyHeld,
  validateAttachmentMeta,
  validateReasonLength,
} from '@/lib/justifications/eligibility'
import { revalidatePath } from 'next/cache'

/**
 * Registro de excusas por coordinación (process 3 del documento de
 * requisitos): el coordinador valida la excusa de un estudiante, sube el
 * documento y lo relaciona con una inasistencia concreta. La
 * justificación nace ya APROBADA.
 *
 * Todo se re-deriva en el servidor: nunca se confía en que el cliente
 * mande una combinación estudiante/sesión/materia coherente. A
 * diferencia del autoservicio del estudiante, acá NO aplica el plazo de
 * 3 días hábiles -- coordinación puede validar una excusa tardía.
 */

const JUSTIFICATIONS_BUCKET = 'justifications'
const ATTACHMENT_FILE_PATTERN = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/

interface ActionResult {
  success: boolean
  error?: string
}

export interface StudentSearchResult {
  id: string
  name: string
  student_code: string | null
}

export interface StudentAbsenceOption {
  sessionId: string
  subjectId: string
  subjectName: string
  subjectCode: string
  date: string
  /** Si el estudiante ya envió una justificación que sigue sin aprobarse. */
  existingStatus: 'PENDING' | 'REJECTED' | null
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'No estás autenticado.' }
  if (!(await checkAdmin(supabase, user.id))) {
    return { ok: false as const, error: 'No autorizado' }
  }
  return { ok: true as const, supabase, userId: user.id }
}

export async function searchStudentsForExcuse(
  query: string
): Promise<{ success: boolean; error?: string; students?: StudentSearchResult[] }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  // Se quitan los caracteres con significado en el filtro .or() de PostgREST
  // y los comodines de LIKE, igual que la búsqueda de la bitácora.
  const q = (query || '')
    .trim()
    .replace(/[,()%*\\]/g, '')
    .slice(0, 80)
  if (q.length < 2) return { success: true, students: [] }

  const { data, error } = await auth.supabase
    .from('profiles')
    .select('id, name, student_code')
    .eq('role', 'STUDENT')
    .eq('is_active', true)
    .or(`name.ilike.%${q}%,student_code.ilike.%${q}%,email.ilike.%${q}%`)
    .order('name')
    .limit(8)

  if (error) return { success: false, error: 'No se pudo buscar estudiantes.' }
  return { success: true, students: (data || []) as StudentSearchResult[] }
}

export async function listStudentAbsences(
  studentId: string
): Promise<{ success: boolean; error?: string; absences?: StudentAbsenceOption[] }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const { supabase } = auth

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('subject:subjects(id, name, code, is_active)')
    .eq('student_id', studentId)

  const subjects = new Map<string, { name: string; code: string }>()
  for (const e of enrollments || []) {
    const subject = e.subject as unknown as {
      id: string
      name: string
      code: string
      is_active: boolean | null
    } | null
    if (subject && subject.is_active !== false) {
      subjects.set(subject.id, { name: subject.name, code: subject.code })
    }
  }
  if (subjects.size === 0) return { success: true, absences: [] }

  const { defaultClassMinutes } = await getAppSettings(supabase)
  const now = new Date()

  const [{ data: sessions }, { data: attendances }, { data: justifications }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, subject_id, date, class_ends_at')
      .in('subject_id', Array.from(subjects.keys()))
      .eq('is_active', true)
      .lte('date', now.toISOString())
      .order('date', { ascending: false })
      .limit(150),
    supabase.from('attendances').select('session_id').eq('student_id', studentId).limit(2000),
    supabase
      .from('absence_justifications')
      .select('session_id, status')
      .eq('student_id', studentId)
      .limit(2000),
  ])

  const attended = new Set((attendances || []).map((a) => a.session_id))
  const justificationBySession = new Map(
    (justifications || []).map((j) => [j.session_id, j.status as string])
  )

  const absences: StudentAbsenceOption[] = []
  for (const s of sessions || []) {
    // La clase tiene que haber terminado (no solo la ventana de registro).
    if (!isSessionAlreadyHeld(s, defaultClassMinutes, now)) continue
    if (attended.has(s.id)) continue
    const status = justificationBySession.get(s.id)
    if (status === 'APPROVED') continue
    const subject = subjects.get(s.subject_id)
    if (!subject) continue
    absences.push({
      sessionId: s.id,
      subjectId: s.subject_id,
      subjectName: subject.name,
      subjectCode: subject.code,
      date: s.date,
      existingStatus: status === 'PENDING' || status === 'REJECTED' ? status : null,
    })
  }

  return { success: true, absences }
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * ¿Es esta sesión una inasistencia real del estudiante? Sesión ya
 * dictada y no archivada, estudiante activo e inscrito en su materia,
 * sin asistencia y sin una justificación ya aprobada.
 */
async function checkAbsenceEligibility(
  supabase: Supabase,
  studentId: string,
  sessionId: string
): Promise<
  | {
      ok: true
      subjectId: string
      existing: { id: string; status: 'PENDING' | 'REJECTED' } | null
    }
  | { ok: false; error: string }
> {
  const { data: student } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', studentId)
    .maybeSingle()
  if (!student || student.role !== 'STUDENT' || !student.is_active) {
    return { ok: false, error: 'El estudiante no existe o no está activo.' }
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, subject_id, date, is_active, class_ends_at')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return { ok: false, error: 'Sesión no encontrada.' }
  if (session.is_active === false) {
    return { ok: false, error: 'Esta sesión está archivada y no cuenta como inasistencia.' }
  }
  const { defaultClassMinutes } = await getAppSettings(supabase)
  if (!isSessionAlreadyHeld(session, defaultClassMinutes)) {
    return { ok: false, error: 'Esta sesión todavía está en curso.' }
  }

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', session.subject_id)
    .eq('student_id', studentId)
    .maybeSingle()
  if (!enrollment) {
    return { ok: false, error: 'El estudiante no está inscrito en la materia de esta sesión.' }
  }

  const { data: attendance } = await supabase
    .from('attendances')
    .select('id')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (attendance) {
    return { ok: false, error: 'El estudiante ya tiene asistencia registrada en esta sesión.' }
  }

  const { data: existing } = await supabase
    .from('absence_justifications')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (existing?.status === 'APPROVED') {
    return { ok: false, error: 'Esta inasistencia ya tiene una justificación aprobada.' }
  }

  return {
    ok: true,
    subjectId: session.subject_id,
    existing: existing
      ? { id: existing.id, status: existing.status as 'PENDING' | 'REJECTED' }
      : null,
  }
}

export async function createExcuseUploadUrl({
  studentId,
  sessionId,
  fileName,
  contentType,
  size,
}: {
  studentId: string
  sessionId: string
  fileName: string
  contentType: string
  size: number
}): Promise<ActionResult & { signedUrl?: string; token?: string; path?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const attachment = validateAttachmentMeta({ fileName, contentType, size })
  if (!attachment.ok) return { success: false, error: attachment.error }

  const eligibility = await checkAbsenceEligibility(auth.supabase, studentId, sessionId)
  if (!eligibility.ok) return { success: false, error: eligibility.error }

  // Misma convención que el autoservicio: el primer segmento del path es el
  // estudiante, así la policy de storage le deja ver su propio adjunto.
  const path = `${studentId}/${sessionId}/${crypto.randomUUID()}.${attachment.extension}`
  const { data, error } = await getSupabaseAdmin()
    .storage.from(JUSTIFICATIONS_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    console.error('[justifications] failed to create signed upload url (admin)', error)
    return { success: false, error: 'No se pudo preparar la subida del adjunto.' }
  }

  return { success: true, signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function registerExcuse({
  studentId,
  sessionId,
  reason,
  attachmentPath,
}: {
  studentId: string
  sessionId: string
  reason: string
  attachmentPath: string
}): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const { supabase, userId } = auth

  const reasonError = validateReasonLength(reason)
  if (reasonError) return { success: false, error: reasonError }

  const ownPrefix = `${studentId}/${sessionId}/`
  const fileName = (attachmentPath || '').slice(ownPrefix.length)
  if (
    !attachmentPath ||
    !attachmentPath.startsWith(ownPrefix) ||
    !ATTACHMENT_FILE_PATTERN.test(fileName)
  ) {
    return { success: false, error: 'Adjunto inválido.' }
  }

  const eligibility = await checkAbsenceEligibility(supabase, studentId, sessionId)
  if (!eligibility.ok) return { success: false, error: eligibility.error }

  const admin = getSupabaseAdmin()
  const { data: files, error: listError } = await admin.storage
    .from(JUSTIFICATIONS_BUCKET)
    .list(`${studentId}/${sessionId}`)
  if (listError || !(files || []).some((f) => f.name === fileName)) {
    return { success: false, error: 'El adjunto no se subió correctamente. Intenta de nuevo.' }
  }

  const trimmedReason = reason.trim()
  const reviewedAt = new Date().toISOString()
  const approved = {
    reason: trimmedReason,
    attachment_path: attachmentPath,
    status: 'APPROVED',
    reviewed_by: userId,
    reviewed_at: reviewedAt,
    review_note: 'Excusa registrada por coordinación.',
  }

  let justificationId: string | null = eligibility.existing?.id ?? null
  if (eligibility.existing) {
    // El estudiante ya había enviado algo (pendiente o rechazado): coordinación
    // lo resuelve con esta excusa. El claim por status evita pisar una revisión
    // concurrente.
    const { data: updated, error } = await admin
      .from('absence_justifications')
      .update(approved)
      .eq('id', eligibility.existing.id)
      .eq('status', eligibility.existing.status)
      .select('id')
    if (error || !updated || updated.length === 0) {
      return { success: false, error: 'No se pudo registrar la excusa. Intenta de nuevo.' }
    }
  } else {
    const { data: inserted, error } = await admin
      .from('absence_justifications')
      .insert({
        student_id: studentId,
        session_id: sessionId,
        subject_id: eligibility.subjectId,
        ...approved,
      })
      .select('id')
      .single()
    if (error || !inserted) {
      return {
        success: false,
        error:
          error?.code === '23505'
            ? 'Ya existe una justificación para esta sesión.'
            : 'No se pudo registrar la excusa.',
      }
    }
    justificationId = inserted.id
  }

  await logAudit({
    actorId: userId,
    action: 'justification.register',
    entityType: 'absence_justification',
    entityId: justificationId,
    subjectId: eligibility.subjectId,
    details: {
      student_id: studentId,
      session_id: sessionId,
      replaced_status: eligibility.existing?.status ?? null,
      note: 'Excusa registrada por coordinación',
    },
  })

  revalidatePath('/admin/justifications')
  revalidatePath('/professor/justifications')
  revalidatePath('/student/subjects')
  revalidatePath('/student/history')
  return { success: true }
}
