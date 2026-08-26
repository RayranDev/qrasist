'use client'

import { useState } from 'react'
import { approveEnrollmentRequest, rejectEnrollmentRequest } from '@/lib/actions/enrollmentRequests'
import { useToast } from '@/components/toast/ToastProvider'

interface Request {
  id: string
  requested_at: string
  student: { name: string; student_code: string | null } | null
}

export default function RequestsList({ requests }: { requests: Request[] }) {
  const [items, setItems] = useState(requests)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const showToast = useToast()

  const handleDecision = async (request: Request, approve: boolean) => {
    setLoadingId(request.id)
    const result = approve
      ? await approveEnrollmentRequest(request.id)
      : await rejectEnrollmentRequest(request.id)

    if (result.success) {
      setItems((prev) => prev.filter((r) => r.id !== request.id))
      showToast(
        `Solicitud de ${request.student?.name || 'estudiante'} ${approve ? 'aprobada' : 'rechazada'}.`,
        'success'
      )
    } else {
      showToast(result.error || 'No se pudo procesar la solicitud.', 'error')
    }
    setLoadingId(null)
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-gray-400 italic">No hay solicitudes pendientes.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="divide-y divide-gray-50">
        {items.map((req) => (
          <div key={req.id} className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="font-bold text-gray-900">{req.student?.name || 'Estudiante'}</p>
              <p className="text-xs text-gray-400 font-mono">
                {req.student?.student_code || '---'} ·{' '}
                {new Date(req.requested_at).toLocaleString('es-CO')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={loadingId === req.id}
                onClick={() => handleDecision(req, true)}
                className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50"
              >
                {loadingId === req.id ? '...' : 'Aprobar'}
              </button>
              <button
                disabled={loadingId === req.id}
                onClick={() => handleDecision(req, false)}
                className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
              >
                {loadingId === req.id ? '...' : 'Rechazar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
