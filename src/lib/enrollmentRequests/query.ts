import type { SupabaseClient } from '@supabase/supabase-js'
import { FETCH_PAGE_SIZE, SCAN_MAX } from './constants'
import type { RequestFilters } from './filters'
import type { PendingRequest } from './grouping'

/** Acota de antemano qué solicitudes puede ver quien consulta. */
export interface RequestScope {
  /** Solo solicitudes de materias de este profesor. */
  professorId?: string
}

export interface FetchRequestsResult {
  /** Más antiguas primero, como máximo `maxRows`. */
  requests: PendingRequest[]
  /** Total que coincide con los filtros (cota inferior si `truncated`). */
  total: number
  /** Había más solicitudes que `maxRows`: `total` y `requests` quedaron cortos. */
  truncated: boolean
  error: boolean
}

interface RawRequest {
  id: string
  requested_at: string
  student_id: string
  subject_id: string
  student: { name: string | null; student_code: string | null } | null
  subject: { name: string | null; code: string | null } | null
}

type Branch = 'all' | 'student' | 'subject'

// enrollment_requests tiene dos FK hacia profiles (student_id y
// reviewed_by): hay que pinear cuál usar en el embed o PostgREST falla
// con PGRST201 (ambigüedad). `!inner` en ambos embeds hace que los
// filtros sobre sus columnas también descarten la solicitud padre.
function selectFor(withCareer: boolean) {
  const subject = withCareer
    ? 'subject:subjects!inner(name, code, subject_careers!inner(career_id))'
    : 'subject:subjects!inner(name, code)'
  return `id, requested_at, student_id, subject_id, student:profiles!enrollment_requests_student_id_fkey!inner(name, student_code), ${subject}`
}

function toPendingRequest(raw: RawRequest): PendingRequest {
  return {
    id: raw.id,
    requestedAt: raw.requested_at,
    studentId: raw.student_id,
    studentName: raw.student?.name || 'Estudiante',
    studentCode: raw.student?.student_code ?? null,
    subjectId: raw.subject_id,
    subjectName: raw.subject?.name || 'Materia',
    subjectCode: raw.subject?.code || '---',
  }
}

const byAge = (a: PendingRequest, b: PendingRequest) =>
  a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id)

async function fetchBranch(
  supabase: SupabaseClient,
  scope: RequestScope,
  filters: RequestFilters,
  branch: Branch,
  maxRows: number
): Promise<{ rows: PendingRequest[]; total: number; truncated: boolean } | null> {
  // Por id: si una solicitud cambia de estado mientras se pagina (otro
  // revisor aprobando), las filas se desplazan y una podría repetirse.
  const byId = new Map<string, PendingRequest>()
  let total = 0

  // El avance es por filas recibidas, no por FETCH_PAGE_SIZE: si el
  // PostgREST de producción tiene un max_rows menor a 1000, cada página
  // viene más corta y avanzar de a 1000 saltaría filas en silencio.
  for (let from = 0; ;) {
    let query = supabase
      .from('enrollment_requests')
      // El conteo exacto solo se pide en la primera página: es el total
      // de toda la consulta, no hace falta repetirlo en las demás.
      .select(selectFor(!!filters.career), from === 0 ? { count: 'exact' } : undefined)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
      .order('id', { ascending: true })

    if (filters.subjectId) query = query.eq('subject_id', filters.subjectId)
    if (scope.professorId) query = query.eq('subject.professor_id', scope.professorId)
    if (filters.career) {
      query = query
        .eq('subject.subject_careers.career_id', filters.career)
        .eq('subject.subject_careers.is_active', true)
    }
    // PostgREST no admite un OR entre columnas de dos embeds distintos: la
    // búsqueda por estudiante y por materia son dos consultas que luego se
    // unen (ver fetchPendingRequests).
    if (branch === 'student' && filters.q) {
      query = query.or(`name.ilike.%${filters.q}%,student_code.ilike.%${filters.q}%`, {
        referencedTable: 'student',
      })
    }
    if (branch === 'subject' && filters.q) {
      query = query.or(`name.ilike.%${filters.q}%,code.ilike.%${filters.q}%`, {
        referencedTable: 'subject',
      })
    }

    const { data, count, error } = await query.range(from, from + FETCH_PAGE_SIZE - 1)
    if (error) {
      console.error('Error cargando solicitudes de inscripción:', error)
      return null
    }

    const page = (data || []) as unknown as RawRequest[]
    if (from === 0) total = count ?? page.length
    for (const raw of page) byId.set(raw.id, toPendingRequest(raw))

    from += page.length
    if (page.length === 0 || from >= total || byId.size >= maxRows) break
  }

  return { rows: [...byId.values()].slice(0, maxRows), total, truncated: total > maxRows }
}

/**
 * Solicitudes pendientes que coinciden con los filtros, de la más antigua
 * a la más reciente. Pagina contra PostgREST (que corta en 1000 filas por
 * respuesta) hasta `maxRows`; si hay más lo marca en `truncated` en vez de
 * devolver una lista incompleta en silencio.
 *
 * Una búsqueda de texto coincide con el estudiante (nombre o código) O con
 * la materia (nombre o código): se hacen las dos consultas y se unen por id.
 * Como ambas vienen ordenadas igual, las `maxRows` más antiguas de la unión
 * están siempre dentro de las `maxRows` más antiguas de cada una.
 */
export async function fetchPendingRequests(
  supabase: SupabaseClient,
  input: { scope: RequestScope; filters: RequestFilters; maxRows?: number }
): Promise<FetchRequestsResult> {
  const { scope, maxRows = SCAN_MAX } = input
  // El filtro por carrera es solo de coordinación: un profesor no lo tiene en
  // la interfaz, así que una URL o un request con `career` se ignora.
  const filters = scope.professorId ? { ...input.filters, career: undefined } : input.filters
  const branches: Branch[] = filters.q ? ['student', 'subject'] : ['all']

  const results = await Promise.all(
    branches.map((branch) => fetchBranch(supabase, scope, filters, branch, maxRows))
  )
  if (results.some((r) => r === null)) {
    return { requests: [], total: 0, truncated: false, error: true }
  }

  const merged = new Map<string, PendingRequest>()
  for (const result of results) {
    for (const row of result!.rows) merged.set(row.id, row)
  }
  const sorted = [...merged.values()].sort(byAge)

  if (results.length === 1) {
    const only = results[0]!
    return { requests: only.rows, total: only.total, truncated: only.truncated, error: false }
  }

  const anyTruncated = results.some((r) => r!.truncated)
  return {
    requests: sorted.slice(0, maxRows),
    total: sorted.length,
    truncated: anyTruncated || sorted.length > maxRows,
    error: false,
  }
}
