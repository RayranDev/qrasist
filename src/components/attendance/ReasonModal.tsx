'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface ReasonModalProps {
  title: string
  description?: string
  confirmLabel: string
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}

const MIN_REASON_LENGTH = 5

export default function ReasonModal({
  title,
  description,
  confirmLabel,
  confirmVariant = 'primary',
  loading = false,
  onCancel,
  onConfirm,
}: ReasonModalProps) {
  const [reason, setReason] = useState('')
  const isValid = reason.trim().length >= MIN_REASON_LENGTH

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-modal-title"
        className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-xl p-6 animate-in zoom-in-95 duration-150"
      >
        <h3 id="reason-modal-title" className="text-sm font-bold text-gray-900 mb-1">
          {title}
        </h3>
        {description && <p className="text-xs text-gray-500 mb-4">{description}</p>}

        <label
          htmlFor="reason-modal-textarea"
          className="block text-xs font-semibold text-gray-700 mb-1.5"
        >
          Motivo (obligatorio, mín. {MIN_REASON_LENGTH} caracteres)
        </label>
        <textarea
          id="reason-modal-textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-navy-600 focus:ring-2 focus:ring-navy-100 transition-all mb-4"
          placeholder="Ej. Llegó justo cuando se cerraba el QR"
        />

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="md"
            className="flex-1"
            isLoading={loading}
            disabled={!isValid}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
