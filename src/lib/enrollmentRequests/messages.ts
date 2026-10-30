import { countOf } from '@/lib/utils/plural'
import { APPROVE_ALL_MAX } from './constants'

export interface ReviewFailure {
  id: string
  message: string
}

type ToastKind = 'success' | 'error' | 'info'

const NOTE =
  ' Las que no se puedan aprobar (por ejemplo, estudiantes sin carrera) se omiten y se te informará cuántas y por qué.'

const stripPeriod = (text: string) => text.replace(/\.+$/, '')

/** Motivos distintos con su cantidad: "razón A (2); razón B". */
export function summarizeFailures(failures: readonly ReviewFailure[], maxReasons = 2): string {
  const counts = new Map<string, number>()
  for (const f of failures) {
    const reason = stripPeriod(f.message)
    counts.set(reason, (counts.get(reason) || 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const shown = sorted
    .slice(0, maxReasons)
    .map(([reason, n]) => (sorted.length > 1 || n > 1 ? `${reason} (${n})` : reason))
  const rest = sorted.slice(maxReasons).reduce((sum, [, n]) => sum + n, 0)
  if (rest > 0) shown.push(`otros motivos (${rest})`)
  return shown.join('; ')
}

/**
 * Un solo mensaje para el resultado de una operación masiva: cuántas
 * salieron bien y, si hubo fallas, cuántas y por qué.
 */
export function describeBulkResult(input: {
  action: 'approve' | 'reject'
  done: number
  failures: readonly ReviewFailure[]
  remaining?: number
  /** "Aprobar todas": las fallidas se omiten y siguen pendientes, no es un error por fila. */
  omitted?: boolean
}): { message: string; type: ToastKind } {
  const { action, done, failures, remaining = 0, omitted = false } = input
  const approve = action === 'approve'
  const parts: string[] = []

  if (done > 0) {
    parts.push(
      approve
        ? `${countOf(done, 'solicitud aprobada', 'solicitudes aprobadas')}.`
        : `${countOf(done, 'solicitud rechazada', 'solicitudes rechazadas')}.`
    )
  }
  if (failures.length > 0 && omitted) {
    parts.push(
      `${countOf(failures.length, 'solicitud omitida', 'solicitudes omitidas')} (siguen pendientes): ${summarizeFailures(failures)}.`
    )
  } else if (failures.length > 0) {
    const verb = approve ? 'aprobar' : 'rechazar'
    const pudo = failures.length === 1 ? 'pudo' : 'pudieron'
    parts.push(
      `${countOf(failures.length, 'solicitud', 'solicitudes')} no se ${pudo} ${verb}: ${summarizeFailures(failures)}.`
    )
  }
  if (remaining > 0) {
    parts.push(
      `${remaining === 1 ? 'Queda' : 'Quedan'} ${countOf(remaining, 'solicitud pendiente', 'solicitudes pendientes')}: repite la acción para continuar.`
    )
  }
  if (parts.length === 0) parts.push('No había solicitudes pendientes para procesar.')

  const type: ToastKind = failures.length === 0 ? 'success' : done === 0 ? 'error' : 'info'
  return { message: parts.join(' '), type }
}

/** Texto del botón y del diálogo de confirmación de "Aprobar todas". */
export function describeApproveAll(
  total: number,
  truncated: boolean
): { buttonLabel: string; title: string; message: string } {
  const exact = truncated ? `más de ${total}` : String(total)
  const noun = truncated || total !== 1 ? 'solicitudes pendientes' : 'solicitud pendiente'
  const buttonLabel = `Aprobar todas (${truncated ? `${total}+` : total})`
  const title = '¿Aprobar todas las solicitudes?'

  if (total === 1 && !truncated) {
    return {
      buttonLabel,
      title: '¿Aprobar la solicitud?',
      message: `Se aprobará la única solicitud pendiente que coincide con los filtros actuales. El estudiante quedará inscrito en la materia.${NOTE}`,
    }
  }
  if (total <= APPROVE_ALL_MAX && !truncated) {
    return {
      buttonLabel,
      title,
      message: `Se aprobarán las ${exact} ${noun} que coinciden con los filtros actuales, incluidas las de otras páginas. Los estudiantes quedarán inscritos en cada materia.${NOTE}`,
    }
  }
  return {
    buttonLabel,
    title,
    message: `Hay ${exact} ${noun} con los filtros actuales. En esta operación se aprobarán hasta ${APPROVE_ALL_MAX}, de las más antiguas; después podrás repetir la acción para el resto. Los estudiantes quedarán inscritos en cada materia.${NOTE}`,
  }
}
