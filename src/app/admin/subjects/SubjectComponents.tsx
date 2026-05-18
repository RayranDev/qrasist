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

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Crear Nueva Materia</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
          <input required name="name" type="text" placeholder="Ej. Cálculo I" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
          <input required name="code" type="text" placeholder="Ej. CALC-101" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Profesor Asignado</label>
          <select name="professor_id" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500">
            <option value="">Sin asignar</option>
            {professors.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <button disabled={loading} type="submit" className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            {loading ? 'Guardando...' : '+ Agregar Materia'}
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
    <button onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700 p-1 bg-red-50 rounded">
      Eliminar
    </button>
  )
}
