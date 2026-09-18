'use server'

import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ROTATION_SECONDS } from '@/lib/qrRotation'
import { sessionConfigSchema } from '@/lib/validations/schemas'

interface Coords {
  latitude: number
  longitude: number
}

export async function createSession(
  subjectId: string,
  durationMinutes: number = 15,
  coords?: Coords,
  rotationSeconds: number = DEFAULT_ROTATION_SECONDS
) {
  const parsed = sessionConfigSchema.safeParse({ durationMinutes, rotationSeconds })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Parámetros de sesión inválidos.',
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

  // 3. Crear sesión con expires_at calculada en el futuro
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + parsed.data.durationMinutes)

  const { data: newSession, error } = await supabase
    .from('sessions')
    .insert({
      subject_id: subjectId,
      duration_minutes: parsed.data.durationMinutes,
      expires_at: expiresAt.toISOString(),
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      qr_rotation_seconds: parsed.data.rotationSeconds,
    })
    .select('id, qr_token, expires_at')
    .single()

  if (error || !newSession) {
    return { success: false, error: 'No se pudo crear la sesión.' }
  }

  return { success: true, sessionId: newSession.id }
}

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

/**
 * Cierre manual de sesión por el docente.
 * Invalida inmediatamente el código QR estableciendo expires_at a NOW()
 * y limpiando el qr_token activo para evitar escaneos rezagados.
 */
export async function closeSession(sessionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, subject_id')
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

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('sessions')
    .update({
      expires_at: now,
      qr_token: null,
      previous_qr_token: null,
    })
    .eq('id', sessionId)

  if (updateError) {
    return { success: false, error: 'No se pudo cerrar la sesión.' }
  }

  return { success: true }
}
