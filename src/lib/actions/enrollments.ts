'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function checkAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return data?.role === 'ADMIN'
}

export async function addEnrollment(subjectId: string, studentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.from('enrollments').insert({ subject_id: subjectId, student_id: studentId })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'El estudiante ya está inscrito.' }
    return { success: false, error: 'Error al inscribir al estudiante.' }
  }

  revalidatePath(`/admin/subjects/${subjectId}/enrollments`)
  return { success: true }
}

export async function removeEnrollment(subjectId: string, studentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.from('enrollments').delete().eq('subject_id', subjectId).eq('student_id', studentId)
  if (error) return { success: false, error: 'Error al remover la inscripción.' }

  revalidatePath(`/admin/subjects/${subjectId}/enrollments`)
  return { success: true }
}
