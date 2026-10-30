'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkStudentEnrollable } from './enrollmentGuards'
import { checkAdmin } from './authGuards'
import { approveRequests, dedupeIds, rejectRequests } from '@/lib/enrollmentRequests/review'
import { fetchPendingRequests } from '@/lib/enrollmentRequests/query'
import { sanitizeRequestFilters } from '@/lib/enrollmentRequests/filters'
import type { ReviewFailure } from '@/lib/enrollmentRequests/messages'
import { APPROVE_ALL_MAX, BULK_REVIEW_MAX } from '@/lib/enrollmentRequests/constants'

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para que el
// estudiante lo pueda transcribir sin confundirse.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCode(length = 7) {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

export async function generateEnrollmentCode(subjectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado.' }

  const { data: subject } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .eq('professor_id', user.id)
    .single()

  if (!subject) return { success: false, error: 'Materia no encontrada o acceso denegado.' }

  // Reintenta si el codigo generado ya existe (colision improbable
  // con 7 caracteres de un alfabeto de 32, pero el UNIQUE lo exige).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const { error } = await supabase
      .from('subjects')
      .update({ enrollment_code: code })
      .eq('id', subjectId)

    if (!error) {
      revalidatePath('/professor/subjects')
      return { success: true, code }
    }
    if (error.code !== '23505') {
      return { success: false, error: 'No se pudo generar el código.' }
    }
  }

  return { success: false, error: 'No se pudo generar un código único. Intenta de nuevo.' }
}

// Compartida entre el flujo por código y el flujo de "elegí tu
// materia": ambos terminan pidiendo lo mismo, solo cambia cómo se
// llega a la materia (código vs. selección directa en la lista de
// su carrera).
async function createEnrollmentRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  subject: { id: string; name: string; code: string; is_active?: boolean }
) {
  if (subject.is_active === false) {
    return {
      success: false as const,
      error: 'Esta materia está archivada y no acepta solicitudes.',
    }
  }

  const { data: existingEnrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', subject.id)
    .eq('student_id', userId)
    .maybeSingle()

  if (existingEnrollment) {
    return { success: false as const, error: `Ya estás inscrito en ${subject.name}.` }
  }

  const { data: existingRequest } = await supabase
    .from('enrollment_requests')
    .select('id, status')
    .eq('subject_id', subject.id)
    .eq('student_id', userId)
    .maybeSingle()

  if (existingRequest?.status === 'pending') {
    return {
      success: false as const,
      error: `Ya tienes una solicitud pendiente para ${subject.name}.`,
    }
  }

  const check = await checkStudentEnrollable(supabase, subject.id, userId)
  if (!check.ok) return { success: false as const, error: check.error }

  const { error } = await supabase.from('enrollment_requests').upsert(
    {
      student_id: userId,
      subject_id: subject.id,
      status: 'pending',
      requested_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
    },
    { onConflict: 'student_id,subject_id' }
  )

  if (error) return { success: false as const, error: 'No se pudo enviar la solicitud.' }

  revalidatePath('/student/scanner')
  revalidatePath('/student/subjects')
  return { success: true as const, subjectName: subject.name, subjectCode: subject.code }
}

export async function requestEnrollment(rawCode: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No estás autenticado.' }

  const code = rawCode.trim().toUpperCase()
  if (!code) return { success: false as const, error: 'Ingresa un código.' }

  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id, name, code, is_active')
    .eq('enrollment_code', code)
    .single()

  if (subjectError || !subject) {
    return { success: false as const, error: 'Código inválido. Verifica con tu docente.' }
  }

  return createEnrollmentRequest(supabase, user.id, subject)
}

export async function requestEnrollmentBySubjectId(subjectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No estás autenticado.' }

  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id, name, code, is_active')
    .eq('id', subjectId)
    .single()

  if (subjectError || !subject) {
    return { success: false as const, error: 'Materia no encontrada.' }
  }

  return createEnrollmentRequest(supabase, user.id, subject)
}

// Las acciones individuales son el caso de un solo id de las masivas: así
// hay un único camino de aprobación/rechazo (permiso, carrera, reclamo
// atómico, inscripción con reversa, auditoría).
async function getReviewer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function revalidateRequestPages() {
  revalidatePath('/professor/subjects')
  revalidatePath('/professor/requests')
  revalidatePath('/admin/enrollment-requests')
  revalidatePath('/admin/dashboard')
}

export async function approveEnrollmentRequest(requestId: string) {
  const { supabase, user } = await getReviewer()
  if (!user) return { success: false, error: 'No autenticado.' }

  const result = await approveRequests(supabase, user.id, [requestId])
  if (result.approved.length === 0) {
    return {
      success: false,
      error: result.failures[0]?.message || 'No se pudo aprobar la solicitud.',
    }
  }

  revalidateRequestPages()
  return { success: true }
}

export async function rejectEnrollmentRequest(requestId: string) {
  const { supabase, user } = await getReviewer()
  if (!user) return { success: false, error: 'No autenticado.' }

  const result = await rejectRequests(supabase, user.id, [requestId])
  if (result.rejected.length === 0) {
    return {
      success: false,
      error: result.failures[0]?.message || 'No se pudo rechazar la solicitud.',
    }
  }

  revalidateRequestPages()
  return { success: true }
}

export interface BulkApproveResponse {
  success: boolean
  error?: string
  approved: string[]
  failures: ReviewFailure[]
}

export interface BulkRejectResponse {
  success: boolean
  error?: string
  rejected: string[]
  failures: ReviewFailure[]
}

export interface ApproveAllResponse extends BulkApproveResponse {
  /** Solicitudes que coincidían con los filtros al empezar. */
  total: number
  /** Solicitudes que ni se intentaron por el tope de la operación (siguen pendientes). */
  remaining: number
  /** Solicitudes revisadas que no se pudieron aprobar (p. ej. estudiante sin carrera); siguen pendientes. */
  skipped: number
  /** Había más de SCAN_MAX coincidencias: `total` y `remaining` son cotas inferiores. */
  truncated: boolean
}

// Valida la lista de ids de una operación masiva: no vacía, solo strings y
// dentro del tope. Los duplicados se descartan.
function parseBulkIds(ids: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(ids)) return { ok: false, error: 'Selecciona al menos una solicitud.' }
  const unique = dedupeIds(ids.filter((id): id is string => typeof id === 'string'))
  if (unique.length === 0) return { ok: false, error: 'Selecciona al menos una solicitud.' }
  if (unique.length > BULK_REVIEW_MAX) {
    return {
      ok: false,
      error: `Puedes procesar hasta ${BULK_REVIEW_MAX} solicitudes por operación.`,
    }
  }
  return { ok: true, ids: unique }
}

/**
 * Aprueba hasta BULK_REVIEW_MAX solicitudes. Devuelve el resultado por id:
 * las aprobadas y, de las demás, el motivo.
 */
export async function approveEnrollmentRequests(ids: string[]): Promise<BulkApproveResponse> {
  const { supabase, user } = await getReviewer()
  if (!user) return { success: false, error: 'No autenticado.', approved: [], failures: [] }

  const parsed = parseBulkIds(ids)
  if (!parsed.ok) return { success: false, error: parsed.error, approved: [], failures: [] }

  const result = await approveRequests(supabase, user.id, parsed.ids)
  if (result.approved.length > 0) revalidateRequestPages()
  return { success: true, ...result }
}

/** Rechaza hasta BULK_REVIEW_MAX solicitudes (sin motivo, igual que el rechazo individual). */
export async function rejectEnrollmentRequests(ids: string[]): Promise<BulkRejectResponse> {
  const { supabase, user } = await getReviewer()
  if (!user) return { success: false, error: 'No autenticado.', rejected: [], failures: [] }

  const parsed = parseBulkIds(ids)
  if (!parsed.ok) return { success: false, error: parsed.error, rejected: [], failures: [] }

  const result = await rejectRequests(supabase, user.id, parsed.ids)
  if (result.rejected.length > 0) revalidateRequestPages()
  return { success: true, ...result }
}

/**
 * Aprueba todas las solicitudes pendientes que coinciden con los filtros
 * (no solo las de la página visible). Resuelve las ids en el servidor con
 * los mismos filtros de la lista -- el cliente nunca manda ids -- y las
 * procesa en lotes de BULK_REVIEW_MAX, las más antiguas primero, hasta
 * APPROVE_ALL_MAX por operación. Si hay más, devuelve cuántas quedan.
 */
export async function approveAllEnrollmentRequests(
  rawFilters: { q?: string; career?: string; subjectId?: string } = {}
): Promise<ApproveAllResponse> {
  const empty = {
    approved: [],
    failures: [],
    total: 0,
    remaining: 0,
    skipped: 0,
    truncated: false,
  }
  const { supabase, user } = await getReviewer()
  if (!user) return { success: false, error: 'No autenticado.', ...empty }

  const isAdmin = await checkAdmin(supabase, user.id)
  // El filtro por carrera es solo de coordinación (ver fetchPendingRequests).
  const filters = sanitizeRequestFilters(rawFilters ?? {})
  // Un profesor solo "ve" sus materias; aunque no lo hiciera, el permiso
  // se vuelve a comprobar por solicitud dentro de approveRequests.
  const scope = isAdmin ? {} : { professorId: user.id }

  const found = await fetchPendingRequests(supabase, { scope, filters })
  if (found.error) {
    return { success: false, error: 'No se pudieron cargar las solicitudes.', ...empty }
  }

  // Se recorre de la más antigua a la más reciente hasta lograr
  // APPROVE_ALL_MAX aprobaciones o agotar las candidatas. Las que fallan (p.
  // ej. estudiante sin carrera) siguen pendientes y encabezarían la cola en
  // cada repetición: si solo se tomaran las 500 más antiguas, esas fallas
  // permanentes impedirían llegar jamás a las más nuevas. Por eso las
  // fallidas no cuentan contra el tope.
  const candidates = found.requests.map((r) => r.id)
  const approved: string[] = []
  const failures: ReviewFailure[] = []
  let examined = 0
  while (examined < candidates.length && approved.length < APPROVE_ALL_MAX) {
    const size = Math.min(BULK_REVIEW_MAX, APPROVE_ALL_MAX - approved.length)
    const batch = candidates.slice(examined, examined + size)
    examined += batch.length
    const result = await approveRequests(supabase, user.id, batch)
    approved.push(...result.approved)
    failures.push(...result.failures)
  }
  if (approved.length > 0) revalidateRequestPages()

  return {
    success: true,
    approved,
    failures,
    total: found.total,
    remaining: Math.max(0, found.total - examined),
    skipped: failures.length,
    truncated: found.truncated,
  }
}
