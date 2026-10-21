'use client'

import { useState } from 'react'
import ReportDownloadButton from '@/components/ReportDownloadButton'

/**
 * Descarga del reporte PDF de una materia (RF32: los docentes descargan
 * reportes solo en PDF), para todo el período o para un corte. El route
 * handler vuelve a verificar que el usuario sea el profesor de la materia.
 */
export default function SubjectReportDownload({
  subjectId,
  subjectCode,
  cuts,
}: {
  subjectId: string
  subjectCode: string
  cuts: { id: string; name: string }[]
}) {
  const [cutId, setCutId] = useState('')

  const params = new URLSearchParams({ subjectId })
  if (cutId) params.set('cutId', cutId)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {cuts.length > 0 && (
        <select
          aria-label="Alcance del reporte"
          value={cutId}
          onChange={(e) => setCutId(e.target.value)}
          className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-100"
        >
          <option value="">Todo el período</option>
          {cuts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <ReportDownloadButton
        url={`/professor/reports/subject?${params.toString()}`}
        label="Descargar PDF"
        fallbackName={`asistencia_${subjectCode}.pdf`}
      />
    </div>
  )
}
