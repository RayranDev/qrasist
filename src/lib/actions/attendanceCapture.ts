'use server'

import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from './authGuards'
import { sessionCapturesLocation } from '@/lib/attendance/captureScope'
import { evaluateSessionCapture, type CaptureEvaluation } from '@/lib/attendance/captureFlags'

export interface SessionCaptureRow {
  attendanceId: string
  studentName: string
  studentCode: string | null
  /** No está inscrito en la materia (se registró como invitado). */
  isGuest: boolean
  status: 'PRESENT' | 'LATE'
  scannedAt: string
  capture: CaptureEvaluation
}

export type SessionCaptureResult =
  | {
      success: true
      /** false en una clase virtual: no hay IP ni ubicación que mostrar. */
      applies: boolean
      rows: SessionCaptureRow[]
    }
  | { success: false; error: string }

interface AttendanceRow {
  id: string
  student_id: string
  status: string
  scanned_at: string
  ip_address: string | null
  latitude: number | null
  longitude: number | null
  student:
    | { name: string; student_code: string | null }
    | { name: string; student_code: string | null }[]
    | null
}

/**
 * IP y ubicación capturadas al registrar la asistencia de una clase, con las
 * mismas alertas que ve el profesor en su historial. Solo para coordinación
 * (ADMIN activo): es la única acción que entrega estos datos fuera del
 * historial del profesor. Se llama a demanda desde /admin/attendance; la
 * lista en vivo del profesor (getSessionRoster, que se proyecta en pantalla)
 * nunca los recibe.
 *
 * Una clase virtual responde `applies: false` sin filas, aunque la base aún
 * tenga valores guardados de antes.
 */
export async function getSessionCaptureData(sessionId: string): Promise<SessionCaptureResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }
  if (!(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No tienes permiso para ver estos datos.' }
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, subject_id, modality, latitude, longitude')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return { success: false, error: 'Sesión no encontrada.' }

  if (!sessionCapturesLocation(session.modality)) {
    return { success: true, applies: false, rows: [] }
  }

  const [{ data: attendances, error }, { data: enrollments }] = await Promise.all([
    supabase
      .from('attendances')
      .select(
        'id, student_id, status, scanned_at, ip_address, latitude, longitude, student:profiles!attendances_student_id_fkey(name, student_code)'
      )
      .eq('session_id', sessionId)
      .order('scanned_at', { ascending: true }),
    supabase.from('enrollments').select('student_id').eq('subject_id', session.subject_id),
  ])
  if (error) return { success: false, error: 'No se pudieron cargar los datos de la clase.' }

  const enrolledIds = new Set((enrollments || []).map((e) => e.student_id as string))
  const rows = (attendances || []) as unknown as AttendanceRow[]
  const evaluated = evaluateSessionCapture(session, rows)

  return {
    success: true,
    applies: true,
    rows: evaluated.map(({ attendance: a, evaluation }) => {
      const student = Array.isArray(a.student) ? a.student[0] : a.student
      return {
        attendanceId: a.id,
        studentName: student?.name ?? 'Estudiante',
        studentCode: student?.student_code ?? null,
        isGuest: !enrolledIds.has(a.student_id),
        status: a.status === 'LATE' ? 'LATE' : 'PRESENT',
        scannedAt: a.scanned_at,
        capture: evaluation,
      }
    }),
  }
}
