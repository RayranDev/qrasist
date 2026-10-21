/**
 * Regla única de "clase dictada" para resúmenes, alertas y estados de
 * asistencia (DEF-QA-05).
 *
 * Una sesión cuenta como dictada PARA UN ESTUDIANTE cuando:
 *  - su clase YA TERMINÓ (ahora > fin efectivo: class_ends_at, o
 *    date + duración por defecto en sesiones anteriores a la migración
 *    027), o
 *  - ese estudiante ya tiene asistencia registrada en ella.
 *
 * Así una clase en curso no cuenta como falta antes de que el estudiante
 * pueda escanear, y quien ya escaneó recibe el crédito de inmediato con
 * numerador y denominador consistentes (asistidas <= dictadas).
 *
 * Funciones puras: sin I/O. La hora actual se inyecta para poder probarlas
 * con fechas fijas. El filtro de sesiones archivadas/suspendidas
 * (is_active = false) sigue siendo responsabilidad de quien llama.
 */
import { isSessionAlreadyHeld } from '@/lib/justifications/eligibility'

export interface HeldSessionTimes {
  id: string
  date: string | Date
  class_ends_at?: string | Date | null
}

/** ¿Ya terminó la clase de esta sesión? */
export function hasClassEnded(
  session: Pick<HeldSessionTimes, 'date' | 'class_ends_at'>,
  defaultClassMinutes: number,
  now: Date = new Date()
): boolean {
  return isSessionAlreadyHeld(session, defaultClassMinutes, now)
}

/**
 * ¿Cuenta la sesión como dictada para un estudiante concreto?
 * `studentAttendedSessionIds`: ids de sesión en las que ese estudiante
 * tiene asistencia (PRESENT o LATE).
 */
export function isSessionHeldFor(
  session: HeldSessionTimes,
  studentAttendedSessionIds: ReadonlySet<string>,
  now: Date,
  defaultClassMinutes: number
): boolean {
  return (
    studentAttendedSessionIds.has(session.id) || hasClassEnded(session, defaultClassMinutes, now)
  )
}

/** Sesiones dictadas para un estudiante, de entre las que llegan. */
export function filterHeldSessionsFor<T extends HeldSessionTimes>(
  sessions: readonly T[],
  studentAttendedSessionIds: ReadonlySet<string>,
  now: Date,
  defaultClassMinutes: number
): T[] {
  return sessions.filter((s) =>
    isSessionHeldFor(s, studentAttendedSessionIds, now, defaultClassMinutes)
  )
}

export interface HeldCounterSession extends HeldSessionTimes {
  subject_id: string
}

export interface HeldCounterAttendance {
  student_id: string
  session_id: string
}

/**
 * Para vistas agregadas (profesor, coordinación) que cuentan por
 * estudiante y materia sin armar un Set por estudiante: devuelve una
 * función `(studentId, subjectId) => clases dictadas para ese estudiante`.
 *
 * dictadas = clases terminadas de la materia + asistencias del estudiante
 * en clases todavía en curso de esa materia.
 *
 * `sessions` debe traer solo sesiones activas (dictadas, no archivadas ni
 * suspendidas); las asistencias sobre sesiones desconocidas se ignoran.
 */
export function buildHeldCounter(
  sessions: readonly HeldCounterSession[],
  attendances: readonly HeldCounterAttendance[],
  now: Date,
  defaultClassMinutes: number
): (studentId: string, subjectId: string) => number {
  const endedBySubject = new Map<string, number>()
  const inProgressById = new Map<string, string>() // sessionId -> subjectId
  for (const s of sessions) {
    if (hasClassEnded(s, defaultClassMinutes, now)) {
      endedBySubject.set(s.subject_id, (endedBySubject.get(s.subject_id) || 0) + 1)
    } else {
      inProgressById.set(s.id, s.subject_id)
    }
  }

  const inProgressAttended = new Map<string, number>() // `${studentId}_${subjectId}`
  for (const a of attendances) {
    const subjectId = inProgressById.get(a.session_id)
    if (!subjectId) continue
    const key = `${a.student_id}_${subjectId}`
    inProgressAttended.set(key, (inProgressAttended.get(key) || 0) + 1)
  }

  return (studentId, subjectId) =>
    (endedBySubject.get(subjectId) || 0) +
    (inProgressAttended.get(`${studentId}_${subjectId}`) || 0)
}
