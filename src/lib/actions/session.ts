'use server'

import { createClient } from '@/lib/supabase/server'

const MIN_DURATION_MINUTES = 1
const MAX_DURATION_MINUTES = 180

export async function createSession(subjectId: string, durationMinutes: number = 15) {
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes < MIN_DURATION_MINUTES ||
    durationMinutes > MAX_DURATION_MINUTES
  ) {
    return {
      success: false,
      error: `La duración debe ser entre ${MIN_DURATION_MINUTES} y ${MAX_DURATION_MINUTES} minutos.`,
    }
  }

  const supabase = await createClient()

  // 1. Obtener usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  // 2. Verificar que el profesor dicte esta materia
  const { data: subject } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .eq('professor_id', user.id)
    .single()

  if (!subject) return { success: false, error: 'Materia no encontrada o acceso denegado.' }

  // 3. Crear sesión con expires_at a 15 minutos en el futuro
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes)

  const { data: newSession, error } = await supabase
    .from('sessions')
    .insert({
      subject_id: subjectId,
      duration_minutes: durationMinutes,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, qr_token, expires_at')
    .single()

  if (error || !newSession) {
    return { success: false, error: 'No se pudo crear la sesión.' }
  }

  return { success: true, sessionId: newSession.id }
}

// Antifraude: rota el QR cada ~20s (ver QRDisplay) para que una foto
// compartida por WhatsApp quede inutil casi al instante, en vez de
// seguir siendo valida los 15 minutos completos de la sesion. El
// token anterior queda guardado un ciclo (previous_qr_token) para no
// rechazar un escaneo que llego justo en el borde de la rotacion --
// ver el .or() en registerAttendance().
export async function refreshSessionQrToken(sessionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, qr_token, expires_at, is_active, subject_id')
    .eq('id', sessionId)
    .single()
  if (!session) return { success: false, error: 'Sesión no encontrada.' }

  const { data: subject } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', session.subject_id)
    .eq('professor_id', user.id)
    .single()
  if (!subject) return { success: false, error: 'Acceso denegado.' }

  if (session.is_active === false) {
    return { success: false, error: 'Esta sesión ha sido archivada.' }
  }
  if (new Date(session.expires_at) < new Date()) {
    return { success: false, error: 'Esta sesión ya expiró.' }
  }

  const newToken = crypto.randomUUID()
  const { error: updateError } = await supabase
    .from('sessions')
    .update({ qr_token: newToken, previous_qr_token: session.qr_token })
    .eq('id', sessionId)

  if (updateError) return { success: false, error: 'No se pudo renovar el código.' }

  return { success: true, qrToken: newToken }
}
