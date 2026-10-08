'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/toast/ToastProvider'
import { suspendClass } from '@/lib/actions/classSuspension'
import {
  MAX_SUSPENSION_REASON_LENGTH,
  MIN_SUSPENSION_REASON_LENGTH,
  SUSPENDED_NO_ABSENCES_NOTICE,
} from '@/lib/sessions/suspension'

/**
 * Suspende la clase programada de un día que todavía no tiene sesión (RF20).
 * Crea un registro suspendido para ese día: no genera inasistencias y evita
 * que el día cuente como "clase no registrada por el docente".
 */
export default function SuspendDayModal({
  subjectId,
  subjectName,
  defaultDate = '',
  buttonLabel = 'Suspender clase de un día',
  buttonSize = 'sm',
}: {
  subjectId: string
  subjectName: string
  /** 'YYYY-MM-DD' precargada (ej. desde la lista de omisiones). */
  defaultDate?: string
  buttonLabel?: string
  buttonSize?: 'sm' | 'md'
}) {
  const router = useRouter()
  const showToast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [date, setDate] = useState(defaultDate)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setIsOpen(false)
    setError(null)
  }

  const trimmed = reason.trim()
  const canSubmit = !!date && trimmed.length >= MIN_SUSPENSION_REASON_LENGTH

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || !canSubmit) return
    setLoading(true)
    setError(null)

    const res = await suspendClass({ subjectId, date, reason: trimmed })
    setLoading(false)

    if (!res.success) {
      setError(res.error || 'No se pudo suspender la clase.')
      return
    }

    showToast('Clase suspendida. No se generarán inasistencias.', 'success')
    setIsOpen(false)
    setReason('')
    router.refresh()
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={buttonSize}
        leftIcon={<Ban className="w-4 h-4" />}
        onClick={() => setIsOpen(true)}
      >
        {buttonLabel}
      </Button>

      {isOpen && (
        <Modal
          title="Suspender clase de un día"
          description={`${subjectName}. ${SUSPENDED_NO_ABSENCES_NOTICE}`}
          onClose={close}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Fecha de la clase"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              helperText="Debe estar dentro del período de la materia."
              required
            />

            <div className="space-y-1.5">
              <label
                htmlFor="suspend-day-reason"
                className="block text-xs font-semibold text-gray-700 tracking-wide"
              >
                Motivo (obligatorio, mín. {MIN_SUSPENSION_REASON_LENGTH} caracteres)
              </label>
              <textarea
                id="suspend-day-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, MAX_SUSPENSION_REASON_LENGTH))}
                rows={3}
                placeholder="Ej. Corte de energía en el edificio"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none hover:border-gray-300 focus:border-navy-600 focus:ring-2 focus:ring-navy-100"
              />
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              Si la clase ya tiene una sesión registrada ese día, suspéndela desde su fila en la
              lista. El evento queda en la bitácora de auditoría.
            </p>

            {error && (
              <p
                role="alert"
                className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={close}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                isLoading={loading}
                disabled={!canSubmit}
              >
                Suspender clase
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
