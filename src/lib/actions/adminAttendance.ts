'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkAdmin } from './authGuards'
import { logAudit } from '@/lib/audit/auditLog'
import { getAppSettings } from '@/lib/settings/appSettings'
import { validatePastSessionInput } from '@/lib/sessions/pastSession'
import { getBogotaDayRange } from '@/lib/utils/bogotaDay'
import { revalidatePath } from 'next/cache'

/**
 * Contingencia de lista en papel (process 3 del documento de
 * requisitos): si falla internet y la clase se tomó en papel, el
 * coordinador crea acá el registro de esa clase y luego carga la
 * asistencia desde /admin/attendance.
 *
 * La sesión nace CERRADA: sin QR (qr_token NULL) y con expires_at igual
 * a su fecha, pero is_active = true a propósito -- is_active = false
 * significa "archivada" y quedaría fuera del conteo de clases dictadas
 * (ver computeAttendanceSummary), mientras que esta clase sí cuenta
 * como dictada.
 */
export async function createPastSession(input: {
  subjectId: string
  startsAt: string
  modality: string
  note?: string | null
}): Promise<{ success: boolean; error?: string; sessionId?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const validated = validatePastSessionInput(input)
  if (!validated.ok) return { success: false, error: validated.error }

  const { data: subject } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('id', input.subjectId)
    .maybeSingle()
  if (!subject) return { success: false, error: 'Materia no encontrada.' }

  // Una clase por materia y día (hora de Bogotá). Hay un índice único de
  // "una asistencia por materia por día" (007): si ya existe otra sesión ese
  // día, marcar asistencia en la nueva chocaría con él y el camino 23505 de
  // markAttendanceManually reubicaría en silencio la fila original. Esto
  // también frena un doble envío del formulario.
  const { start: dayStart, end: dayEnd } = getBogotaDayRange(validated.startsAt)
  const { data: sameDay } = await supabase
    .from('sessions')
    .select('id')
    .eq('subject_id', subject.id)
    .gte('date', dayStart.toISOString())
    .lte('date', dayEnd.toISOString())
    .limit(1)
  if (sameDay && sameDay.length > 0) {
    return {
      success: false,
      error:
        'Ya existe una clase de esta materia ese día. Ábrela desde la lista y carga ahí la asistencia.',
    }
  }

  const { defaultClassMinutes } = await getAppSettings(supabase)
  const classEndsAt = new Date(validated.startsAt.getTime() + defaultClassMinutes * 60_000)

  const admin = getSupabaseAdmin()
  const { data: created, error } = await admin
    .from('sessions')
    .insert({
      subject_id: subject.id,
      date: validated.startsAt.toISOString(),
      duration_minutes: defaultClassMinutes,
      expires_at: validated.startsAt.toISOString(),
      class_ends_at: classEndsAt.toISOString(),
      qr_token: null,
      previous_qr_token: null,
      is_active: true,
      modality: validated.modality,
      is_makeup: false,
      note: validated.note,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[attendance] failed to create past session', error)
    return { success: false, error: 'No se pudo registrar la clase.' }
  }

  await logAudit({
    actorId: user.id,
    action: 'session.register_past',
    entityType: 'session',
    entityId: created.id,
    subjectId: subject.id,
    details: {
      date: validated.startsAt.toISOString(),
      modality: validated.modality,
      note: validated.note,
    },
  })

  revalidatePath('/admin/attendance')
  revalidatePath('/professor/history')
  return { success: true, sessionId: created.id }
}
