'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'

export async function updateOwnProfile(data: { name?: string; password?: string }) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'No autenticado.' }

  if (data.name) {
    const { error } = await supabase.from('profiles').update({ name: data.name }).eq('id', user.id)
    if (error) return { success: false, error: 'Error al actualizar el nombre.' }
    await getSupabaseAdmin().auth.admin.updateUserById(user.id, { user_metadata: { full_name: data.name } })
  }

  if (data.password) {
    if (data.password.length < 6) return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' }
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(user.id, { password: data.password })
    if (error) return { success: false, error: 'Error al actualizar la contraseña.' }
  }

  revalidatePath('/professor/subjects')
  return { success: true }
}
