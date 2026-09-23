'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/toast/ToastProvider'

interface Period {
  id: string
  name: string
}

/**
 * Descarga el reporte de asistencia de un período completo. El .xlsx
 * se genera en el servidor (route handler /admin/reports/period) en
 * vez de con `downloadWorkbook` client-side como el resto de las
 * exportaciones: un período puede tener cientos de estudiantes y las
 * consultas para armarlo no tiene sentido mandarlas al navegador.
 */
export default function PeriodReportExport({ periods }: { periods: Period[] }) {
  const [periodId, setPeriodId] = useState(periods[0]?.id || '')
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  if (periods.length === 0) return null

  const handleExport = async () => {
    if (!periodId) return
    setLoading(true)
    try {
      const res = await fetch(`/admin/reports/period?periodId=${encodeURIComponent(periodId)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        showToast(body?.error || 'No se pudo generar el reporte.', 'error')
        return
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || 'reporte_periodo.xlsx'

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      showToast('No se pudo generar el reporte.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <FileSpreadsheet className="w-4 h-4 text-neutral-400 shrink-0" strokeWidth={1.75} />
        <select
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleExport}
        isLoading={loading}
        leftIcon={<Download className="w-4 h-4" strokeWidth={2} />}
      >
        Exportar reporte del período
      </Button>
    </div>
  )
}
