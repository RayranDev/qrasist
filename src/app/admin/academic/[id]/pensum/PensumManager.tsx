'use client'

import { useState } from 'react'
import { assignSubjectToCareer, removeSubjectFromCareer } from '@/lib/actions/academic'
import { useToast } from '@/components/toast/ToastProvider'

const inputClass =
  'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm'

interface Subject {
  id: string
  name: string
  code: string
}

interface PensumEntry {
  id: string
  level: number | null
  subject: {
    id: string
    name: string
    code: string
    period: { name: string } | null
  }
}

export function AssignSubjectForm({
  careerId,
  availableSubjects,
}: {
  careerId: string
  availableSubjects: Subject[]
}) {
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const subjectId = formData.get('subject_id') as string
    const levelRaw = formData.get('level') as string
    const level = levelRaw ? parseInt(levelRaw, 10) : null

    const result = await assignSubjectToCareer(subjectId, careerId, level)
    if (result.success) {
      ;(e.target as HTMLFormElement).reset()
      showToast('Materia asignada al pénsum.', 'success')
    } else {
      showToast(result.error || 'No se pudo asignar la materia.', 'error')
    }
    setLoading(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6"
    >
      <h3 className="text-lg font-bold text-gray-900 mb-4">Agregar Materia al Pénsum</h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Materia
          </label>
          <select
            required
            name="subject_id"
            className={`${inputClass} appearance-none cursor-pointer`}
          >
            <option value="">Selecciona una materia</option>
            {availableSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Nivel
          </label>
          <input
            required
            name="level"
            type="number"
            min={1}
            max={20}
            placeholder="Ej. 1"
            className={inputClass}
          />
        </div>
        <button
          disabled={loading || availableSubjects.length === 0}
          type="submit"
          className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50"
        >
          {loading ? 'Guardando...' : 'Agregar'}
        </button>
      </div>
      {availableSubjects.length === 0 && (
        <p className="text-xs text-gray-400 mt-3 italic">
          Todas las materias activas ya están en el pénsum de esta carrera.
        </p>
      )}
    </form>
  )
}

export function PensumByLevel({ careerId, entries }: { careerId: string; entries: PensumEntry[] }) {
  const showToast = useToast()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleRemove = async (entry: PensumEntry) => {
    setLoadingId(entry.id)
    const result = await removeSubjectFromCareer(entry.id, careerId)
    if (result.success) {
      showToast(`"${entry.subject.name}" quitada del pénsum.`, 'success')
    } else {
      showToast(result.error || 'No se pudo quitar la materia.', 'error')
    }
    setLoadingId(null)
  }

  const levels = Array.from(new Set(entries.map((e) => e.level ?? 0))).sort((a, b) => a - b)

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">
        <p className="text-gray-400 italic">Esta carrera todavía no tiene materias en el pénsum.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {levels.map((level) => (
        <div
          key={level}
          className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
            <h3 className="font-black text-gray-900">
              {level === 0 ? 'Sin nivel asignado' : `Nivel ${level}`}
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {entries
              .filter((e) => (e.level ?? 0) === level)
              .map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-6 py-3.5">
                  <div>
                    <p className="font-semibold text-gray-800">
                      {entry.subject.code} — {entry.subject.name}
                    </p>
                    {entry.subject.period && (
                      <p className="text-xs text-gray-400">Período: {entry.subject.period.name}</p>
                    )}
                  </div>
                  <button
                    disabled={loadingId === entry.id}
                    onClick={() => handleRemove(entry)}
                    className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                  >
                    {loadingId === entry.id ? '...' : 'Quitar'}
                  </button>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
