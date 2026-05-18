'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'

async function verifyAdminAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'ADMIN' ? user : null
}

export async function updateUserRole(userId: string, newRole: 'ADMIN' | 'PROFESSOR' | 'STUDENT') {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  if (userId === adminUser.id && newRole !== 'ADMIN') {
    return { success: false, error: 'No puedes quitarte el rol de Administrador a ti mismo.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
  
  if (error) return { success: false, error: 'Error al actualizar el rol.' }
  
  revalidatePath('/admin/users')
  return { success: true }
}

export async function createUserAccount(formData: FormData) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string
  const role = formData.get('role') as 'ADMIN' | 'PROFESSOR' | 'STUDENT'

  if (!email || !password || !name) return { success: false, error: 'Faltan datos.' }

  // Crear usuario usando la API Admin (GoTrue)
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name }
  })

  if (error) return { success: false, error: error.message }

  // Actualizar el rol (el trigger lo creó como STUDENT por defecto)
  await supabaseAdmin.from('profiles').update({ role }).eq('id', data.user.id)

  revalidatePath('/admin/users')
  return { success: true }
}

export async function deleteUserAccount(userId: string) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  if (userId === adminUser.id) return { success: false, error: 'No puedes borrarte a ti mismo.' }

  // Eliminar usuario desde la raíz de Auth
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/users')
  return { success: true }
}
