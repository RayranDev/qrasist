/**
 * Validación pura para "Registrar clase pasada" (contingencia de lista
 * en papel, process 3 del documento de requisitos): el coordinador
 * crea a mano el registro de una clase que ya ocurrió.
 */

export type PastSessionModality = 'PRESENCIAL' | 'VIRTUAL'

export const MAX_PAST_SESSION_NOTE_LENGTH = 500

/** Una fecha anterior a esto es casi seguro un error de tipeo del año. */
const EARLIEST_ALLOWED = new Date('2020-01-01T00:00:00Z')

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/**
 * El formulario manda un <input type="datetime-local"> ("2026-03-02T08:00")
 * que representa hora de Colombia (UTC-5 fijo). También acepta un ISO
 * completo con zona.
 */
export function parseBogotaLocalDateTime(value: string): Date | null {
  const trimmed = (value || '').trim()
  const local = LOCAL_DATETIME.exec(trimmed)
  const date = local ? new Date(`${trimmed}:00-05:00`) : new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  if (local) {
    // new Date() normaliza silenciosamente fechas imposibles (31 de febrero):
    // se comprueba que el mes/día no hayan cambiado.
    const check = new Date(date.getTime() - 5 * 60 * 60 * 1000)
    if (
      check.getUTCFullYear() !== Number(local[1]) ||
      check.getUTCMonth() + 1 !== Number(local[2]) ||
      check.getUTCDate() !== Number(local[3])
    ) {
      return null
    }
  }
  return date
}

export type PastSessionInput = {
  subjectId: string
  startsAt: string
  modality: string
  note?: string | null
}

export function validatePastSessionInput(
  input: PastSessionInput,
  now: Date = new Date()
):
  | { ok: true; startsAt: Date; modality: PastSessionModality; note: string | null }
  | { ok: false; error: string } {
  if (!input.subjectId) return { ok: false, error: 'Selecciona una materia.' }

  if (input.modality !== 'PRESENCIAL' && input.modality !== 'VIRTUAL') {
    return { ok: false, error: 'Selecciona la modalidad de la clase.' }
  }

  const startsAt = parseBogotaLocalDateTime(input.startsAt)
  if (!startsAt) return { ok: false, error: 'La fecha y hora de la clase no son válidas.' }
  if (startsAt.getTime() >= now.getTime()) {
    return {
      ok: false,
      error: 'La clase debe haber ocurrido ya. Para una clase en curso usa el flujo del profesor.',
    }
  }
  if (startsAt.getTime() < EARLIEST_ALLOWED.getTime()) {
    return { ok: false, error: 'La fecha de la clase es demasiado antigua. Revisa el año.' }
  }

  const note = (input.note || '').trim()
  if (note.length > MAX_PAST_SESSION_NOTE_LENGTH) {
    return {
      ok: false,
      error: `La nota no puede superar los ${MAX_PAST_SESSION_NOTE_LENGTH} caracteres.`,
    }
  }

  return { ok: true, startsAt, modality: input.modality, note: note || null }
}
