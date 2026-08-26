'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'
import { normalizeName } from '@/lib/utils/normalizeText'

export async function updateOwnProfile(data: {
  first_name?: string
  last_name?: string
  password?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'No autenticado.' }

  if (data.first_name || data.last_name) {
    const updates: Record<string, string> = {}
    if (data.first_name) updates.first_name = normalizeName(data.first_name)
    if (data.last_name) updates.last_name = normalizeName(data.last_name)

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
    if (error) return { success: false, error: 'Error al actualizar el nombre.' }
    await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
      user_metadata: updates,
    })
  }

  if (data.password) {
    if (data.password.length < 6)
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' }
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
      password: data.password,
    })
    if (error) return { success: false, error: 'Error al actualizar la contraseña.' }
  }

  revalidatePath('/professor/subjects')
  return { success: true }
}
