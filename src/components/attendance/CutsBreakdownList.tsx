import type { CutBreakdown } from '@/lib/attendance/cutsBreakdown'
import { formatPercent } from '@/lib/attendance/cutsView'

/**
 * Desglose colapsable "Por corte" de la asistencia de una materia. Es
 * informativo: la pérdida por fallas se decide sobre todo el semestre.
 * Sin cortes no renderiza nada.
 */
export default function CutsBreakdownList({
  cuts,
  className = '',
}: {
  cuts: CutBreakdown[]
  className?: string
}) {
  if (cuts.length === 0) return null

  return (
    <details className={`group ${className}`}>
      <summary className="cursor-pointer select-none text-[11px] font-bold text-navy-700 uppercase tracking-wider list-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          &#9656;
        </span>
        Por corte
      </summary>
      <ul className="mt-2 space-y-1.5">
        {cuts.map((cut) => (
          <li
            key={cut.cutId ?? 'sin-corte'}
            className="flex items-center justify-between gap-3 bg-gray-50/80 rounded-xl px-3 py-2 text-xs"
          >
            <span className="font-semibold text-gray-700 truncate">{cut.name}</span>
            {cut.sessionsHeld === 0 ? (
              <span className="text-gray-400 shrink-0">Sin clases dictadas</span>
            ) : (
              <span className="text-gray-500 shrink-0">
                <strong className="text-gray-900 font-bold">{formatPercent(cut.percentage)}</strong>{' '}
                ({cut.attended}/{cut.sessionsHeld}
                {cut.late > 0 ? ` · ${cut.late} tarde${cut.late > 1 ? 's' : ''}` : ''}
                {cut.justified > 0
                  ? ` · ${cut.justified} justificada${cut.justified > 1 ? 's' : ''}`
                  : ''}
                )
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-gray-400">
        Informativo: la pérdida por fallas se calcula sobre todo el semestre.
      </p>
    </details>
  )
}

/**
 * Variante en línea para tablas: "Corte 1 80% · Corte 2 60%". Informativa,
 * sin colores de estado (el veredicto es semestral).
 */
export function CutsInline({ cuts }: { cuts: CutBreakdown[] }) {
  if (cuts.length === 0) return <span className="text-gray-300">---</span>

  return (
    <div className="flex flex-wrap gap-1.5">
      {cuts.map((cut) => (
        <span
          key={cut.cutId ?? 'sin-corte'}
          title={`${cut.name}: ${cut.attended}/${cut.sessionsHeld} asistidas`}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600"
        >
          <span className="font-semibold">{cut.name}</span>
          <strong className="font-bold text-gray-900">
            {cut.sessionsHeld === 0 ? '---' : formatPercent(cut.percentage)}
          </strong>
        </span>
      ))}
    </div>
  )
}
