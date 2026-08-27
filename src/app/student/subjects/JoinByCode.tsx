'use client'

import { useState } from 'react'
import { requestEnrollment } from '@/lib/actions/enrollmentRequests'
import { useToast } from '@/components/toast/ToastProvider'

export default function JoinByCode() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    const result = await requestEnrollment(code)
    if (result.success) {
      showToast(
        `Solicitud enviada para ${result.subjectName}. Espera la aprobación del docente.`,
        'success'
      )
      setCode('')
      setOpen(false)
    } else {
      showToast(result.error || 'No se pudo enviar la solicitud.', 'error')
    }
    setLoading(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-gray-400 hover:text-emerald-600 transition text-center"
      >
        ¿Tu docente te dio un código? Ingresalo acá
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          type="text"
          placeholder="Ej. AB3XZ9K"
          maxLength={12}
          className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono tracking-wider text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
        />
        <button
          disabled={loading || !code.trim()}
          type="submit"
          className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50 shrink-0"
        >
          {loading ? '...' : 'Unirme'}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs font-bold text-gray-400 hover:text-gray-600 transition self-center"
      >
        Cancelar
      </button>
    </form>
  )
}
