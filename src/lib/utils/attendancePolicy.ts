/**
 * Lógica pura de cálculo de inasistencias, semaforización y proyección de reprobación.
 * Permite configuración por PORCENTAJE (ej. 20%) o por CANTIDAD FIJA (ej. 4 faltas).
 */

export type AbsenceRuleType = 'PERCENTAGE' | 'FIXED_COUNT'
export type AttendanceStatus = 'NORMAL' | 'WARNING' | 'FAILED_ATTENDANCE'

export interface AbsencePolicyConfig {
  ruleType?: AbsenceRuleType
  maxPercentage?: number // Default: 20
  maxCount?: number | null // Si es null y regla es FIXED_COUNT, fallback a 4
  totalPlannedSessions?: number // Default: 16
  // Cuántas tardanzas equivalen a una falta (ej. 3 = cada 3 tardanzas
  // cuentan como 1 inasistencia adicional). NULL/undefined = las
  // tardanzas nunca se convierten en falta.
  latesPerAbsence?: number | null
}

export interface StudentAttendanceSummary {
  sessionsHeld: number
  attendancesCount: number
  lateCount: number
  absencesCount: number
  absencePercentage: number
  maxAbsencesAllowed: number
  remainingAbsences: number
  status: AttendanceStatus
  statusMessage: string
}

export function computeAttendanceSummary(
  sessionsHeld: number,
  attendancesCount: number,
  config: AbsencePolicyConfig = {},
  lateCount: number = 0
): StudentAttendanceSummary {
  const ruleType = config.ruleType || 'PERCENTAGE'
  const maxPercentage = config.maxPercentage ?? 20
  const totalPlanned = Math.max(1, config.totalPlannedSessions ?? 16)

  const cleanSessionsHeld = Math.max(0, sessionsHeld)
  const validAttendances = Math.min(cleanSessionsHeld, Math.max(0, attendancesCount))
  // Una tardanza es una asistencia registrada: nunca puede haber mas
  // tardanzas que asistencias, asi las faltas no superan lo dictado.
  const cleanLateCount = Math.min(validAttendances, Math.max(0, lateCount))

  // Faltas "reales" (sesiones dictadas sin ningún registro) más la
  // penalización de tardanzas acumuladas: cada `latesPerAbsence`
  // tardanzas se contabiliza como 1 falta adicional.
  const baseAbsencesCount = Math.max(0, cleanSessionsHeld - validAttendances)
  const latePenaltyAbsences = config.latesPerAbsence
    ? Math.floor(cleanLateCount / config.latesPerAbsence)
    : 0
  const absencesCount = baseAbsencesCount + latePenaltyAbsences

  const absencePercentage =
    cleanSessionsHeld > 0 ? Math.round((absencesCount / cleanSessionsHeld) * 1000) / 10 : 0

  let maxAbsencesAllowed: number
  if (ruleType === 'FIXED_COUNT') {
    maxAbsencesAllowed = config.maxCount ?? 4
  } else {
    // Calculado sobre el total planificado del semestre
    maxAbsencesAllowed = Math.floor((totalPlanned * maxPercentage) / 100)
  }

  const remainingAbsences = Math.max(0, maxAbsencesAllowed - absencesCount)

  let status: AttendanceStatus = 'NORMAL'
  let statusMessage = 'Asistencia regular'

  if (absencesCount > maxAbsencesAllowed) {
    status = 'FAILED_ATTENDANCE'
    statusMessage = `Pérdida por inasistencia (${absencesCount} fallas acumuladas de máx ${maxAbsencesAllowed})`
  } else if (remainingAbsences <= 1) {
    status = 'WARNING'
    statusMessage =
      remainingAbsences === 0
        ? 'Límite alcanzado: una falla más causará pérdida de materia'
        : '¡En riesgo! Te queda 1 sola falta permitida'
  } else if (cleanSessionsHeld > 0 && absencePercentage >= maxPercentage * 0.75) {
    status = 'WARNING'
    statusMessage = `Alerta de inasistencia (${absencePercentage}% registrado)`
  }

  return {
    sessionsHeld: cleanSessionsHeld,
    attendancesCount: validAttendances,
    lateCount: cleanLateCount,
    absencesCount,
    absencePercentage,
    maxAbsencesAllowed,
    remainingAbsences,
    status,
    statusMessage,
  }
}
