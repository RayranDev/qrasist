'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
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
}: {
  url: string
  label?: string
  fallbackName?: string
  variant?: 'primary' | 'secondary' | 'outline'
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
      onClick={handleClick}
      isLoading={loading}
      leftIcon={<FileText className="w-4 h-4 text-brand-700" strokeWidth={2} />}
    >
      {label}
    </Button>
  )
}
