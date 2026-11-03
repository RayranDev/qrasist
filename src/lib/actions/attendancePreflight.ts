'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { checkRateLimit } from '@/lib/utils/rateLimiter'
import { sessionCapturesLocation } from '@/lib/attendance/captureScope'

/**
 * Antes de pedirle la ubicación al navegador, el escáner pregunta si la clase
 * del código la necesita: en una clase virtual ni siquiera se debe mostrar el
 * permiso de ubicación.
 *
 * Devuelve SOLO un booleano. Cualquier fallo (sin sesión, código inválido,
 * clase archivada o vencida, límite de intentos, error de red) devuelve false:
 * el escáner entonces no pide ubicación y registerAttendance, que repite todas
 * las validaciones, informa el error real. Así esta acción no filtra datos de
 * la clase ni de la cuenta.
 *
 * Límite propio por usuario (no comparte el de registerAttendance, para no
 * gastarle intentos a cada escaneo) y sin clave por IP: la IP no se guarda.
 */
export async function isLocationCaptureRequired(qrToken: string): Promise<boolean> {
  try {
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
    if (typeof qrToken !== 'string' || !uuidRegex.test(qrToken)) return false

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return false

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()
    if (!profile || profile.is_active !== true || profile.role !== 'STUDENT') return false

    const rate = await checkRateLimit(`scan-preflight:user:${user.id}`, {
      maxAttempts: 20,
      windowMs: 60_000,
    })
    if (!rate.allowed) return false

    const { data: session, error } = await getSupabaseAdmin()
      .from('sessions')
      .select('is_active, expires_at, qr_token, modality')
      .or(`qr_token.eq.${qrToken},previous_qr_token.eq.${qrToken}`)
      .single()
    if (error || !session) return false
    if (session.is_active === false) return false
    if (!session.qr_token || new Date() > new Date(session.expires_at)) return false

    return sessionCapturesLocation(session.modality)
  } catch {
    return false
  }
}
