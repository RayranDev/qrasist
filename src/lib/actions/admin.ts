'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'
import { normalizeName } from '@/lib/utils/normalizeText'
import { logAudit } from '@/lib/audit/auditLog'
import { isUserRole, type UserRole } from '@/components/ui/roleMeta'
import {
  IMPACT_LIST_CAP,
  emptyRoleChangeImpact,
  resolveRoleChangeScope,
} from '@/lib/admin/roleChangeImpact'

async function verifyAdminAccess() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .eq('is_active', true)
    .single()
  return profile?.role === 'ADMIN' ? user : null
}

interface SubjectRow {
  code: string
  name: string
}

/**
 * Read-only preview of what changing `userId` to `newRole` would remove, so the
 * admin can confirm before the change. The server remains the source of truth:
 * updateUserRole does the cleanup whether or not this was called.
 */
export async function getRoleChangeImpact(userId: string, newRole: UserRole) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false as const, error: 'Acceso denegado.' }
  if (!isUserRole(newRole)) return { success: false as const, error: 'Rol inválido.' }

  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
  if (!profile) return { success: false as const, error: 'Usuario no encontrado.' }

  const currentRole = isUserRole(profile.role) ? profile.role : null
  const impact = emptyRoleChangeImpact(currentRole)
  const scope = resolveRoleChangeScope(currentRole, newRole)

  if (scope.leavesStudent) {
    const [enrollments, pending] = await Promise.all([
      supabase
        .from('enrollments')
        .select('subject:subjects(code, name)', { count: 'exact' })
        .eq('student_id', userId)
        .limit(IMPACT_LIST_CAP),
      supabase
        .from('enrollment_requests')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', userId)
        .eq('status', 'pending'),
    ])
    if (enrollments.error || pending.error) {
      return { success: false as const, error: 'No se pudo calcular el impacto del cambio.' }
    }
    impact.enrollments = {
      total: enrollments.count ?? 0,
      subjects: ((enrollments.data || []) as unknown as { subject: SubjectRow | null }[])
        .map((row) => row.subject)
        .filter((s): s is SubjectRow => s !== null),
    }
    impact.pendingRequests = pending.count ?? 0
  }

  if (scope.leavesProfessor) {
    const { data, count, error } = await supabase
      .from('subjects')
      .select('code, name', { count: 'exact' })
      .eq('professor_id', userId)
      .eq('is_active', true)
      .order('code')
      .limit(IMPACT_LIST_CAP)
    if (error) {
      return { success: false as const, error: 'No se pudo calcular el impacto del cambio.' }
    }
    impact.taughtSubjects = { total: count ?? 0, subjects: (data || []) as SubjectRow[] }
  }

  return { success: true as const, impact }
}

const AUDIT_SUBJECT_IDS_CAP = 50

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Cleanup when a user stops being a student. Order matters:
 *  1. Delete every enrollment (the same delete removeEnrollment does). It is one
 *     atomic statement, so if it fails nothing has changed yet and the caller can
 *     safely revert the role.
 *  2. Reject the pending enrollment requests (same 'rejected' state the reject
 *     action uses). If this fails the enrollments are already gone, so the caller
 *     keeps the new role and reports a partial success.
 */
async function clearStudentEnrollments(supabase: ServerClient, adminId: string, studentId: string) {
  const { data: removed, error: enrollmentsError } = await supabase
    .from('enrollments')
    .delete()
    .eq('student_id', studentId)
    .select('subject_id')
  if (enrollmentsError) return { stage: 'enrollments_failed' as const }

  const removedSubjectIds = (removed || []).map((r) => r.subject_id as string)

  const { data: cancelled, error: requestsError } = await supabase
    .from('enrollment_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: adminId })
    .eq('student_id', studentId)
    .eq('status', 'pending')
    .select('id')
  if (requestsError) return { stage: 'requests_failed' as const, removedSubjectIds }

  return {
    stage: 'ok' as const,
    removedSubjectIds,
    cancelledRequests: (cancelled || []).length,
  }
}

/**
 * Changes a user's role. When the previous role is STUDENT and the new one is not,
 * the student's enrollments (and pending requests) are always removed server-side;
 * `options.unenroll` only records that the admin saw and confirmed the warning.
 *
 * The write is conditional on the role that was read (compare-and-set), so a
 * concurrent change is reported instead of silently overwritten. Every outcome
 * that mutated something is audited: the normal `user.role_change`, or
 * `user.role_change_failed` when the role was changed and then put back (or could
 * not be put back).
 */
export async function updateUserRole(
  userId: string,
  newRole: 'ADMIN' | 'PROFESSOR' | 'STUDENT',
  options?: { unenroll?: boolean }
) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  if (userId === adminUser.id && newRole !== 'ADMIN') {
    return { success: false, error: 'No puedes quitarte el rol de Administrador a ti mismo.' }
  }

  const supabase = await createClient()

  const { data: before, error: beforeError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (beforeError || !before || !isUserRole(before.role)) {
    return { success: false, error: 'No se pudo leer el rol actual del usuario.' }
  }
  const previousRole: UserRole = before.role

  const { data: updated, error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)
    .eq('role', previousRole)
    .select('id')

  if (error) return { success: false, error: 'Error al actualizar el rol.' }
  if (!updated || updated.length === 0) {
    return {
      success: false,
      error: 'El rol cambió mientras tanto. Recarga la página e inténtalo de nuevo.',
    }
  }

  const cleanup = resolveRoleChangeScope(previousRole, newRole).leavesStudent
    ? await clearStudentEnrollments(supabase, adminUser.id, userId)
    : null

  if (cleanup?.stage === 'enrollments_failed') {
    // Nothing else was touched: put the previous role back (only if it is still
    // the one we set) so the user is not left as a non-student with enrollments.
    const { data: reverted, error: revertError } = await supabase
      .from('profiles')
      .update({ role: previousRole })
      .eq('id', userId)
      .eq('role', newRole)
      .select('id')
    const revertFailed = Boolean(revertError) || !reverted || reverted.length === 0

    if (revertFailed) {
      console.error('[updateUserRole] could not revert role after failed cleanup', {
        userId,
        previousRole,
        newRole,
        revertError,
      })
    }
    await logAudit({
      actorId: adminUser.id,
      action: 'user.role_change_failed',
      entityType: 'profile',
      entityId: userId,
      details: {
        role_before: previousRole,
        role_after: newRole,
        reason: 'enrollments_delete_failed',
        outcome: revertFailed ? 'revert_failed' : 'reverted',
      },
    })
    revalidatePath('/admin/users')
    return {
      success: false,
      error: revertFailed
        ? 'El rol cambió pero no se pudieron quitar las inscripciones del estudiante, y tampoco se pudo restaurar el rol. Revisa al usuario ahora.'
        : 'No se pudieron quitar las inscripciones del estudiante. El rol no se cambió.',
    }
  }

  const removedSubjectIds = cleanup?.removedSubjectIds ?? []
  const requestsFailed = cleanup?.stage === 'requests_failed'

  await logAudit({
    actorId: adminUser.id,
    action: 'user.role_change',
    entityType: 'profile',
    entityId: userId,
    details: {
      role_before: previousRole,
      role_after: newRole,
      ...(cleanup
        ? {
            enrollments_removed: removedSubjectIds.length,
            enrollment_subject_ids: removedSubjectIds.slice(0, AUDIT_SUBJECT_IDS_CAP),
            pending_requests_cancelled: cleanup.stage === 'ok' ? cleanup.cancelledRequests : 0,
            ...(requestsFailed ? { pending_requests_cancel_failed: true } : {}),
            unenroll_confirmed: options?.unenroll === true,
          }
        : {}),
    },
  })

  revalidatePath('/admin/users')
  if (cleanup) revalidatePath('/admin/subjects')

  if (requestsFailed) {
    // Enrollments are already gone, so the new role stays: report it honestly.
    return {
      success: false,
      enrollmentsRemoved: removedSubjectIds.length,
      error:
        'Rol cambiado y desmatriculado, pero no se pudieron cancelar las solicitudes pendientes del usuario. Recházalas manualmente desde las materias.',
    }
  }
  return { success: true, enrollmentsRemoved: removedSubjectIds.length }
}

export async function createUserAccount(formData: FormData) {
  try {
    const adminUser = await verifyAdminAccess()
    if (!adminUser) return { success: false, error: 'Acceso denegado.' }

    const email = ((formData.get('email') as string) || '').trim()
    const password = ((formData.get('password') as string) || '').trim()
    const firstName = normalizeName((formData.get('first_name') as string) || '')
    const lastName = normalizeName((formData.get('last_name') as string) || '')
    const studentCode = ((formData.get('student_code') as string) || '').trim()
    const role = formData.get('role') as 'ADMIN' | 'PROFESSOR' | 'STUDENT'

    if (!email || !password || !firstName || !lastName || !studentCode)
      return { success: false, error: 'Faltan datos obligatorios.' }

    if (role !== 'ADMIN' && !email.endsWith('@urepublicana.edu.co')) {
      return {
        success: false,
        error: 'El correo de docentes y estudiantes debe ser @urepublicana.edu.co',
      }
    }

    const admin = getSupabaseAdmin()

    const { data: existingCode } = await admin
      .from('profiles')
      .select('id')
      .eq('student_code', studentCode)
      .maybeSingle()
    if (existingCode)
      return {
        success: false,
        error: 'Ese código/ID institucional ya está registrado por otro usuario.',
      }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, student_code: studentCode },
    })

    if (error) return { success: false, error: error.message }

    // Upsert y no update: para correos no institucionales (solo ADMIN)
    // el trigger handle_new_user no crea el perfil (025), asi que aca se
    // crea completo, con el rol y el correo juntos para cumplir
    // chk_email_domain en una sola escritura.
    const { error: profileUpdateError } = await admin.from('profiles').upsert(
      {
        id: data.user.id,
        role,
        first_name: firstName,
        last_name: lastName,
        student_code: studentCode,
        email,
      },
      { onConflict: 'id' }
    )

    if (profileUpdateError) {
      return {
        success: false,
        error: `Usuario creado pero el perfil no se pudo completar: ${profileUpdateError.message}`,
      }
    }

    await logAudit({
      actorId: adminUser.id,
      action: 'user.create',
      entityType: 'profile',
      entityId: data.user.id,
      details: { email, role, student_code: studentCode },
    })

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor.'
    return { success: false, error: message }
  }
}

export async function deleteUserAccount(userId: string) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  if (userId === adminUser.id)
    return { success: false, error: 'No puedes desactivarte a ti mismo.' }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', userId)

  if (error) return { success: false, error: error.message }

  await logAudit({
    actorId: adminUser.id,
    action: 'user.deactivate',
    entityType: 'profile',
    entityId: userId,
  })

  revalidatePath('/admin/users')
  revalidatePath('/admin/dashboard')
  return { success: true }
}

export async function reactivateUser(userId: string) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.' }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', userId)

  if (error) return { success: false, error: error.message }

  await logAudit({
    actorId: adminUser.id,
    action: 'user.reactivate',
    entityType: 'profile',
    entityId: userId,
  })

  revalidatePath('/admin/users')
  revalidatePath('/admin/dashboard')
  return { success: true }
}

export async function updateUserAccount(
  userId: string,
  data: { first_name?: string; last_name?: string; password?: string; student_code?: string }
) {
  try {
    const adminUser = await verifyAdminAccess()
    if (!adminUser) return { success: false, error: 'Acceso denegado.' }

    const admin = getSupabaseAdmin()

    if (data.student_code) {
      const { data: existingCode } = await admin
        .from('profiles')
        .select('id')
        .eq('student_code', data.student_code)
        .neq('id', userId)
        .maybeSingle()
      if (existingCode)
        return { success: false, error: 'Ese código/ID institucional ya pertenece a otro usuario.' }
    }

    if (data.password) {
      const { error: authError } = await admin.auth.admin.updateUserById(userId, {
        password: data.password,
      })
      if (authError) return { success: false, error: authError.message }
    }

    const updates: Record<string, string> = {}
    const metaUpdates: Record<string, string> = {}

    if (data.first_name) {
      const firstName = normalizeName(data.first_name)
      updates.first_name = firstName
      metaUpdates.first_name = firstName
    }

    if (data.last_name) {
      const lastName = normalizeName(data.last_name)
      updates.last_name = lastName
      metaUpdates.last_name = lastName
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

    // Nunca se registra la contraseña en texto plano ni su hash --
    // solo la marca de que hubo un cambio, para no convertir el
    // audit_log en un vector de fuga de credenciales.
    await logAudit({
      actorId: adminUser.id,
      action: 'user.update_account',
      entityType: 'profile',
      entityId: userId,
      details: {
        ...(data.first_name ? { first_name_changed: true } : {}),
        ...(data.last_name ? { last_name_changed: true } : {}),
        ...(data.student_code ? { student_code_changed: true } : {}),
        ...(data.password ? { password_changed: true } : {}),
      },
    })

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor.'
    return { success: false, error: message }
  }
}

export async function getStudentAttendanceHistory(studentId: string) {
  const adminUser = await verifyAdminAccess()
  if (!adminUser) return { success: false, error: 'Acceso denegado.', data: null }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('attendances')
    .select(
      `
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
    `
    )
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false })

  if (error) return { success: false, error: error.message, data: null }
  return { success: true, data, error: null }
}
