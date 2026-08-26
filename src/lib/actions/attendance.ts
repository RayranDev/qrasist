'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function registerAttendance(qrToken: string) {
  const supabase = await createClient()

  // Capturar la IP real (Next.js headers)
  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for') || 'unknown'

  // 1. Obtener usuario autenticado
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'No estás autenticado.' }

  // 2. Buscar la sesión por el token QR
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('qr_token', qrToken)
    .single()

  if (sessionError || !session) {
    return { success: false, error: 'Código QR inválido. No pertenece a esta clase.' }
  }

  // 3. Validar que la sesión no haya sido archivada por el docente
  if (session.is_active === false) {
    return { success: false, error: 'Esta sesión ha sido archivada y ya no acepta registros.' }
  }

  // 4. Validar si el token expiró
  const now = new Date()
  const expiresAt = new Date(session.expires_at)
  if (now > expiresAt) {
    return {
      success: false,
      error: 'Este código QR ha expirado. Solicita al profesor que genere uno nuevo.',
    } // Error 3
  }

  // 5. Traer datos de la materia para el mensaje de confirmación
  //    y validar que no esté archivada.
  const { data: subject } = await supabase
    .from('subjects')
    .select('name, code, is_active')
    .eq('id', session.subject_id)
    .single()

  if (subject?.is_active === false) {
    return { success: false, error: 'Esta materia ha sido archivada y ya no acepta registros.' }
  }

  // 6. Verificar si el estudiante está inscrito en la materia
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', session.subject_id)
    .eq('student_id', user.id)
    .maybeSingle()

  const isEnrolled = !!enrollment

  // 7. Verificar duplicado por materia en el mismo día. Este SELECT
  // es solo para dar un mensaje amigable antes de intentar el
  // INSERT -- la garantía real es el índice único
  // idx_unique_attendance_per_subject_per_day (ver
  // ATTENDANCE_DEDUP_MIGRATION.sql), que cubre la condición de
  // carrera entre dos sesiones distintas de la misma materia el
  // mismo día que este SELECT por sí solo no puede evitar.
  //
  // El "día" se calcula en hora de Colombia (UTC-5 fijo, sin
  // horario de verano), igual que attendance_day() en la
  // migración -- new Date().setHours() usa la zona del servidor
  // (UTC en Vercel), que correría el corte del día 5 horas.
  const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000
  const nowBogota = new Date(Date.now() - BOGOTA_OFFSET_MS)
  const y = nowBogota.getUTCFullYear()
  const m = nowBogota.getUTCMonth()
  const d = nowBogota.getUTCDate()
  const todayStart = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) + BOGOTA_OFFSET_MS)
  const todayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) + BOGOTA_OFFSET_MS)

  const { data: existingToday } = await supabase
    .from('attendances')
    .select('id')
    .eq('student_id', user.id)
    .eq('subject_id', session.subject_id)
    .gte('scanned_at', todayStart.toISOString())
    .lte('scanned_at', todayEnd.toISOString())
    .maybeSingle()

  if (existingToday) {
    return {
      success: false,
      error: `Ya registraste asistencia para ${subject?.name || 'esta materia'} hoy.`,
    }
  }

  // 8. Intentar registrar la asistencia
  const { error: insertError } = await supabase.from('attendances').insert({
    session_id: session.id,
    student_id: user.id,
    ip_address: ipAddress,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return {
        success: false,
        error: `Ya registraste asistencia para ${subject?.name || 'esta materia'} hoy.`,
      }
    }
    return { success: false, error: 'Error del servidor. Intenta nuevamente.' }
  }

  const registeredAt = new Date()
  const timeStr = registeredAt.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const subjectName = subject?.name || 'Materia'
  const subjectCode = subject?.code || ''

  if (!isEnrolled) {
    return {
      success: true,
      isGuest: true,
      message: `Registrado como invitado en ${subjectName} (${subjectCode}) a las ${timeStr}`,
    }
  }

  return {
    success: true,
    message: `${subjectName} · ${subjectCode} — ${timeStr}`,
    subjectName,
    subjectCode,
    time: timeStr,
  }
}
