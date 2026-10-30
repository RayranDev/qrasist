'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { isWithinJustificationWindow } from '@/lib/justifications/eligibility'
import type { JustificationStatus } from './rowStyle'

export type DecisionTarget = JustificationStatus

const MIN_REASON_LENGTH = 5

const TARGET_LABELS: Record<DecisionTarget, string> = {
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  PENDING: 'Pendiente (volver a revisión)',
}

/** Destinos permitidos desde cada estado ya decidido. */
function targetsFrom(current: DecisionTarget): DecisionTarget[] {
  return current === 'APPROVED' ? ['REJECTED', 'PENDING'] : ['APPROVED', 'PENDING']
}

interface ChangeDecisionModalProps {
  /** Estado actual (APPROVED o REJECTED). */
  current: Exclude<DecisionTarget, 'PENDING'>
  description?: string
  /** Fecha de la sesión: para avisar si el estudiante aún puede reenviar tras un rechazo. */
  sessionDate?: string | null
  loading?: boolean
  onCancel: () => void
  onConfirm: (to: DecisionTarget, reason: string) => void
}

/**
 * Cambio de decisión sobre una justificación ya revisada: elige el nuevo
 * estado, exige un motivo y avisa del efecto sobre la inasistencia del
 * estudiante cuando se deja de aprobar.
 */
export default function ChangeDecisionModal({
  current,
  description,
  sessionDate,
  loading = false,
  onCancel,
  onConfirm,
}: ChangeDecisionModalProps) {
  const targets = targetsFrom(current)
  const [to, setTo] = useState<DecisionTarget>(targets[0])
  const [reason, setReason] = useState('')
  const isValid = reason.trim().length >= MIN_REASON_LENGTH
  // Rechazada fuera de plazo: el estudiante no podrá reenviar (submitJustification
  // valida la ventana de nuevo).
  const resubmitClosed =
    to === 'REJECTED' && !!sessionDate && !isWithinJustificationWindow(sessionDate)
  const reasonIsVisible = to !== 'PENDING'

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
        aria-labelledby="change-decision-title"
        className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-xl p-6 animate-in zoom-in-95 duration-150"
      >
        <h3 id="change-decision-title" className="text-sm font-bold text-gray-900 mb-1">
          Cambiar decisión
        </h3>
        {description && <p className="text-xs text-gray-500 mb-1">{description}</p>}
        <p className="text-xs text-gray-500 mb-4">
          Decisión actual: <span className="font-semibold">{TARGET_LABELS[current]}</span>
        </p>

        <fieldset className="mb-4">
          <legend className="block text-xs font-semibold text-gray-700 mb-1.5">
            Nueva decisión
          </legend>
          <div className="flex flex-col gap-1.5">
            {targets.map((target) => (
              <label
                key={target}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="radio"
                  name="change-decision-target"
                  value={target}
                  checked={to === target}
                  disabled={loading}
                  onChange={() => setTo(target)}
                  className="w-4 h-4 text-navy-800 focus:ring-navy-600"
                />
                {TARGET_LABELS[target]}
              </label>
            ))}
          </div>
        </fieldset>

        {current === 'APPROVED' && (
          <p
            role="alert"
            className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4"
          >
            <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
            Al dejar de estar aprobada, la inasistencia volverá a contar como no justificada para el
            estudiante.
          </p>
        )}

        {resubmitClosed && (
          <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 mb-4">
            El plazo para reenviar ya venció: el estudiante no podrá enviar una nueva justificación.
          </p>
        )}

        <label
          htmlFor="change-decision-textarea"
          className="block text-xs font-semibold text-gray-700 mb-1.5"
        >
          Motivo (obligatorio, mín. {MIN_REASON_LENGTH} caracteres)
        </label>
        <p className="text-xs text-gray-500 mb-1.5">
          {reasonIsVisible
            ? 'El estudiante verá este motivo como nota de revisión.'
            : 'Este motivo solo queda en la auditoría; el estudiante no lo verá.'}
        </p>
        <textarea
          id="change-decision-textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-navy-600 focus:ring-2 focus:ring-navy-100 transition-all mb-4"
          placeholder="Ej. Se recibió la constancia que faltaba"
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
            variant={to === 'REJECTED' ? 'danger' : 'primary'}
            size="md"
            className="flex-1"
            isLoading={loading}
            disabled={!isValid}
            onClick={() => onConfirm(to, reason.trim())}
          >
            Confirmar cambio
          </Button>
        </div>
      </div>
    </div>
  )
}
