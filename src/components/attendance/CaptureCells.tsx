import { TriangleAlert } from 'lucide-react'
import { SUSPICIOUS_DISTANCE_METERS, type CaptureEvaluation } from '@/lib/attendance/captureFlags'

/**
 * IP y ubicación de una asistencia, con las mismas alertas para el profesor
 * (historial) y para coordinación. Solo se usa en clases con captura: en una
 * clase virtual el contenedor muestra la nota en lugar de estas celdas.
 */
export function IpCell({ evaluation }: { evaluation: CaptureEvaluation }) {
  if (evaluation.kind === 'manual') {
    return <span className="text-xs text-gray-400">Manual</span>
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-gray-500">{evaluation.ip ?? '—'}</span>
      {evaluation.ipDiffers && (
        <span
          title="Esta IP es distinta a la del resto del grupo en esta clase"
          className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md"
        >
          <TriangleAlert className="w-3 h-3" strokeWidth={2.5} />
          distinta
        </span>
      )}
    </div>
  )
}

export function LocationCell({ evaluation }: { evaluation: CaptureEvaluation }) {
  if (evaluation.distanceMeters === null) {
    return <span className="text-xs text-gray-300">—</span>
  }
  if (evaluation.farAway) {
    return (
      <span
        title="La ubicación del estudiante al escanear está lejos de donde el profesor generó el código."
        className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md"
      >
        <TriangleAlert className="w-3 h-3" strokeWidth={2.5} />
        {'>'}
        {SUSPICIOUS_DISTANCE_METERS}m
      </span>
    )
  }
  return <span className="text-xs text-gray-400">cerca</span>
}
