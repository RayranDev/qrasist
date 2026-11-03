'use client'

import { useState } from 'react'
import ReportDownloadButton from '@/components/ReportDownloadButton'
import { attendanceRangeUrl } from '@/lib/reports/attendanceRangeUrl'

/**
 * Descarga del reporte por rango con la opción "Incluir IP y ubicación"
 * (apagada por defecto). Con la opción, el Excel suma IP, ubicación y alertas
 * por asistencia; esos datos son personales, así que el servidor deja la
 * descarga en la bitácora y solo existen para clases presenciales.
 */
export default function RangeReportButton({
  from,
  to,
  careerId,
  subjectId,
  label,
  title,
}: {
  from: string
  to: string
  careerId?: string
  subjectId?: string
  label: string
  title: string
}) {
  const [includeCapture, setIncludeCapture] = useState(false)

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <label
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer"
        title="Agrega IP, ubicación y alertas a cada asistencia de clases presenciales. La descarga queda registrada en la bitácora."
      >
        <input
          type="checkbox"
          checked={includeCapture}
          onChange={(e) => setIncludeCapture(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-navy-700 focus:ring-navy-600"
        />
        Incluir IP y ubicación
      </label>
      <ReportDownloadButton
        url={attendanceRangeUrl({ from, to, careerId, subjectId, includeCapture })}
        label={label}
        title={includeCapture ? `${title} Con IP y ubicación.` : title}
        fallbackName="asistencia.xlsx"
        icon="excel"
      />
    </div>
  )
}
