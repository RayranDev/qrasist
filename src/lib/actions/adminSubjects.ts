'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function checkAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return data?.role === 'ADMIN'
}

export async function createSubject(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const name = formData.get('name') as string
  const code = formData.get('code') as string
  const professor_id = formData.get('professor_id') as string

  if (!name || !code) return { success: false, error: 'Nombre y código son obligatorios' }

  const { error } = await supabase.from('subjects').insert({
    name,
    code,
    professor_id: professor_id || null
  })

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Ya existe una materia con este código' }
    return { success: false, error: 'Error al crear la materia' }
  }

  revalidatePath('/admin/subjects')
  return { success: true }
}

export async function deleteSubject(subjectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { error } = await supabase.from('subjects').delete().eq('id', subjectId)
  
  if (error) return { success: false, error: 'Error al eliminar la materia' }

  revalidatePath('/admin/subjects')
  return { success: true }
}

export async function updateSubject(subjectId: string, data: { name: string, code: string, professor_id: string | null }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  if (!data.name || !data.code) return { success: false, error: 'Nombre y código son obligatorios' }

  const { error } = await supabase.from('subjects').update({
    name: data.name,
    code: data.code,
    professor_id: data.professor_id || null
  }).eq('id', subjectId)

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Ya existe una materia con este código' }
    return { success: false, error: 'Error al actualizar la materia' }
  }

  revalidatePath('/admin/subjects')
  return { success: true }
}
