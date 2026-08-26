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
