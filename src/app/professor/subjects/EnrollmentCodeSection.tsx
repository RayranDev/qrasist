'use client'

import { useState } from 'react'
import Link from 'next/link'
import { generateEnrollmentCode } from '@/lib/actions/enrollmentRequests'
import { useToast } from '@/components/toast/ToastProvider'

export default function EnrollmentCodeSection({
  subjectId,
  code,
  pendingCount,
}: {
  subjectId: string
  code: string | null
  pendingCount: number
}) {
  const [loading, setLoading] = useState(false)
  const [currentCode, setCurrentCode] = useState(code)
  const showToast = useToast()

  const handleGenerate = async () => {
    setLoading(true)
    const result = await generateEnrollmentCode(subjectId)
    if (result.success && result.code) {
      setCurrentCode(result.code)
      showToast('Código de inscripción generado.', 'success')
    } else {
      showToast(result.error || 'No se pudo generar el código.', 'error')
    }
    setLoading(false)
  }

  return (
    <div className="border-t border-gray-100 pt-4 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
          Código de inscripción
        </p>
        {currentCode ? (
          <p className="font-mono text-lg font-black text-emerald-600 tracking-wider">
            {currentCode}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">Sin generar</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {pendingCount > 0 && (
          <Link
            href={`/professor/subjects/${subjectId}/requests`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-100 transition"
          >
            {pendingCount} solicitud{pendingCount !== 1 ? 'es' : ''}
          </Link>
        )}
        <button
          disabled={loading}
          onClick={handleGenerate}
          className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
        >
          {loading ? '...' : currentCode ? 'Regenerar' : 'Generar código'}
        </button>
      </div>
    </div>
  )
}
