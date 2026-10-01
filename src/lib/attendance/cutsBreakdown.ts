/**
 * Desglose de asistencia por corte (parcial) del período académico.
 *
 * Puramente informativo: agrupa sesiones y asistencia de una materia
 * por el corte en el que cae la fecha de cada sesión, para mostrar
 * algo como "Primer corte: 4/5 asistidas". NUNCA debe alimentar
 * computeAttendanceSummary (src/lib/utils/attendancePolicy.ts) -- el
 * veredicto NORMAL/WARNING/FAILED_ATTENDANCE sigue siendo semestral y
 * es la única fuente de verdad para aprobar/reprobar por inasistencia.
 *
 * Pura: no hace I/O, no conoce Supabase. El caller arma los mapas de
 * asistencia/justificación a partir de sus propias consultas.
 */

export interface CutInput {
  id: string
  name: string
  startDate: string // 'YYYY-MM-DD'
  endDate: string // 'YYYY-MM-DD'
  sequence: number
}

export interface SessionInput {
  id: string
  date: string // timestamptz ISO
}

export interface SessionAttendance {
  status: 'PRESENT' | 'LATE'
}

export interface CutBreakdown {
  cutId: string | null
  name: string
  sequence: number | null
  sessionsHeld: number
  attended: number
  late: number
  justified: number
  absences: number
  /** Porcentaje de asistencia (attended / sessionsHeld), no de inasistencia. */
  percentage: number
}

const UNASSIGNED_CUT_NAME = 'Sin corte asignado'

interface Bucket {
  held: number
  attended: number
  late: number
  justified: number
}

function emptyBucket(): Bucket {
  return { held: 0, attended: 0, late: 0, justified: 0 }
}

/** Día calendario (UTC) de un timestamp ISO, para comparar contra los
 * límites DATE (sin hora) de un corte. */
function toDayString(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function toBreakdown(
  cutId: string | null,
  name: string,
  sequence: number | null,
  bucket: Bucket
): CutBreakdown {
  // Una sesión sin registro de asistencia y sin justificación aprobada
  // es una falta real; nunca puede bajar de 0 (defensivo, no debería
  // ocurrir con conteos consistentes).
  const absences = Math.max(0, bucket.held - bucket.attended - bucket.justified)
  const percentage = bucket.held > 0 ? Math.round((bucket.attended / bucket.held) * 1000) / 10 : 0

  return {
    cutId,
    name,
    sequence,
    sessionsHeld: bucket.held,
    attended: bucket.attended,
    late: bucket.late,
    justified: bucket.justified,
    absences,
    percentage,
  }
}

/**
 * Agrupa `sessions` según el corte cuyo rango [startDate, endDate]
 * (ambos inclusive, comparados por día calendario) contiene la fecha
 * de cada sesión. Los cortes se evalúan en orden de `sequence`, así
 * que si dos cortes se solaparan (la validación de
 * src/lib/actions/periodCuts.ts debería impedirlo) gana el de menor
 * secuencia -- es un empate arbitrario mas no indefinido.
 *
 * Toda sesión que no cae en ningún corte va a un bucket sintético
 * `{cutId: null, name: 'Sin corte asignado', ...}`, que se omite del
 * resultado si queda vacío. Los cortes reales SIEMPRE aparecen en el
 * resultado, incluso con sessionsHeld: 0.
 */
export function computeCutsBreakdown(
  cuts: CutInput[],
  sessions: SessionInput[],
  attendanceByCurrentSessionId: Map<string, SessionAttendance>,
  justifiedSessionIds: Set<string>
): CutBreakdown[] {
  const sortedCuts = [...cuts].sort((a, b) => a.sequence - b.sequence)

  const bucketsByCutId = new Map<string, Bucket>()
  for (const cut of sortedCuts) bucketsByCutId.set(cut.id, emptyBucket())
  const unassigned = emptyBucket()

  for (const session of sessions) {
    const day = toDayString(session.date)
    const cut = sortedCuts.find((c) => day >= c.startDate && day <= c.endDate)
    const bucket = cut ? bucketsByCutId.get(cut.id)! : unassigned

    bucket.held += 1

    const attendance = attendanceByCurrentSessionId.get(session.id)
    if (attendance) {
      bucket.attended += 1
      if (attendance.status === 'LATE') bucket.late += 1
    } else if (justifiedSessionIds.has(session.id)) {
      bucket.justified += 1
    }
  }

  const result = sortedCuts.map((cut) =>
    toBreakdown(cut.id, cut.name, cut.sequence, bucketsByCutId.get(cut.id)!)
  )

  if (unassigned.held > 0) {
    result.push(toBreakdown(null, UNASSIGNED_CUT_NAME, null, unassigned))
  }

  return result
}
