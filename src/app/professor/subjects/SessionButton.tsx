'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSession } from '@/lib/actions/session'
import { useToast } from '@/components/toast/ToastProvider'

export default function SessionButton({ subjectId }: { subjectId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const showToast = useToast()

  const handleCreate = async () => {
    setLoading(true)
    const res = await createSession(subjectId)
    if (res.success) {
      router.push(`/professor/session/${res.sessionId}`)
    } else {
      showToast(res.error || 'Error desconocido al generar la sesión.', 'error')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition shadow-sm active:scale-95 disabled:opacity-50"
    >
      {loading ? 'Generando...' : 'Iniciar Sesión (Generar QR)'}
    </button>
  )
}
