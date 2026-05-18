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

  // 4. Intentar registrar la asistencia
  const { error: insertError } = await supabase
    .from('attendances')
    .insert({
      session_id: session.id,
      student_id: user.id,
      ip_address: ipAddress
    })

  if (insertError) {
    // Código de Postgres para violación de restricción única (UNIQUE)
    if (insertError.code === '23505') { 
      return { success: false, error: 'Ya has registrado tu asistencia para esta clase.' } // Error 4
    }
    return { success: false, error: 'Error del servidor. Intenta nuevamente.' } // Error 5
  }

  return { success: true, message: '¡Asistencia registrada correctamente!' }
}
