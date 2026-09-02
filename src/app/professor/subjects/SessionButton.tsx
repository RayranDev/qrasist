'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSession } from '@/lib/actions/session'
import {
  DEFAULT_ROTATION_SECONDS,
  MIN_ROTATION_SECONDS,
  MAX_ROTATION_SECONDS,
} from '@/lib/qrRotation'
import { useToast } from '@/components/toast/ToastProvider'
import { getBestEffortLocation } from '@/lib/utils/geolocation'
import { Settings2, ChevronDown } from 'lucide-react'

export default function SessionButton({ subjectId }: { subjectId: string }) {
  const [loading, setLoading] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [rotationSeconds, setRotationSeconds] = useState(DEFAULT_ROTATION_SECONDS)
  const router = useRouter()
  const showToast = useToast()

  const handleCreate = async () => {
    setLoading(true)
    const coords = await getBestEffortLocation()
    const res = await createSession(subjectId, 15, coords || undefined, rotationSeconds)
    if (res.success) {
      router.push(`/professor/session/${res.sessionId}`)
    } else {
      showToast(res.error || 'Error desconocido al generar la sesión.', 'error')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowOptions((v) => !v)}
        aria-expanded={showOptions}
        className={`w-full flex items-center justify-between gap-1.5 px-3 py-2 mb-2 text-xs font-bold rounded-lg border transition ${
          showOptions
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-gray-600 bg-gray-50 border-gray-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5" strokeWidth={2} />
          Ajustar rotación del código
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${showOptions ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {showOptions && (
        <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            Rotación (segundos)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={MIN_ROTATION_SECONDS}
              max={MAX_ROTATION_SECONDS}
              value={rotationSeconds}
              onChange={(e) => setRotationSeconds(Number(e.target.value))}
              className="w-20 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="text-xs text-gray-500">
              El código se renueva cada tantos segundos. Entre {MIN_ROTATION_SECONDS} y{' '}
              {MAX_ROTATION_SECONDS} — más corto es más seguro, más largo da más margen para
              escanear.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition shadow-sm active:scale-95 disabled:opacity-50"
      >
        {loading ? 'Generando...' : 'Iniciar Sesión (Generar QR)'}
      </button>
    </div>
  )
}
