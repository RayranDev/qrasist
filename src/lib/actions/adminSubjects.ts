'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { checkProfessorAssignable } from './enrollmentGuards'

export async function createSubject(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const name = formData.get('name') as string
  const code = formData.get('code') as string
  const period_id = formData.get('period_id') as string

  if (!name || !code) return { success: false, error: 'Nombre y código son obligatorios' }

  // Una materia recien creada todavia no pertenece a ninguna
  // carrera, asi que no puede tener profesor (regla A+B) --
  // se asigna despues, una vez tenga carrera en su pensum.
  const { error } = await supabase.from('subjects').insert({
    name,
    code,
    period_id: period_id || null,
  })

  if (error) {
    if (error.code === '23505')
      return { success: false, error: 'Ya existe una materia con este código' }
    return { success: false, error: 'Error al crear la materia' }
  }

  revalidatePath('/admin/subjects')
  return { success: true }
}

// Borrado inteligente: si la materia tiene sesiones, inscripciones,
// pensum o solicitudes asociadas, se archiva para no perder ese
// historial (todas esas tablas tienen ON DELETE CASCADE hacia
// subjects, asi que un DELETE real las arrastraria en silencio).
// Si no tiene nada asociado, se borra de verdad.
export async function deleteSubject(subjectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const [
    { count: sessions },
    { count: enrollments },
    { count: subjectCareers },
    { count: enrollmentRequests },
  ] = await Promise.all([
    supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
    supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
    supabase
      .from('subject_careers')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
    supabase
      .from('enrollment_requests')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
  ])

  const hasDependents =
    (sessions || 0) > 0 ||
    (enrollments || 0) > 0 ||
    (subjectCareers || 0) > 0 ||
    (enrollmentRequests || 0) > 0

  if (hasDependents) {
    const { error } = await supabase
      .from('subjects')
      .update({ is_active: false })
      .eq('id', subjectId)
    if (error) return { success: false, error: 'Error al archivar la materia' }
    revalidatePath('/admin/subjects')
    revalidatePath('/admin/dashboard')
    return {
      success: true,
      archived: true,
      message:
        'Esta materia tiene sesiones, inscripciones o pénsum asociados: se archivó en vez de borrarse.',
    }
  }

  const { error } = await supabase.from('subjects').delete().eq('id', subjectId)
  if (error) return { success: false, error: 'Error al borrar la materia' }

  revalidatePath('/admin/subjects')
  revalidatePath('/admin/dashboard')
  return { success: true, archived: false }
}

export async function reactivateSubject(subjectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { error } = await supabase.from('subjects').update({ is_active: true }).eq('id', subjectId)

  if (error) return { success: false, error: 'Error al reactivar la materia' }

  revalidatePath('/admin/subjects')
  revalidatePath('/admin/dashboard')
  return { success: true }
}

export async function updateSubject(
  subjectId: string,
  data: { name: string; code: string; professor_id: string | null; period_id: string | null }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  if (!data.name || !data.code) return { success: false, error: 'Nombre y código son obligatorios' }

  if (data.professor_id) {
    const check = await checkProfessorAssignable(supabase, subjectId, data.professor_id)
    if (!check.ok) return { success: false, error: check.error }
  }

  const { error } = await supabase
    .from('subjects')
    .update({
      name: data.name,
      code: data.code,
      professor_id: data.professor_id || null,
      period_id: data.period_id || null,
    })
    .eq('id', subjectId)

  if (error) {
    if (error.code === '23505')
      return { success: false, error: 'Ya existe una materia con este código' }
    return { success: false, error: 'Error al actualizar la materia' }
  }

  revalidatePath('/admin/subjects')
  return { success: true }
}
