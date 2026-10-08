import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSubjectEditorRole } from './authGuards'
import { getAppSettings } from '@/lib/settings/appSettings'
import { canProfessorEditSession, PAST_CLASS_EDIT_MESSAGE } from '@/lib/sessions/classWindow'

export type AttendanceEditAuthorization =
  | { ok: true; role: 'ADMIN' | 'PROFESSOR' }
  | { ok: false; code: 'FORBIDDEN' | 'CLASS_ENDED'; error: string }

/**
 * Decide si `userId` puede modificar la asistencia de una sesión.
 *
 *  - ADMIN (coordinación): siempre (RF25 / RNF11).
 *  - PROFESSOR dueño de la materia: solo mientras la clase sigue en
 *    curso (RF21). Pasado class_ends_at -- o, en sesiones viejas sin
 *    ese dato, date + duración de clase por defecto -- se rechaza.
 *  - Cualquier otro: sin permiso.
 *
 * No es un archivo 'use server': es un helper interno que solo
 * importan las server actions, nunca un endpoint callable.
 */
export async function authorizeAttendanceEdit(
  supabase: SupabaseClient,
  userId: string,
  session: { subject_id: string; date: string; class_ends_at?: string | null },
  now: Date = new Date()
): Promise<AttendanceEditAuthorization> {
  const role = await resolveSubjectEditorRole(supabase, userId, session.subject_id)
  if (!role) return { ok: false, code: 'FORBIDDEN', error: 'No tienes permiso sobre esta sesión.' }
  if (role === 'ADMIN') return { ok: true, role }

  const settings = await getAppSettings(supabase)
  if (!canProfessorEditSession(session, settings.defaultClassMinutes, now)) {
    return { ok: false, code: 'CLASS_ENDED', error: PAST_CLASS_EDIT_MESSAGE }
  }
  return { ok: true, role }
}
