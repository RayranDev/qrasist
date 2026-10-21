'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Undo2 } from 'lucide-react'
import ConfirmModal from '@/components/ConfirmModal'
import ReasonModal from '@/components/attendance/ReasonModal'
import { useToast } from '@/components/toast/ToastProvider'
import { suspendClass, unsuspendClass } from '@/lib/actions/classSuspension'
import { SUSPENDED_NO_ABSENCES_NOTICE } from '@/lib/sessions/suspension'

const BUTTON_CLASS =
  'p-2 text-gray-400 rounded-xl transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600'

/**
 * Suspender (RF20) o deshacer la suspensión de una clase desde el panel del
 * coordinador. Suspender exige motivo y no genera inasistencias; deshacer
 * devuelve la clase al conteo de dictadas y recalcula las inasistencias.
 */
export default function SessionSuspensionControl({
  sessionId,
  isSuspended,
}: {
  sessionId: string
  isSuspended: boolean
}) {
  const router = useRouter()
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const finish = (ok: boolean, successMessage: string, error?: string) => {
    setLoading(false)
    if (ok) {
      showToast(successMessage, 'success')
      setOpen(false)
      router.refresh()
    } else {
      showToast(error || 'No se pudo actualizar la clase.', 'error')
    }
  }

  const handleSuspend = async (reason: string) => {
    setLoading(true)
    const res = await suspendClass({ sessionId, reason })
    finish(res.success, 'Clase suspendida. No se generarán inasistencias.', res.error)
  }

  const handleUndo = async () => {
    setLoading(true)
    const res = await unsuspendClass(sessionId)
    finish(res.success, 'Suspensión deshecha.', res.error)
  }

  const label = isSuspended ? 'Deshacer suspensión' : 'Suspender clase'
  const Icon = isSuspended ? Undo2 : Ban

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        className={`${BUTTON_CLASS} ${
          isSuspended
            ? 'hover:text-navy-700 hover:bg-navy-50'
            : 'hover:text-red-600 hover:bg-red-50'
        }`}
      >
        <Icon className="w-4 h-4" strokeWidth={2} />
      </button>

      {open && !isSuspended && (
        <ReasonModal
          title="Suspender clase"
          description={`${SUSPENDED_NO_ABSENCES_NOTICE} Se cierra el código QR y las asistencias ya escaneadas se conservan en la bitácora. Queda registrado para coordinación.`}
          confirmLabel="Suspender clase"
          confirmVariant="danger"
          placeholder="Ej. Corte de energía en el edificio"
          loading={loading}
          onCancel={() => setOpen(false)}
          onConfirm={handleSuspend}
        />
      )}

      {open && isSuspended && (
        <ConfirmModal
          title="Deshacer suspensión"
          message="La clase vuelve a contar como dictada y las inasistencias de los inscritos se recalculan. Si no tiene asistencias cargadas, todos quedarán ausentes hasta que las registres o la archives."
          confirmLabel="Deshacer suspensión"
          loading={loading}
          icon={Undo2}
          onConfirm={handleUndo}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}
