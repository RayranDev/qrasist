'use server'

import { createClient } from '@/lib/supabase/server'

export async function createSession(subjectId: string, durationMinutes: number = 15) {
  const supabase = await createClient()

  // 1. Obtener usuario autenticado
  const { data: { user } } = await supabase.auth.getUser()
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
      expires_at: expiresAt.toISOString()
    })
    .select('id, qr_token, expires_at')
    .single()

  if (error || !newSession) {
    return { success: false, error: 'No se pudo crear la sesión.' }
  }

  return { success: true, sessionId: newSession.id }
}
