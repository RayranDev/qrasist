'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { checkProfessorAssignable, getProfessorCareerIds } from './enrollmentGuards'
import { subjectSchema } from '@/lib/validations/schemas'
import { logAudit } from '@/lib/audit/auditLog'
import {
  diffFields,
  getGlobalPolicy,
  parseChangeReason,
  parseGlobalPolicyInput,
  policyToColumns,
  type FieldChanges,
} from '@/lib/settings/globalPolicy'
import { sanitizeSearchTerm } from '@/lib/utils/searchTerm'
import { ASSIGNABLE_SUBJECTS_PAGE_SIZE, normalizeSubjectIds } from '@/lib/admin/assignSubjects'

export async function createSubject(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  // Por defecto la materia hereda la política global (la base de datos copia
  // los valores globales). Solo con "personalizada" se guardan valores propios.
  const policyMode = formData.get('policy_mode')
  if (policyMode !== 'global' && policyMode !== 'custom') {
    return { success: false, error: 'Modo de política inválido.' }
  }
  const customPolicy = policyMode === 'custom'

  const raw = {
    name: formData.get('name') as string,
    code: formData.get('code') as string,
    periodId: (formData.get('period_id') as string) || undefined,
    totalPlannedSessions: formData.get('total_planned_sessions') || 16,
  }

  const parsed = subjectSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Datos de materia inválidos',
    }
  }

  let policyColumns: Record<string, unknown> = {}
  let policyChanges: FieldChanges = {}
  let policyReason = ''
  if (customPolicy) {
    // Campo de tolerancia vacío = tardanzas desactivadas para esta materia.
    const policy = parseGlobalPolicyInput({
      lateAfterMinutes: formData.get('late_after_minutes'),
      latesPerAbsence: formData.get('lates_per_absence'),
      absenceRuleType: formData.get('absence_rule_type'),
      maxAbsencePercentage: formData.get('max_absence_percentage'),
      maxAbsenceCount: formData.get('max_absence_count'),
    })
    if (!policy.ok) return { success: false, error: policy.error }
    const reason = parseChangeReason(formData.get('policy_reason'))
    if (!reason.ok) return { success: false, error: reason.error }

    policyReason = reason.reason
    policyColumns = policyToColumns(policy.policy)
    policyChanges = diffFields(
      { policy_override: false, ...policyToColumns(await getGlobalPolicy(supabase)) },
      { policy_override: true, ...policyColumns }
    )
  }

  const { data: created, error } = await supabase
    .from('subjects')
    .insert({
      name: parsed.data.name,
      code: parsed.data.code,
      period_id: parsed.data.periodId || null,
      total_planned_sessions: parsed.data.totalPlannedSessions,
      policy_override: customPolicy,
      ...policyColumns,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505')
      return { success: false, error: 'Ya existe una materia con este código' }
    return { success: false, error: 'Error al crear la materia' }
  }

  if (customPolicy) {
    await logAudit({
      actorId: user.id,
      action: 'subject.update_policy',
      entityType: 'subject',
      entityId: created?.id ?? null,
      subjectId: created?.id ?? null,
      details: { changes: policyChanges, reason: policyReason, created: true },
    })
  }

  revalidatePath('/admin/subjects')
  return { success: true }
}

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
      .select('id', { count: 'exact', head: true })
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
  data: {
    name: string
    code: string
    professor_id: string | null
    period_id: string | null
    total_planned_sessions?: number
    /**
     * 'global' = la materia hereda la política global; 'custom' = política
     * propia con los valores de abajo. Sin `policy_mode` no se toca la política.
     */
    policy_mode?: 'global' | 'custom'
    /** Motivo obligatorio cuando cambia la política o el modo de la materia. */
    policy_reason?: string
    absence_rule_type?: 'PERCENTAGE' | 'FIXED_COUNT'
    max_absence_percentage?: number
    max_absence_count?: number | null
    late_after_minutes?: number | null
    lates_per_absence?: number | null
  }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const parsed = subjectSchema.safeParse({
    name: data.name,
    code: data.code,
    periodId: data.period_id,
    totalPlannedSessions: data.total_planned_sessions,
  })

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Datos inválidos' }
  }

  // Llega del cliente: se valida en tiempo de ejecución (ausente = no tocar la política).
  const rawMode: unknown = data.policy_mode
  if (rawMode !== undefined && rawMode !== 'global' && rawMode !== 'custom') {
    return { success: false, error: 'Modo de política inválido.' }
  }

  if (data.professor_id) {
    const check = await checkProfessorAssignable(supabase, subjectId, data.professor_id)
    if (!check.ok) return { success: false, error: check.error }
  }

  // Política de asistencia: se compara contra lo guardado y, si algo cambia
  // (valores o modo global/personalizada), exige un motivo y se audita.
  let policyUpdate: Record<string, unknown> = {}
  let policyChanges: FieldChanges = {}
  let policyReason = ''
  if (data.policy_mode) {
    const { data: current } = await supabase
      .from('subjects')
      .select(
        'policy_override, late_after_minutes, lates_per_absence, absence_rule_type, max_absence_percentage, max_absence_count'
      )
      .eq('id', subjectId)
      .maybeSingle()
    if (!current) return { success: false, error: 'La materia no existe.' }

    const custom = data.policy_mode === 'custom'
    let nextPolicy = await getGlobalPolicy(supabase)
    if (custom) {
      const policy = parseGlobalPolicyInput({
        lateAfterMinutes: data.late_after_minutes,
        latesPerAbsence: data.lates_per_absence,
        absenceRuleType: data.absence_rule_type,
        maxAbsencePercentage: data.max_absence_percentage,
        maxAbsenceCount: data.max_absence_count,
      })
      if (!policy.ok) return { success: false, error: policy.error }
      nextPolicy = policy.policy
    }

    const after = { policy_override: custom, ...policyToColumns(nextPolicy) }
    policyChanges = diffFields(current, after)
    if (Object.keys(policyChanges).length > 0) {
      const reason = parseChangeReason(data.policy_reason)
      if (!reason.ok) return { success: false, error: reason.error }
      policyReason = reason.reason
      // En modo global solo se apaga el override: el trigger copia los valores globales.
      policyUpdate = custom ? after : { policy_override: false }
    }
  }

  const { error } = await supabase
    .from('subjects')
    .update({
      name: parsed.data.name,
      code: parsed.data.code,
      professor_id: data.professor_id || null,
      period_id: parsed.data.periodId || null,
      total_planned_sessions: parsed.data.totalPlannedSessions,
      ...policyUpdate,
    })
    .eq('id', subjectId)

  if (error) {
    if (error.code === '23505')
      return { success: false, error: 'Ya existe una materia con este código' }
    return { success: false, error: 'Error al actualizar la materia' }
  }

  if (Object.keys(policyChanges).length > 0) {
    await logAudit({
      actorId: user.id,
      action: 'subject.update_policy',
      entityType: 'subject',
      entityId: subjectId,
      subjectId,
      details: { changes: policyChanges, reason: policyReason },
    })
  }

  revalidatePath('/admin/subjects')
  revalidatePath('/admin/dashboard')
  revalidatePath('/professor/subjects')
  return { success: true }
}

// ------------------------------------------------------------
// Asignar materias a un profesor (paso opcional al promoverlo)
// ------------------------------------------------------------

export interface AssignableSubject {
  id: string
  code: string
  name: string
}

export interface AssignSubjectFailure {
  subjectId: string
  code: string | null
  error: string
}

async function getActiveProfessor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  professorId: string
) {
  const { data } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', professorId)
    .single()
  return data?.role === 'PROFESSOR' && data.is_active !== false
}

/**
 * Active subjects without a professor that this professor may be assigned to
 * (they share at least one active career), searchable by code or name. Limited to
 * one page: the admin narrows the list with the search box.
 */
export async function listSubjectsAssignableToProfessor(
  professorId: string,
  search?: string
): Promise<
  | { success: true; noCareers: boolean; subjects: AssignableSubject[]; total: number }
  | { success: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }
  if (!(await getActiveProfessor(supabase, professorId))) {
    return { success: false, error: 'El usuario seleccionado no es un docente activo.' }
  }

  const careerIds = await getProfessorCareerIds(supabase, professorId)
  if (careerIds.length === 0) {
    return { success: true, noCareers: true, subjects: [], total: 0 }
  }

  const term = sanitizeSearchTerm(search)
  let query = supabase
    .from('subjects')
    .select('id, code, name, subject_careers!inner(career_id)', { count: 'exact' })
    .eq('is_active', true)
    .is('professor_id', null)
    .eq('subject_careers.is_active', true)
    .in('subject_careers.career_id', careerIds)
    .order('name')
    .order('id')
  if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`)

  const { data, count, error } = await query.limit(ASSIGNABLE_SUBJECTS_PAGE_SIZE)
  if (error) return { success: false, error: 'No se pudieron cargar las materias.' }

  const subjects = ((data || []) as AssignableSubject[]).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
  }))
  return { success: true, noCareers: false, subjects, total: count ?? subjects.length }
}

/**
 * Assigns the given subjects to a professor. Every subject must pass the same
 * checks as updateSubject (checkProfessorAssignable) and still be active and
 * without a professor. All are validated first: if any fails nothing is applied
 * and the per-subject failures are returned. If a concurrent change makes an
 * individual write fail afterwards, `assigned` and `failures` say exactly what
 * happened -- the result never hides a partial outcome.
 *
 * Known limitation (accepted): validation and writes are separate statements, so a
 * concurrent change (e.g. the professor's role) between them is not caught; closing
 * that would need a DB trigger/migration. It also runs several sequential queries
 * per subject (bounded by the 50-subject cap).
 */
export async function assignSubjectsToProfessor(
  professorId: string,
  subjectIds: string[]
): Promise<{
  success: boolean
  error?: string
  assigned: string[]
  failures: AssignSubjectFailure[]
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado', assigned: [], failures: [] }
  }

  const normalized = normalizeSubjectIds(subjectIds)
  if (!normalized.ok) {
    return { success: false, error: normalized.error, assigned: [], failures: [] }
  }
  const ids = normalized.ids

  if (!(await getActiveProfessor(supabase, professorId))) {
    return {
      success: false,
      error: 'El usuario seleccionado no es un docente activo.',
      assigned: [],
      failures: [],
    }
  }

  const { data: found, error: loadError } = await supabase
    .from('subjects')
    .select('id, code, is_active, professor_id')
    .in('id', ids)
  if (loadError) {
    return {
      success: false,
      error: 'No se pudieron cargar las materias.',
      assigned: [],
      failures: [],
    }
  }
  const byId = new Map(
    (
      (found || []) as {
        id: string
        code: string
        is_active: boolean
        professor_id: string | null
      }[]
    ).map((s) => [s.id, s])
  )

  const failures: AssignSubjectFailure[] = []
  for (const id of ids) {
    const subject = byId.get(id)
    if (!subject) {
      failures.push({ subjectId: id, code: null, error: 'La materia no existe.' })
    } else if (subject.is_active === false) {
      failures.push({ subjectId: id, code: subject.code, error: 'La materia está archivada.' })
    } else if (subject.professor_id) {
      failures.push({ subjectId: id, code: subject.code, error: 'La materia ya tiene docente.' })
    } else {
      const check = await checkProfessorAssignable(supabase, id, professorId)
      if (!check.ok) failures.push({ subjectId: id, code: subject.code, error: check.error })
    }
  }

  if (failures.length > 0) {
    return {
      success: false,
      error: 'No se asignó ninguna materia: revisa las que no se pueden asignar.',
      assigned: [],
      failures,
    }
  }

  const assigned: string[] = []
  for (const id of ids) {
    // The filters make the write atomic against a concurrent assignment.
    const { data: updated, error } = await supabase
      .from('subjects')
      .update({ professor_id: professorId })
      .eq('id', id)
      .eq('is_active', true)
      .is('professor_id', null)
      .select('id')
    if (error || !updated || updated.length === 0) {
      failures.push({
        subjectId: id,
        code: byId.get(id)?.code ?? null,
        error: 'No se pudo asignar: la materia cambió mientras tanto.',
      })
    } else {
      assigned.push(id)
    }
  }

  if (assigned.length > 0) {
    await logAudit({
      actorId: user.id,
      action: 'user.assign_subjects',
      entityType: 'profile',
      entityId: professorId,
      details: {
        subject_ids: assigned,
        assigned_count: assigned.length,
        failed_count: failures.length,
      },
    })
    revalidatePath('/admin/subjects')
    revalidatePath('/admin/users')
  }

  return {
    success: failures.length === 0,
    ...(failures.length > 0
      ? {
          error:
            assigned.length === 0
              ? 'No se asignó ninguna materia: revisa las que fallaron.'
              : `Se asignaron ${assigned.length} de ${ids.length} materias; revisa las que fallaron.`,
        }
      : {}),
    assigned,
    failures,
  }
}

// ------------------------------------------------------------
// Horario semanal (subject_schedules)
// ------------------------------------------------------------

export interface SubjectSchedule {
  id: string
  subject_id: string
  day_of_week: number
  start_time: string
  end_time: string
  modality: 'PRESENCIAL' | 'VIRTUAL'
}

const DAY_OF_WEEK_MIN = 0
const DAY_OF_WEEK_MAX = 6

interface ScheduleInput {
  dayOfWeek: number
  startTime: string
  endTime: string
  modality: 'PRESENCIAL' | 'VIRTUAL'
}

function validateScheduleInput(data: ScheduleInput): string | null {
  if (
    !Number.isInteger(data.dayOfWeek) ||
    data.dayOfWeek < DAY_OF_WEEK_MIN ||
    data.dayOfWeek > DAY_OF_WEEK_MAX
  ) {
    return 'Día de la semana inválido'
  }
  if (!data.startTime || !data.endTime) {
    return 'La hora de inicio y fin son obligatorias'
  }
  if (data.startTime >= data.endTime) {
    return 'La hora de inicio debe ser anterior a la hora de fin'
  }
  if (data.modality !== 'PRESENCIAL' && data.modality !== 'VIRTUAL') {
    return 'Modalidad inválida'
  }
  return null
}

export async function listSubjectSchedules(
  subjectId: string
): Promise<{ success: boolean; schedules?: SubjectSchedule[]; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const { data, error } = await supabase
    .from('subject_schedules')
    .select('*')
    .eq('subject_id', subjectId)
    .order('day_of_week')

  if (error) return { success: false, error: 'Error al cargar el horario' }
  return { success: true, schedules: (data as SubjectSchedule[]) || [] }
}

export async function addSubjectSchedule(
  subjectId: string,
  data: ScheduleInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const validationError = validateScheduleInput(data)
  if (validationError) return { success: false, error: validationError }

  // subject_schedules no tiene policies de INSERT/UPDATE/DELETE a
  // propósito (ver migración 026): se escribe con service-role
  // después del checkAdmin() de arriba.
  const admin = getSupabaseAdmin()
  const { error } = await admin.from('subject_schedules').insert({
    subject_id: subjectId,
    day_of_week: data.dayOfWeek,
    start_time: data.startTime,
    end_time: data.endTime,
    modality: data.modality,
  })

  if (error) return { success: false, error: 'No se pudo agregar el bloque de horario' }

  revalidatePath('/admin/subjects')
  return { success: true }
}

export async function removeSubjectSchedule(
  scheduleId: string,
  subjectId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !(await checkAdmin(supabase, user.id))) {
    return { success: false, error: 'No autorizado' }
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from('subject_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('subject_id', subjectId)

  if (error) return { success: false, error: 'No se pudo quitar el bloque de horario' }

  revalidatePath('/admin/subjects')
  return { success: true }
}
