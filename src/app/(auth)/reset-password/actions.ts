'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit/auditLog'

export interface ResetPasswordResult {
  success: boolean
  error?: string
}

/**
 * Actualiza la contraseña usando la sesión de recuperación creada por
 * /auth/confirm al validar el enlace del correo. No pide la contraseña
 * actual (a diferencia de updateOwnProfile) porque el propio enlace de
 * correo ya demuestra que quien lo abre tiene acceso a esa bandeja.
 */
export async function resetPassword(password: string): Promise<ResetPasswordResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      success: false,
      error: 'Tu sesión de recuperación expiró. Solicitá un nuevo enlace.',
    }
  }

  if (!password || password.length < 6) {
    return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { success: false, error: 'No se pudo actualizar la contraseña. Intentá de nuevo.' }
  }

  await logAudit({
    actorId: user.id,
    action: 'auth.password_reset',
    entityType: 'profile',
    entityId: user.id,
  })

  // Cerramos la sesión de recuperación explícitamente: el usuario debe
  // volver a entrar con la contraseña nueva, no quedar navegando con la
  // sesión que abrió el enlace del correo.
  await supabase.auth.signOut()

  return { success: true }
}
