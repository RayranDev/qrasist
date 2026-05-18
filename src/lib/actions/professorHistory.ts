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

  const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
  
  if (error) return { success: false, error: 'Error al eliminar la sesión.' }

  revalidatePath('/professor/history')
  return { success: true }
}
