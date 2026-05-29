'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
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

  const email = (formData.get('email') as string).trim()
  const password = (formData.get('password') as string).trim()
  const name = formData.get('name') as string
  const studentCode = (formData.get('student_code') as string).trim()
  const role = formData.get('role') as 'ADMIN' | 'PROFESSOR' | 'STUDENT'

  if (!email || !password || !name || !studentCode) return { success: false, error: 'Faltan datos obligatorios.' }

  // Validar dominio institucional para docentes y estudiantes
  if (role !== 'ADMIN' && !email.endsWith('@urepublicana.edu.co')) {
    return { success: false, error: 'El correo de docentes y estudiantes debe ser @urepublicana.edu.co' }
  }

  const admin = getSupabaseAdmin()

  // Verificar que el student_code no exista
  const { data: existingCode } = await admin.from('profiles').select('id').eq('student_code', studentCode).maybeSingle()
  if (existingCode) return { success: false, error: 'Ese código/ID institucional ya está registrado por otro usuario.' }

  // Crear usuario usando la API Admin (GoTrue)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, student_code: studentCode }
  })

  if (error) return { success: false, error: error.message }

  // Esperar a que el trigger de Supabase cree el profile
  await new Promise(resolve => setTimeout(resolve, 500))

  // Actualizar rol, código e email
  await admin.from('profiles').update({ role, student_code: studentCode, email }).eq('id', data.user.id)

  revalidatePath('/admin/users')
  return { success: true }
}

export async function deleteUserAccount(userId: string) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  if (userId === adminUser.id) return { success: false, error: 'No puedes desactivarte a ti mismo.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', userId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/users')
  revalidatePath('/admin/dashboard')
  return { success: true }
}

export async function reactivateUser(userId: string) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: true })
    .eq('id', userId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/users')
  revalidatePath('/admin/dashboard')
  return { success: true }
}

export async function updateUserAccount(userId: string, data: { name?: string, password?: string, student_code?: string }) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  const admin = getSupabaseAdmin()

  // Verificar unicidad del student_code
  if (data.student_code) {
    const { data: existingCode } = await admin.from('profiles').select('id').eq('student_code', data.student_code).neq('id', userId).maybeSingle()
    if (existingCode) return { success: false, error: 'Ese código/ID institucional ya pertenece a otro usuario.' }
  }

  if (data.password) {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      password: data.password
    })
    if (authError) return { success: false, error: authError.message }
  }

  const updates: Record<string, string> = {}
  const metaUpdates: Record<string, string> = {}

  if (data.name) {
    updates.name = data.name
    metaUpdates.full_name = data.name
  }

  if (data.student_code) {
    updates.student_code = data.student_code
    metaUpdates.student_code = data.student_code
  }

  if (Object.keys(updates).length > 0) {
    const { error: profileError } = await admin.from('profiles').update(updates).eq('id', userId)
    await admin.auth.admin.updateUserById(userId, { user_metadata: metaUpdates })
    if (profileError) return { success: false, error: profileError.message }
  }

  revalidatePath('/admin/users')
  return { success: true }
}

export async function getStudentAttendanceHistory(studentId: string) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.', data: null }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('attendances')
    .select(`
      id,
      scanned_at,
      session:sessions (
        id,
        date,
        subject:subjects (
          name,
          code
        )
      )
    `)
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false })

  if (error) return { success: false, error: error.message, data: null }
  return { success: true, data, error: null }
}
