'use client'

import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/toast/ToastProvider'
import { downloadReport } from '@/lib/reports/downloadReport'

/**
 * Botón que descarga un reporte PDF generado en el servidor. El permiso lo
 * vuelve a verificar el route handler; acá solo se dispara la descarga.
 */
export default function ReportDownloadButton({
  url,
  label = 'Descargar PDF',
  fallbackName = 'reporte.pdf',
  variant = 'secondary',
  icon = 'pdf',
  title,
}: {
  url: string
  label?: string
  fallbackName?: string
  variant?: 'primary' | 'secondary' | 'outline'
  /** Ícono según el tipo de archivo: 'pdf' (por defecto) o 'excel'. */
  icon?: 'pdf' | 'excel'
  /** Tooltip; útil cuando la etiqueta no alcanza para decir qué se descarga. */
  title?: string
}) {
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleClick = async () => {
    setLoading(true)
    const result = await downloadReport(url, fallbackName)
    if (!result.ok) showToast(result.error, 'error')
    setLoading(false)
  }

  return (
    <Button
      variant={variant}
      size="sm"
      title={title}
      onClick={handleClick}
      isLoading={loading}
      leftIcon={
        icon === 'excel' ? (
          <FileSpreadsheet className="w-4 h-4 text-emerald-700" strokeWidth={2} />
        ) : (
          <FileText className="w-4 h-4 text-brand-700" strokeWidth={2} />
        )
      }
    >
      {label}
    </Button>
  )
}
