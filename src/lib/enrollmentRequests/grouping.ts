import type { RequestsView } from './constants'

export interface PendingRequest {
  id: string
  requestedAt: string
  studentId: string
  studentName: string
  studentCode: string | null
  subjectId: string
  subjectName: string
  subjectCode: string
}

export interface RequestGroup {
  key: string
  title: string
  code: string | null
  requests: PendingRequest[]
  /** Solicitudes del grupo completo (puede ser más que `requests` si se partió en páginas). */
  totalCount: number
  /** Es la 2.ª parte o posterior de un grupo partido entre páginas. */
  continued: boolean
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

function compareRequests(a: PendingRequest, b: PendingRequest, view: RequestsView) {
  // Dentro de un grupo, lo más antiguo primero (es lo que lleva más
  // tiempo esperando); el nombre solo desempata.
  const byDate = a.requestedAt.localeCompare(b.requestedAt)
  if (byDate !== 0) return byDate
  const byName =
    view === 'subject'
      ? collator.compare(a.studentName, b.studentName)
      : collator.compare(a.subjectName, b.subjectName)
  return byName !== 0 ? byName : a.id.localeCompare(b.id)
}

/**
 * Agrupa las solicitudes por materia ("subject") o por estudiante
 * ("student"). Los grupos salen ordenados por título y las solicitudes de
 * cada grupo de la más antigua a la más reciente.
 */
export function groupRequests(requests: PendingRequest[], view: RequestsView): RequestGroup[] {
  const groups = new Map<string, RequestGroup>()
  for (const request of requests) {
    const key = view === 'subject' ? request.subjectId : request.studentId
    let group = groups.get(key)
    if (!group) {
      group =
        view === 'subject'
          ? {
              key,
              title: request.subjectName,
              code: request.subjectCode,
              requests: [],
              totalCount: 0,
              continued: false,
            }
          : {
              key,
              title: request.studentName,
              code: request.studentCode,
              requests: [],
              totalCount: 0,
              continued: false,
            }
      groups.set(key, group)
    }
    group.requests.push(request)
  }

  const result = [...groups.values()]
  for (const group of result) {
    group.requests.sort((a, b) => compareRequests(a, b, view))
    group.totalCount = group.requests.length
  }
  return result.sort((a, b) => {
    const byTitle = collator.compare(a.title, b.title)
    return byTitle !== 0 ? byTitle : a.key.localeCompare(b.key)
  })
}

/**
 * Parte un grupo de más de `maxRows` solicitudes en trozos de `maxRows`.
 * Los trozos siguientes al primero van marcados como `continued` y todos
 * conservan `totalCount`, así el encabezado muestra el total real.
 * (Se eligió partir y no recortar con "ver más": así ninguna solicitud queda
 * fuera de la lista ni de la selección por página, y el DOM sigue acotado.)
 */
function splitGroup(group: RequestGroup, maxRows: number): RequestGroup[] {
  if (group.requests.length <= maxRows) return [group]
  const parts: RequestGroup[] = []
  for (let i = 0; i < group.requests.length; i += maxRows) {
    parts.push({
      ...group,
      key: i === 0 ? group.key : `${group.key}#${i / maxRows}`,
      requests: group.requests.slice(i, i + maxRows),
      continued: i > 0,
    })
  }
  return parts
}

/**
 * Reparte los grupos en páginas. Una página se llena hasta `maxGroups`
 * grupos o `maxRows` filas. Un grupo que cabe en una página no se parte
 * (su conteo es el real); uno más grande que `maxRows` se parte en trozos
 * de `maxRows` filas, cada uno con su encabezado de continuación.
 */
export function paginateGroups(
  groups: RequestGroup[],
  { maxGroups, maxRows }: { maxGroups: number; maxRows: number }
): RequestGroup[][] {
  const pages: RequestGroup[][] = []
  let current: RequestGroup[] = []
  let currentRows = 0

  for (const group of groups.flatMap((g) => splitGroup(g, maxRows))) {
    const size = group.requests.length
    const overflows =
      current.length > 0 && (current.length >= maxGroups || currentRows + size > maxRows)
    if (overflows) {
      pages.push(current)
      current = []
      currentRows = 0
    }
    current.push(group)
    currentRows += size
  }
  if (current.length > 0) pages.push(current)
  return pages
}
