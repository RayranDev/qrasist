'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import ReasonModal from './ReasonModal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/toast/ToastProvider'
import { suspendClass } from '@/lib/actions/classSuspension'
import { SUSPENDED_NO_ABSENCES_NOTICE } from '@/lib/sessions/suspension'

interface SuspendClassButtonProps {
  /** Suspende una sesión existente. */
  sessionId?: string
  /** Suspende la clase programada de `date` (hoy si falta) que no tiene sesión. */
  subjectId?: string
  date?: string
  label?: string
  variant?: 'outline' | 'ghost' | 'secondary'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Botón + modal con motivo obligatorio para suspender una clase (RF20).
 * Avisa de forma explícita que no se generarán inasistencias.
 */
export default function SuspendClassButton({
  sessionId,
  subjectId,
  date,
  label = 'Suspender clase',
  variant = 'outline',
  size = 'sm',
  className = '',
}: SuspendClassButtonProps) {
  const router = useRouter()
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async (reason: string) => {
    setLoading(true)
    const res = await suspendClass({ sessionId, subjectId, date, reason })
    setLoading(false)
    if (res.success) {
      showToast('Clase suspendida. No se generarán inasistencias.', 'success')
      setOpen(false)
      router.refresh()
    } else {
      showToast(res.error || 'No se pudo suspender la clase.', 'error')
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        leftIcon={<Ban className="w-3.5 h-3.5" />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && (
        <ReasonModal
          title="Suspender clase"
          description={`Úsalo cuando no hay condiciones para dictar clase (ej. corte de energía). ${SUSPENDED_NO_ABSENCES_NOTICE} Queda registrado para coordinación.`}
          confirmLabel="Suspender clase"
          confirmVariant="danger"
          placeholder="Ej. Corte de energía en el edificio"
          loading={loading}
          onCancel={() => setOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  )
}
