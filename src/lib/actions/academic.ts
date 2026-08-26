'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'

const ACADEMIC_PATH = '/admin/academic'

// ------------------------------------------------------------
// Carreras
// ------------------------------------------------------------

export async function createCareer(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const name = ((formData.get('name') as string) || '').trim()
  const code = ((formData.get('code') as string) || '').trim()

  if (!name || !code) return { success: false, error: 'Nombre y código son obligatorios' }

  const { error } = await supabase.from('careers').insert({ name, code })

  if (error) {
    if (error.code === '23505')
      return { success: false, error: 'Ya existe una carrera con este código' }
    return { success: false, error: 'Error al crear la carrera' }
  }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}

export async function updateCareer(careerId: string, data: { name: string; code: string }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  if (!data.name || !data.code) return { success: false, error: 'Nombre y código son obligatorios' }

  const { error } = await supabase
    .from('careers')
    .update({ name: data.name, code: data.code })
    .eq('id', careerId)

  if (error) {
    if (error.code === '23505')
      return { success: false, error: 'Ya existe una carrera con este código' }
    return { success: false, error: 'Error al actualizar la carrera' }
  }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}

export async function setCareerActive(careerId: string, isActive: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { error } = await supabase
    .from('careers')
    .update({ is_active: isActive })
    .eq('id', careerId)

  if (error) return { success: false, error: 'Error al actualizar la carrera' }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}

// ------------------------------------------------------------
// Períodos académicos
// ------------------------------------------------------------

export async function createPeriod(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const name = ((formData.get('name') as string) || '').trim()
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  if (!name) return { success: false, error: 'El nombre del período es obligatorio' }
  if (!/^\d{4}-[1-3]$/.test(name)) {
    return { success: false, error: 'El período debe tener el formato AAAA-N, ej. 2026-1' }
  }
  if (startDate && endDate && startDate >= endDate) {
    return { success: false, error: 'La fecha de inicio debe ser anterior a la fecha de fin' }
  }

  const { error } = await supabase
    .from('periods')
    .insert({ name, start_date: startDate, end_date: endDate })

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Ese período ya existe' }
    return { success: false, error: 'Error al crear el período' }
  }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}

export async function setPeriodActive(periodId: string, isActive: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { error } = await supabase
    .from('periods')
    .update({ is_active: isActive })
    .eq('id', periodId)

  if (error) return { success: false, error: 'Error al actualizar el período' }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}

// ------------------------------------------------------------
// Pénsum: materia <-> carrera <-> nivel
// ------------------------------------------------------------

export async function assignSubjectToCareer(
  subjectId: string,
  careerId: string,
  level: number | null
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  if (level !== null && (level < 1 || level > 20)) {
    return { success: false, error: 'El nivel debe estar entre 1 y 20' }
  }

  const { error } = await supabase
    .from('subject_careers')
    .upsert(
      { subject_id: subjectId, career_id: careerId, level, is_active: true },
      { onConflict: 'subject_id,career_id' }
    )

  if (error) return { success: false, error: 'Error al asignar la materia al pénsum' }

  revalidatePath(`${ACADEMIC_PATH}/${careerId}/pensum`)
  revalidatePath('/admin/subjects')
  return { success: true }
}

export async function removeSubjectFromCareer(subjectCareerId: string, careerId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { error } = await supabase
    .from('subject_careers')
    .update({ is_active: false })
    .eq('id', subjectCareerId)

  if (error) return { success: false, error: 'Error al quitar la materia del pénsum' }

  revalidatePath(`${ACADEMIC_PATH}/${careerId}/pensum`)
  revalidatePath('/admin/subjects')
  return { success: true }
}

// ------------------------------------------------------------
// Estudiante <-> carrera
// ------------------------------------------------------------

export async function setStudentCareer(studentId: string, careerId: string, enabled: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { error } = await supabase
    .from('student_careers')
    .upsert(
      { student_id: studentId, career_id: careerId, is_active: enabled },
      { onConflict: 'student_id,career_id' }
    )

  if (error) return { success: false, error: 'Error al actualizar las carreras del estudiante' }

  revalidatePath('/admin/users')
  return { success: true }
}
