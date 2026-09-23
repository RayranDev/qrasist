export interface AttendanceSummaryProps {
  attendanceRate: number
  totalAttendances: number
  totalSessions: number
  hasExpectedAttendances: boolean
  /** Variación en puntos porcentuales vs. el período anterior; omitido si no se pudo calcular barato. */
  trendPoints?: number | null
}

/**
 * Resumen institucional de asistencia, texto-primero: un número grande,
 * una sola barra como referencia visual y una línea de contexto. Evita
 * a propósito la grilla de tarjetas-icono repetidas que tenía antes.
 */
export default function AttendanceSummary({
  attendanceRate,
  totalAttendances,
  totalSessions,
  hasExpectedAttendances,
  trendPoints,
}: AttendanceSummaryProps) {
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
        Presentismo institucional
      </h2>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="text-4xl font-bold font-mono text-neutral-900 tracking-tight">
            {attendanceRate}%
          </span>
          {typeof trendPoints === 'number' && trendPoints !== 0 && (
            <span
              className={`ml-2 text-sm font-semibold font-mono ${
                trendPoints > 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {trendPoints > 0 ? '+' : ''}
              {trendPoints} pts vs. período anterior
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-500">
          {hasExpectedAttendances
            ? `${totalAttendances} marcas registradas en ${totalSessions} sesiones`
            : 'Sin sesiones dictadas todavía'}
        </p>
      </div>

      <div className="mt-4 h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            attendanceRate >= 80
              ? 'bg-emerald-500'
              : attendanceRate >= 60
                ? 'bg-amber-500'
                : 'bg-rose-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, attendanceRate))}%` }}
          role="img"
          aria-label={`Presentismo institucional: ${attendanceRate}%`}
        />
      </div>
    </div>
  )
}
