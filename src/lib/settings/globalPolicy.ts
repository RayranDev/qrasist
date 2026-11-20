/**
 * Política de asistencia GLOBAL (columnas de política de app_settings,
 * migración 037). Las materias la heredan por trigger salvo que tengan
 * `policy_override = true`. Vive fuera de un archivo 'use server' a propósito:
 * exporta constantes y helpers síncronos, y `getGlobalPolicy` recibe un
 * cliente de Supabase, que no se puede serializar como argumento de una
 * server action.
 *
 * `total_planned_sessions` NO forma parte de la política global: depende del
 * horario de cada materia.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_LATE_AFTER_MINUTES } from '@/lib/attendance/lateTracking'

export type AbsenceRuleType = 'PERCENTAGE' | 'FIXED_COUNT'

export interface GlobalPolicy {
  /** null = sin seguimiento de tardanzas. */
  lateAfterMinutes: number | null
  /** null = las tardanzas nunca se convierten en falta. */
  latesPerAbsence: number | null
  absenceRuleType: AbsenceRuleType
  maxAbsencePercentage: number
  /** Solo se usa con absenceRuleType = FIXED_COUNT. */
  maxAbsenceCount: number | null
}

export const LATE_AFTER_RANGE = { min: 1, max: 180 } as const
export const LATES_PER_ABSENCE_RANGE = { min: 1, max: 10 } as const
export const MAX_ABSENCE_PERCENTAGE_RANGE = { min: 1, max: 100 } as const
export const MAX_ABSENCE_COUNT_RANGE = { min: 1, max: 50 } as const

/** Mismo mínimo que el resto de motivos auditados (ReasonModal, attendanceManual). */
export const MIN_CHANGE_REASON_LENGTH = 5
export const MAX_CHANGE_REASON_LENGTH = 500

/** Respaldo cuando app_settings no tiene fila o todavía no existen las columnas (037). */
export const DEFAULT_GLOBAL_POLICY: GlobalPolicy = {
  lateAfterMinutes: DEFAULT_LATE_AFTER_MINUTES,
  latesPerAbsence: null,
  absenceRuleType: 'PERCENTAGE',
  maxAbsencePercentage: 20,
  maxAbsenceCount: null,
}

function isIntegerInRange(value: unknown, range: { min: number; max: number }): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max
  )
}

/** '', null y undefined significan "sin valor"; lo demás se convierte a número. */
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return Number(value)
}

/**
 * Valida la política que llega del formulario (cualquier cosa que llegue del
 * cliente es no confiable). Devuelve los valores normalizados o el primer
 * mensaje de error.
 */
export function parseGlobalPolicyInput(
  raw: unknown
): { ok: true; policy: GlobalPolicy } | { ok: false; error: string } {
  const input = (raw ?? {}) as Record<string, unknown>

  const lateAfterMinutes = optionalNumber(input.lateAfterMinutes)
  if (lateAfterMinutes !== null && !isIntegerInRange(lateAfterMinutes, LATE_AFTER_RANGE)) {
    return {
      ok: false,
      error: `La tolerancia de tardanza debe ser un número entero entre ${LATE_AFTER_RANGE.min} y ${LATE_AFTER_RANGE.max} minutos, o dejarse sin seguimiento.`,
    }
  }

  const latesPerAbsence = optionalNumber(input.latesPerAbsence)
  if (latesPerAbsence !== null && !isIntegerInRange(latesPerAbsence, LATES_PER_ABSENCE_RANGE)) {
    return {
      ok: false,
      error: `Las tardanzas por falta deben ser un número entero entre ${LATES_PER_ABSENCE_RANGE.min} y ${LATES_PER_ABSENCE_RANGE.max}, o dejarse vacías.`,
    }
  }

  const absenceRuleType = input.absenceRuleType
  if (absenceRuleType !== 'PERCENTAGE' && absenceRuleType !== 'FIXED_COUNT') {
    return { ok: false, error: 'La regla de faltas debe ser por porcentaje o por cantidad fija.' }
  }

  const maxAbsencePercentage = Number(input.maxAbsencePercentage)
  if (!isIntegerInRange(maxAbsencePercentage, MAX_ABSENCE_PERCENTAGE_RANGE)) {
    return {
      ok: false,
      error: `El porcentaje máximo de faltas debe ser un número entero entre ${MAX_ABSENCE_PERCENTAGE_RANGE.min} y ${MAX_ABSENCE_PERCENTAGE_RANGE.max}.`,
    }
  }

  const maxAbsenceCount = optionalNumber(input.maxAbsenceCount)
  if (
    (absenceRuleType === 'FIXED_COUNT' || maxAbsenceCount !== null) &&
    !isIntegerInRange(maxAbsenceCount, MAX_ABSENCE_COUNT_RANGE)
  ) {
    return {
      ok: false,
      error: `La cantidad máxima de faltas debe ser un número entero entre ${MAX_ABSENCE_COUNT_RANGE.min} y ${MAX_ABSENCE_COUNT_RANGE.max}.`,
    }
  }

  return {
    ok: true,
    policy: {
      lateAfterMinutes,
      latesPerAbsence,
      absenceRuleType,
      maxAbsencePercentage,
      maxAbsenceCount,
    },
  }
}

/** El motivo (acuerdo de reunión) es obligatorio en todo cambio de política. */
export function parseChangeReason(
  raw: unknown
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = typeof raw === 'string' ? raw.trim() : ''
  if (reason.length < MIN_CHANGE_REASON_LENGTH) {
    return {
      ok: false,
      error: `El motivo del cambio es obligatorio (mínimo ${MIN_CHANGE_REASON_LENGTH} caracteres).`,
    }
  }
  if (reason.length > MAX_CHANGE_REASON_LENGTH) {
    return {
      ok: false,
      error: `El motivo del cambio no puede superar ${MAX_CHANGE_REASON_LENGTH} caracteres.`,
    }
  }
  return { ok: true, reason }
}

/**
 * Lee la política global vigente. Si la fila no existe o la lectura falla (ej.
 * la migración 037 todavía no se aplicó), devuelve los valores por defecto.
 */
export async function getGlobalPolicy(supabase: SupabaseClient): Promise<GlobalPolicy> {
  const { data } = await supabase
    .from('app_settings')
    .select(
      'late_after_minutes, lates_per_absence, absence_rule_type, max_absence_percentage, max_absence_count'
    )
    .eq('id', 1)
    .maybeSingle()

  if (!data) return DEFAULT_GLOBAL_POLICY

  return {
    lateAfterMinutes: data.late_after_minutes ?? null,
    latesPerAbsence: data.lates_per_absence ?? null,
    absenceRuleType: data.absence_rule_type === 'FIXED_COUNT' ? 'FIXED_COUNT' : 'PERCENTAGE',
    maxAbsencePercentage:
      Number(data.max_absence_percentage) || DEFAULT_GLOBAL_POLICY.maxAbsencePercentage,
    maxAbsenceCount: data.max_absence_count ?? null,
  }
}

// ------------------------------------------------------------
// Cambios (auditoría): { campo_de_la_base: { before, after } }
// ------------------------------------------------------------

export interface FieldChange {
  before: unknown
  after: unknown
}

export type FieldChanges = Record<string, FieldChange>

/** Solo los campos cuyo valor cambió (null y undefined se tratan como iguales). */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): FieldChanges {
  const changes: FieldChanges = {}
  for (const key of Object.keys(after)) {
    const b = before[key] ?? null
    const a = after[key] ?? null
    if (b !== a) changes[key] = { before: b, after: a }
  }
  return changes
}

/** Nombres de columna con que la base guarda cada campo de la política global. */
export function policyToColumns(policy: GlobalPolicy): Record<string, unknown> {
  return {
    late_after_minutes: policy.lateAfterMinutes,
    lates_per_absence: policy.latesPerAbsence,
    absence_rule_type: policy.absenceRuleType,
    max_absence_percentage: policy.maxAbsencePercentage,
    max_absence_count: policy.maxAbsenceCount,
  }
}

const FIELD_LABELS: Record<string, string> = {
  registration_window_minutes: 'ventana de registro',
  default_class_minutes: 'duración de clase',
  late_after_minutes: 'tolerancia de tardanza',
  lates_per_absence: 'tardanzas por falta',
  absence_rule_type: 'regla de faltas',
  max_absence_percentage: 'porcentaje máximo de faltas',
  max_absence_count: 'cantidad máxima de faltas',
  policy_override: 'política de la materia',
}

function formatValue(field: string, value: unknown): string {
  switch (field) {
    case 'late_after_minutes':
      return value == null ? 'sin seguimiento' : `${value} min`
    case 'registration_window_minutes':
    case 'default_class_minutes':
      return `${value ?? '?'} min`
    case 'lates_per_absence':
      return value == null ? 'ninguna' : String(value)
    case 'absence_rule_type':
      return value === 'FIXED_COUNT' ? 'cantidad fija' : value === 'PERCENTAGE' ? 'porcentaje' : '?'
    case 'max_absence_percentage':
      return `${value ?? '?'} %`
    case 'max_absence_count':
      return value == null ? '—' : String(value)
    case 'policy_override':
      return value === true ? 'personalizada' : 'global'
    default:
      return String(value ?? '—')
  }
}

/** Texto legible de un campo cambiado, ej. "tolerancia de tardanza: 20 min → 25 min". */
export function describeFieldChange(field: string, change: FieldChange): string {
  return `${FIELD_LABELS[field] ?? field}: ${formatValue(field, change.before)} → ${formatValue(field, change.after)}`
}

/** Lee `details.changes` de una fila de auditoría; undefined si no tiene ese formato. */
export function readFieldChanges(details: Record<string, unknown>): FieldChanges | undefined {
  const raw = details.changes
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const changes: FieldChanges = {}
  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value && typeof value === 'object' && 'before' in value && 'after' in value) {
      changes[field] = value as FieldChange
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined
}
