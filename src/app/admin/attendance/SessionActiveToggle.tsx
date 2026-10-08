'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import ConfirmModal from '@/components/ConfirmModal'
import { useToast } from '@/components/toast/ToastProvider'
import { deleteSession, reactivateSession } from '@/lib/actions/professorHistory'

/**
 * Archivar/reactivar una clase desde el panel del coordinador. Archivar la
 * saca del conteo de clases dictadas (y por tanto de las inasistencias de
 * todos los inscritos); reactivar la devuelve. Queda en la bitácora.
 */
export default function SessionActiveToggle({
  sessionId,
  isActive,
}: {
  sessionId: string
  isActive: boolean
}) {
  const router = useRouter()
  const showToast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    const res = isActive ? await deleteSession(sessionId) : await reactivateSession(sessionId)
    setLoading(false)
    if (res.success) {
      showToast(isActive ? 'Clase archivada.' : 'Clase reactivada.', 'success')
      setConfirming(false)
      router.refresh()
    } else {
      showToast(res.error || 'No se pudo actualizar la clase.', 'error')
    }
  }

  const Icon = isActive ? Archive : ArchiveRestore
  const label = isActive ? 'Archivar clase' : 'Reactivar clase'

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title={label}
        aria-label={label}
        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
      >
        <Icon className="w-4 h-4" strokeWidth={2} />
      </button>
      {confirming && (
        <ConfirmModal
          title={label}
          message={
            isActive
              ? 'La clase deja de contar como dictada: las inasistencias de los inscritos se recalculan. Las asistencias registradas se conservan y puedes reactivarla después.'
              : 'La clase vuelve a contar como dictada y las inasistencias de los inscritos se recalculan.'
          }
          confirmLabel={isActive ? 'Archivar' : 'Reactivar'}
          loading={loading}
          icon={Icon}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
