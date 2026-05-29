'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function registerAttendance(qrToken: string) {
  const supabase = await createClient()
  
  // Capturar la IP real (Next.js headers)
  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for') || 'unknown'

  // 1. Obtener usuario autenticado
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'No estás autenticado.' }

  // 2. Buscar la sesión por el token QR
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('qr_token', qrToken)
    .single()

  if (sessionError || !session) {
    return { success: false, error: 'Código QR inválido. No pertenece a esta clase.' } // Error 2
  }

  // 3. Validar si el token expiró
  const now = new Date()
  const expiresAt = new Date(session.expires_at)
  if (now > expiresAt) {
    return { success: false, error: 'Este código QR ha expirado. Solicita al profesor que genere uno nuevo.' } // Error 3
  }

  // 4. Traer datos de la materia para el mensaje de confirmación
  const { data: subject } = await supabase
    .from('subjects')
    .select('name, code')
    .eq('id', session.subject_id)
    .single()

  // 5. Verificar si el estudiante está inscrito en la materia
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', session.subject_id)
    .eq('student_id', user.id)
    .maybeSingle()

  const isEnrolled = !!enrollment

  // 6. Verificar duplicado por materia en el mismo día
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const { data: existingToday } = await supabase
    .from('attendances')
    .select('id')
    .eq('student_id', user.id)
    .gte('scanned_at', todayStart.toISOString())
    .lte('scanned_at', todayEnd.toISOString())
    .in('session_id',
      (await supabase
        .from('sessions')
        .select('id')
        .eq('subject_id', session.subject_id)
        .then(r => r.data?.map((s: any) => s.id) || []))
    )
    .maybeSingle()

  if (existingToday) {
    return { success: false, error: `Ya registraste asistencia para ${subject?.name || 'esta materia'} hoy.` }
  }

  // 7. Intentar registrar la asistencia
  const { error: insertError } = await supabase
    .from('attendances')
    .insert({
      session_id: session.id,
      student_id: user.id,
      ip_address: ipAddress
    })

  if (insertError) {
    if (insertError.code === '23505') {
      return { success: false, error: 'Ya has registrado tu asistencia para esta clase.' }
    }
    return { success: false, error: 'Error del servidor. Intenta nuevamente.' }
  }

  const now = new Date()
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
  const subjectName = subject?.name || 'Materia'
  const subjectCode = subject?.code || ''

  if (!isEnrolled) {
    return { success: true, isGuest: true, message: `Registrado como invitado en ${subjectName} (${subjectCode}) a las ${timeStr}` }
  }

  return { success: true, message: `✓ ${subjectName} · ${subjectCode} — ${timeStr}`, subjectName, subjectCode, time: timeStr }
}
