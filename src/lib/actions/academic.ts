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

// Borrado real solo para usuarios (profiles) -- carreras/materias/
// periodos se pueden editar libremente y borrar de verdad, salvo que
// tengan datos reales asociados (pensum, inscripciones, sesiones):
// ahi se archivan en su lugar para no perder ese historial. Las
// tablas de union tienen ON DELETE CASCADE hacia careers, asi que un
// borrado real sin este chequeo se llevaria ese historial en
// silencio -- por eso se cuenta antes de intentar el delete.
export async function deleteCareer(careerId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const [{ count: subjectCareers }, { count: studentCareers }, { count: professorCareers }] =
    await Promise.all([
      supabase
        .from('subject_careers')
        .select('*', { count: 'exact', head: true })
        .eq('career_id', careerId),
      supabase
        .from('student_careers')
        .select('*', { count: 'exact', head: true })
        .eq('career_id', careerId),
      supabase
        .from('professor_careers')
        .select('*', { count: 'exact', head: true })
        .eq('career_id', careerId),
    ])

  const hasDependents =
    (subjectCareers || 0) > 0 || (studentCareers || 0) > 0 || (professorCareers || 0) > 0

  if (hasDependents) {
    const { error } = await supabase.from('careers').update({ is_active: false }).eq('id', careerId)
    if (error) return { success: false, error: 'Error al archivar la carrera' }
    revalidatePath(ACADEMIC_PATH)
    return {
      success: true,
      archived: true,
      message:
        'Esta carrera tiene materias, estudiantes o profesores asociados: se archivó en vez de borrarse.',
    }
  }

  const { error } = await supabase.from('careers').delete().eq('id', careerId)
  if (error) return { success: false, error: 'Error al borrar la carrera' }

  revalidatePath(ACADEMIC_PATH)
  return { success: true, archived: false }
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

export async function updatePeriod(
  periodId: string,
  data: { name: string; start_date: string | null; end_date: string | null }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const name = data.name.trim()
  if (!name) return { success: false, error: 'El nombre del período es obligatorio' }
  if (!/^\d{4}-[1-3]$/.test(name)) {
    return { success: false, error: 'El período debe tener el formato AAAA-N, ej. 2026-1' }
  }
  if (data.start_date && data.end_date && data.start_date >= data.end_date) {
    return { success: false, error: 'La fecha de inicio debe ser anterior a la fecha de fin' }
  }

  const { error } = await supabase
    .from('periods')
    .update({ name, start_date: data.start_date, end_date: data.end_date })
    .eq('id', periodId)

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Ese período ya existe' }
    return { success: false, error: 'Error al actualizar el período' }
  }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}

// Ver nota en deleteCareer: mismo criterio (borrar de verdad si no
// tiene materias asociadas, archivar si las tiene).
export async function deletePeriod(periodId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { count: subjectCount } = await supabase
    .from('subjects')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', periodId)

  if ((subjectCount || 0) > 0) {
    const { error } = await supabase.from('periods').update({ is_active: false }).eq('id', periodId)
    if (error) return { success: false, error: 'Error al archivar el período' }
    revalidatePath(ACADEMIC_PATH)
    return {
      success: true,
      archived: true,
      message: 'Este período tiene materias asociadas: se archivó en vez de borrarse.',
    }
  }

  const { error } = await supabase.from('periods').delete().eq('id', periodId)
  if (error) return { success: false, error: 'Error al borrar el período' }

  revalidatePath(ACADEMIC_PATH)
  return { success: true, archived: false }
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
    return { success: false, error: 'El semestre debe estar entre 1 y 20' }
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

// ------------------------------------------------------------
// Profesor <-> carrera
// ------------------------------------------------------------

export async function setProfessorCareer(professorId: string, careerId: string, enabled: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { error } = await supabase
    .from('professor_careers')
    .upsert(
      { professor_id: professorId, career_id: careerId, is_active: enabled },
      { onConflict: 'professor_id,career_id' }
    )

  if (error) return { success: false, error: 'Error al actualizar las carreras del profesor' }

  revalidatePath('/admin/users')
  revalidatePath('/admin/subjects')
  return { success: true }
}
