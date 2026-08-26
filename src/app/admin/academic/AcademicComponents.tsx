'use client'

import { useState } from 'react'
import {
  createCareer,
  setCareerActive,
  createPeriod,
  setPeriodActive,
} from '@/lib/actions/academic'
import { useToast } from '@/components/toast/ToastProvider'

const inputClass =
  'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm'

interface Career {
  id: string
  name: string
  code: string
  is_active: boolean
}

interface Period {
  id: string
  name: string
  is_active: boolean
}

export function CreateCareerForm() {
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const result = await createCareer(formData)
    if (result.success) {
      ;(e.target as HTMLFormElement).reset()
      showToast(`Carrera "${name}" creada.`, 'success')
    } else {
      showToast(result.error || 'No se pudo crear la carrera.', 'error')
    }
    setLoading(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6"
    >
      <h3 className="text-lg font-bold text-gray-900 mb-4">Nueva Carrera</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Nombre
          </label>
          <input
            required
            name="name"
            type="text"
            placeholder="Ej. Ingeniería de Sistemas"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Código
          </label>
          <input required name="code" type="text" placeholder="Ej. ISIS" className={inputClass} />
        </div>
      </div>
      <button
        disabled={loading}
        type="submit"
        className="mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50"
      >
        {loading ? 'Guardando...' : 'Agregar Carrera'}
      </button>
    </form>
  )
}

export function CareerList({ careers }: { careers: Career[] }) {
  const showToast = useToast()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleToggle = async (career: Career) => {
    setLoadingId(career.id)
    const result = await setCareerActive(career.id, !career.is_active)
    if (result.success) {
      showToast(`"${career.name}" ${career.is_active ? 'archivada' : 'reactivada'}.`, 'success')
    } else {
      showToast(result.error || 'No se pudo actualizar la carrera.', 'error')
    }
    setLoadingId(null)
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      {careers.length > 0 ? (
        <div className="divide-y divide-gray-50">
          {careers.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="font-bold text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400 font-mono">{c.code}</p>
              </div>
              <div className="flex items-center gap-3">
                {!c.is_active && (
                  <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                    Archivada
                  </span>
                )}
                <button
                  disabled={loadingId === c.id}
                  onClick={() => handleToggle(c)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-50 bg-gray-50 text-gray-600 hover:bg-gray-100"
                >
                  {loadingId === c.id ? '...' : c.is_active ? 'Archivar' : 'Reactivar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-6 py-6 text-sm text-gray-400 italic text-center">
          Sin carreras registradas.
        </p>
      )}
    </div>
  )
}

export function CreatePeriodForm() {
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const result = await createPeriod(formData)
    if (result.success) {
      ;(e.target as HTMLFormElement).reset()
      showToast(`Período "${name}" creado.`, 'success')
    } else {
      showToast(result.error || 'No se pudo crear el período.', 'error')
    }
    setLoading(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6"
    >
      <h3 className="text-lg font-bold text-gray-900 mb-4">Nuevo Período Académico</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Período
          </label>
          <input required name="name" type="text" placeholder="Ej. 2026-1" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Inicio (opcional)
          </label>
          <input name="start_date" type="date" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Fin (opcional)
          </label>
          <input name="end_date" type="date" className={inputClass} />
        </div>
      </div>
      <button
        disabled={loading}
        type="submit"
        className="mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50"
      >
        {loading ? 'Guardando...' : 'Agregar Período'}
      </button>
    </form>
  )
}

export function PeriodList({ periods }: { periods: Period[] }) {
  const showToast = useToast()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleToggle = async (period: Period) => {
    setLoadingId(period.id)
    const result = await setPeriodActive(period.id, !period.is_active)
    if (result.success) {
      showToast(
        `Período "${period.name}" ${period.is_active ? 'archivado' : 'reactivado'}.`,
        'success'
      )
    } else {
      showToast(result.error || 'No se pudo actualizar el período.', 'error')
    }
    setLoadingId(null)
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      {periods.length > 0 ? (
        <div className="divide-y divide-gray-50">
          {periods.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-6 py-4">
              <p className="font-bold text-gray-900">{p.name}</p>
              <div className="flex items-center gap-3">
                {!p.is_active && (
                  <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                    Archivado
                  </span>
                )}
                <button
                  disabled={loadingId === p.id}
                  onClick={() => handleToggle(p)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-50 bg-gray-50 text-gray-600 hover:bg-gray-100"
                >
                  {loadingId === p.id ? '...' : p.is_active ? 'Archivar' : 'Reactivar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-6 py-6 text-sm text-gray-400 italic text-center">
          Sin períodos registrados.
        </p>
      )}
    </div>
  )
}
