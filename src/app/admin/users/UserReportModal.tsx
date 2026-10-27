'use client'

import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/toast/ToastProvider'
import { downloadReport } from '@/lib/reports/downloadReport'
import { userReportUrl } from '@/lib/reports/userReportUrl'

const ROLE_LABELS = { STUDENT: 'Estudiante', PROFESSOR: 'Docente' } as const

/**
 * Descarga el reporte de asistencia de un estudiante o un docente (Excel o
 * PDF), con un rango de fechas opcional. El permiso lo vuelve a verificar el
 * route handler; acá solo se arma la URL y se dispara la descarga.
 */
export default function UserReportModal({
  userId,
  userName,
  role,
  onClose,
}: {
  userId: string
  userName: string
  role: keyof typeof ROLE_LABELS
  onClose: () => void
}) {
  const showToast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [downloading, setDownloading] = useState<'xlsx' | 'pdf' | null>(null)

  const hasOnlyOneDate = !!from !== !!to
  const isReversed = !!from && !!to && from > to
  const rangeError = hasOnlyOneDate
    ? 'Indica la fecha inicial y la final, o deja ambas vacías.'
    : isReversed
      ? 'La fecha final no puede ser anterior a la inicial.'
      : null

  const handleDownload = async (format: 'xlsx' | 'pdf') => {
    if (rangeError || downloading) return
    setDownloading(format)
    const result = await downloadReport(
      userReportUrl({ userId, format, from, to }),
      `reporte_asistencia.${format}`
    )
    if (result.ok) {
      onClose()
    } else {
      showToast(result.error, 'error')
    }
    setDownloading(null)
  }

  return (
    <Modal
      title="Reporte de asistencia"
      description={`${userName} · ${ROLE_LABELS[role]}`}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          {role === 'STUDENT'
            ? 'Incluye, por materia, las clases dictadas, las ausencias, las justificadas y el porcentaje de asistencia.'
            : 'Incluye, por materia, las clases programadas, dictadas, suspendidas y sin registrar, y los asistentes de cada clase.'}
        </p>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-gray-700 tracking-wide mb-1.5">
            Rango de fechas (opcional)
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Desde"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="text-gray-900 [color-scheme:light]"
            />
            <Input
              label="Hasta"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="text-gray-900 [color-scheme:light]"
            />
          </div>
          {rangeError ? (
            <p
              role="alert"
              className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
            >
              {rangeError}
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Déjalas vacías para incluir todo el historial. El rango máximo es de un año.
            </p>
          )}
        </fieldset>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 flex-wrap">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleDownload('xlsx')}
            isLoading={downloading === 'xlsx'}
            disabled={!!rangeError || downloading !== null}
            leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" strokeWidth={2} />}
          >
            Descargar Excel
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleDownload('pdf')}
            isLoading={downloading === 'pdf'}
            disabled={!!rangeError || downloading !== null}
            leftIcon={<FileText className="w-4 h-4 text-brand-700" strokeWidth={2} />}
          >
            Descargar PDF
          </Button>
        </div>
      </div>
    </Modal>
  )
}
