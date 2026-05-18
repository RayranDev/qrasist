'use client'

import { useState } from 'react'
import { createSubject, deleteSubject } from '@/lib/actions/adminSubjects'

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

  const inputClass = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
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
          <button disabled={loading} type="submit" className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-md active:scale-95 flex items-center justify-center gap-2">
            {loading ? 'Guardando...' : 'Agregar Materia'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function DeleteSubjectButton({ subjectId }: { subjectId: string }) {
  const handleDelete = async () => {
    if (confirm('¿Estás seguro de eliminar esta materia? Se borrarán todas sus clases y asistencias.')) {
      const result = await deleteSubject(subjectId)
      if (!result.success) alert(result.error)
    }
  }

  return (
    <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Borrar Materia">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
    </button>
  )
}
