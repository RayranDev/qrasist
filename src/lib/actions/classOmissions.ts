'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { resolveSubjectEditorRole } from './authGuards'
import { logAudit } from '@/lib/audit/auditLog'
import { fetchClassOmissions } from '@/lib/attendance/classOmissionsData'
import { validateOmissionReason } from '@/lib/attendance/classOmissions'
import { isValidIsoDate } from '@/lib/sessions/suspension'

/**
 * RF22: el profesor (o coordinación en su nombre) justifica, con motivo
 * obligatorio, una clase programada de la que no hay ninguna sesión.
 *
 * No se confía en el cliente: el día se vuelve a derivar en el servidor con
 * la misma detección que muestra la lista (horario x período x sesiones),
 * así que no se puede "justificar" un día que no es una omisión real.
 * Escribe con service-role (class_omissions no tiene policies de escritura,
 * migración 029) después de los chequeos de acá.
 */
export async function justifyClassOmission({
  subjectId,
  date,
  reason,
}: {
  subjectId: string
  /** 'YYYY-MM-DD' (Bogotá) de la clase no registrada. */
  date: string
  reason: string
}): Promise<{ success: boolean; error?: string }> {
  const reasonError = validateOmissionReason(reason ?? '')
  if (reasonError) return { success: false, error: reasonError }
  if (!isValidIsoDate(date)) return { success: false, error: 'La fecha no es válida.' }
  const trimmedReason = reason.trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const role = await resolveSubjectEditorRole(supabase, user.id, subjectId)
  if (!role) return { success: false, error: 'No tienes permiso sobre esta materia.' }

  const omissions = await fetchClassOmissions(supabase, {
    subjectIds: [subjectId],
    from: date,
    to: date,
  })
  const omission = omissions.find((o) => o.date === date)
  if (!omission) {
    return { success: false, error: 'Ese día no figura como una clase sin registrar.' }
  }
  if (omission.justified) {
    return { success: false, error: 'Esa clase ya fue justificada.' }
  }

  const { data: created, error } = await getSupabaseAdmin()
    .from('class_omissions')
    .insert({
      subject_id: subjectId,
      class_date: date,
      schedule_id: omission.scheduleId,
      reason: trimmedReason,
      submitted_by: user.id,
    })
    .select('id')
    .single()
  if (error || !created) {
    // 23505: otra justificación del mismo día ganó la carrera.
    if (error?.code === '23505') {
      return { success: false, error: 'Esa clase ya fue justificada.' }
    }
    console.error('[omissions] failed to insert justification', error)
    return { success: false, error: 'No se pudo guardar la justificación.' }
  }

  await logAudit({
    actorId: user.id,
    action: 'class_omission.justify',
    entityType: 'class_omission',
    entityId: created.id,
    subjectId,
    details: {
      class_date: date,
      reason: trimmedReason,
      actor_role: role,
      schedule_id: omission.scheduleId,
    },
  })

  revalidatePath('/professor/subjects')
  revalidatePath('/admin/omissions')
  revalidatePath('/admin/dashboard')
  return { success: true }
}
