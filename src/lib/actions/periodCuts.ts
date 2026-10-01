'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'

const ACADEMIC_PATH = '/admin/academic'

interface ActionResult {
  success: boolean
  error?: string
}

export interface PeriodCut {
  id: string
  period_id: string
  name: string
  start_date: string
  end_date: string
  sequence: number
}

interface CutInput {
  name: string
  startDate: string
  endDate: string
}

function validateCutInput(data: CutInput): string | null {
  if (!data.name.trim()) return 'El nombre del corte es obligatorio'
  if (!data.startDate || !data.endDate) return 'Las fechas de inicio y fin son obligatorias'
  if (data.startDate > data.endDate) {
    return 'La fecha de inicio debe ser anterior o igual a la fecha de fin'
  }
  return null
}

/**
 * Lectura de cortes para la UI de admin. period_cuts_select (migración
 * 026) ya permite leer a cualquier autenticado activo -- el checkAdmin
 * de acá es una restricción a nivel de la pantalla de admin, no de la
 * tabla (otras pantallas podrían leer cortes sin pasar por admin).
 */
export async function listPeriodCuts(
  periodId: string
): Promise<{ success: boolean; cuts?: PeriodCut[]; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { data, error } = await supabase
    .from('period_cuts')
    .select('*')
    .eq('period_id', periodId)
    .order('sequence')

  if (error) return { success: false, error: 'Error al cargar los cortes' }
  return { success: true, cuts: (data as PeriodCut[]) || [] }
}

export async function createPeriodCut(periodId: string, data: CutInput): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const validationError = validateCutInput(data)
  if (validationError) return { success: false, error: validationError }

  const { data: period } = await supabase
    .from('periods')
    .select('id, start_date, end_date')
    .eq('id', periodId)
    .single()

  if (!period) return { success: false, error: 'Período no encontrado' }

  if (period.start_date && data.startDate < period.start_date) {
    return { success: false, error: 'El corte no puede empezar antes del inicio del período' }
  }
  if (period.end_date && data.endDate > period.end_date) {
    return { success: false, error: 'El corte no puede terminar después del fin del período' }
  }

  // Escritura con service-role: period_cuts no tiene policies de
  // INSERT/UPDATE/DELETE a propósito (ver migración 026), el chequeo
  // de admin ya se hizo arriba con el cliente de sesión normal.
  const admin = getSupabaseAdmin()

  const { data: siblings } = await admin
    .from('period_cuts')
    .select('id, start_date, end_date, sequence')
    .eq('period_id', periodId)

  const hasOverlap = (siblings || []).some(
    (c) => data.startDate <= c.end_date && c.start_date <= data.endDate
  )
  if (hasOverlap) {
    return { success: false, error: 'Las fechas se solapan con otro corte de este período' }
  }

  const nextSequence = (siblings || []).reduce((max, c) => Math.max(max, c.sequence), 0) + 1

  const { error } = await admin.from('period_cuts').insert({
    period_id: periodId,
    name: data.name.trim(),
    start_date: data.startDate,
    end_date: data.endDate,
    sequence: nextSequence,
  })

  if (error) return { success: false, error: 'No se pudo crear el corte' }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}

export async function updatePeriodCut(cutId: string, data: CutInput): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const validationError = validateCutInput(data)
  if (validationError) return { success: false, error: validationError }

  const admin = getSupabaseAdmin()

  const { data: existing } = await admin
    .from('period_cuts')
    .select('id, period_id')
    .eq('id', cutId)
    .single()

  if (!existing) return { success: false, error: 'Corte no encontrado' }

  const { data: period } = await supabase
    .from('periods')
    .select('id, start_date, end_date')
    .eq('id', existing.period_id)
    .single()

  if (!period) return { success: false, error: 'Período no encontrado' }

  if (period.start_date && data.startDate < period.start_date) {
    return { success: false, error: 'El corte no puede empezar antes del inicio del período' }
  }
  if (period.end_date && data.endDate > period.end_date) {
    return { success: false, error: 'El corte no puede terminar después del fin del período' }
  }

  const { data: siblings } = await admin
    .from('period_cuts')
    .select('id, start_date, end_date')
    .eq('period_id', existing.period_id)
    .neq('id', cutId)

  const hasOverlap = (siblings || []).some(
    (c) => data.startDate <= c.end_date && c.start_date <= data.endDate
  )
  if (hasOverlap) {
    return { success: false, error: 'Las fechas se solapan con otro corte de este período' }
  }

  const { error } = await admin
    .from('period_cuts')
    .update({ name: data.name.trim(), start_date: data.startDate, end_date: data.endDate })
    .eq('id', cutId)

  if (error) return { success: false, error: 'No se pudo actualizar el corte' }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}

export async function deletePeriodCut(cutId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('period_cuts').delete().eq('id', cutId)

  if (error) return { success: false, error: 'No se pudo eliminar el corte' }

  revalidatePath(ACADEMIC_PATH)
  return { success: true }
}
