'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteSession(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'No autorizado' }

  const { data: session } = await supabase
    .from('sessions')
    .select('subject:subjects(professor_id)')
    .eq('id', sessionId)
    .single()
  
  if (!session || (session.subject as any).professor_id !== user.id) {
    return { success: false, error: 'No tienes permiso para borrar esta sesión.' }
  }

  const { error } = await supabase
    .from('sessions')
    .update({ is_active: false })
    .eq('id', sessionId)

  if (error) return { success: false, error: 'Error al archivar la sesión.' }

  revalidatePath('/professor/history')
  return { success: true }
}

export async function reactivateSession(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'No autorizado' }

  const { data: session } = await supabase
    .from('sessions')
    .select('subject:subjects(professor_id)')
    .eq('id', sessionId)
    .single()

  if (!session || (session.subject as any).professor_id !== user.id) {
    return { success: false, error: 'No tienes permiso para reactivar esta sesión.' }
  }

  const { error } = await supabase
    .from('sessions')
    .update({ is_active: true })
    .eq('id', sessionId)

  if (error) return { success: false, error: 'Error al reactivar la sesión.' }

  revalidatePath('/professor/history')
  return { success: true }
}
