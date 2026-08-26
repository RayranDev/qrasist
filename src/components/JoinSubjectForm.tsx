'use client'

import { useState } from 'react'
import { requestEnrollment } from '@/lib/actions/enrollmentRequests'
import { useToast } from '@/components/toast/ToastProvider'

export default function JoinSubjectForm() {
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
    } else {
      showToast(result.error || 'No se pudo enviar la solicitud.', 'error')
    }
    setLoading(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
    >
      <p className="text-sm font-bold text-gray-900 mb-1">¿Tu docente te dio un código?</p>
      <p className="text-xs text-gray-400 mb-3">
        Úsalo para solicitar inscripción a una materia. El docente debe aprobarla.
      </p>
      <div className="flex gap-2">
        <input
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
    </form>
  )
}
