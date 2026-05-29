'use client'

import { useState } from 'react'
import { createSubject, deleteSubject, updateSubject, reactivateSubject } from '@/lib/actions/adminSubjects'

const inputClass = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm"

export function CreateSubjectForm({ professors }: { professors: any[] }) {
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await createSubject(formData)
    if (result.success) {
      (e.target as HTMLFormElement).reset()
    } else {
      alert(result.error)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">Crear Nueva Materia</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 items-end">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Nombre</label>
          <input required name="name" type="text" placeholder="Ej. Cálculo I" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Código</label>
          <input required name="code" type="text" placeholder="Ej. CALC-101" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Profesor Asignado</label>
          <select name="professor_id" className={`${inputClass} appearance-none cursor-pointer`}>
            <option value="">Sin asignar</option>
            {professors.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <button disabled={loading} type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-md active:scale-95 flex items-center justify-center gap-2">
            {loading ? 'Guardando...' : 'Agregar Materia'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function SubjectActionButtons({ subject, professors }: { subject: any, professors: any[] }) {
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(subject.name)
  const [code, setCode] = useState(subject.code)
  const [profId, setProfId] = useState(subject.professor_id || '')

  const isActive = subject.is_active !== false

  const handleDeactivate = async () => {
    if (!confirm(`¿Desactivar "${subject.name}"? La materia quedará archivada y no estará visible para docentes ni estudiantes. Podrás reactivarla cuando quieras.`)) return
    setLoading(true)
    const result = await deleteSubject(subject.id)
    if (!result.success) alert(result.error)
    setLoading(false)
  }

  const handleReactivate = async () => {
    setLoading(true)
    const result = await reactivateSubject(subject.id)
    if (!result.success) alert(result.error)
    setLoading(false)
  }

  const handleSave = async () => {
    setLoading(true)
    const result = await updateSubject(subject.id, {
      name,
      code,
      professor_id: profId === '' ? null : profId
    })
    if (result.success) {
      setIsEditing(false)
    } else {
      alert(result.error)
    }
    setLoading(false)
  }

  if (isEditing) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Editar Materia</h3>
          <div className="space-y-4 mb-6 text-left">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nombre</label>
              <input value={name} onChange={e => setName(e.target.value)} type="text" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Código</label>
              <input value={code} onChange={e => setCode(e.target.value)} type="text" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Profesor Asignado</label>
              <select value={profId} onChange={e => setProfId(e.target.value)} className={`${inputClass} appearance-none cursor-pointer`}>
                <option value="">Sin asignar</option>
                {professors.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button disabled={loading} onClick={() => setIsEditing(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition">
              Cancelar
            </button>
            <button disabled={loading} onClick={handleSave} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition">
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 relative z-10">
      {isActive ? (
        <>
          <button onClick={() => setIsEditing(true)} disabled={loading} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition" title="Editar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={handleDeactivate} disabled={loading} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition" title="Archivar materia">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
          </button>
        </>
      ) : (
        <button onClick={handleReactivate} disabled={loading} className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50" title="Reactivar materia">
          {loading ? '...' : 'Reactivar'}
        </button>
      )}
    </div>
  )
}
