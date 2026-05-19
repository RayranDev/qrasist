'use client'

import { useState } from 'react'
import { createUserAccount, deleteUserAccount, updateUserAccount } from '@/lib/actions/admin'

export function CreateUserForm() {
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await createUserAccount(formData)
    
    if (result.success) {
      (e.target as HTMLFormElement).reset()
    } else {
      alert(result.error)
    }
    setLoading(false)
  }

  // Clases compartidas para inputs mejorados
  const inputClass = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">Agregar Nuevo Usuario</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-5 items-end">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Nombre Completo</label>
          <input required name="name" type="text" placeholder="Ej. Juan Pérez" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Correo</label>
          <input required name="email" type="email" placeholder="correo@test.com" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Contraseña</label>
          <input required name="password" type="text" placeholder="Min 6 caracteres" minLength={6} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Código (ID)</label>
          <input required name="student_code" type="text" placeholder="Ej. 10234" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Rol Inicial</label>
          <select name="role" className={`${inputClass} appearance-none cursor-pointer`}>
            <option value="STUDENT">Estudiante</option>
            <option value="PROFESSOR">Profesor</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
        <div>
          <button disabled={loading} type="submit" className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-md active:scale-95 flex items-center justify-center gap-2">
            {loading ? 'Creando...' : 'Crear Usuario'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function ActionButtons({ userId, currentName, currentCode }: { userId: string, currentName: string, currentCode?: string }) {
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(currentName)
  const [code, setCode] = useState(currentCode || '')
  const [password, setPassword] = useState('')

  const handleDelete = async () => {
    if (confirm(`¿Estás seguro de borrar a ${currentName}? Se perderá toda su información.`)) {
      const result = await deleteUserAccount(userId)
      if (!result.success) alert(result.error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    const result = await updateUserAccount(userId, { 
      name: name !== currentName ? name : undefined,
      student_code: code !== currentCode ? code : undefined,
      password: password.trim() !== '' ? password : undefined
    })
    
    if (result.success) {
      setIsEditing(false)
      setPassword('')
    } else {
      alert(result.error)
    }
    setLoading(false)
  }

  const inputClass = "w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-indigo-500 transition-all"

  if (isEditing) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200 text-left">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Editar Usuario</h3>
          
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nombre Completo</label>
              <input value={name} onChange={e => setName(e.target.value)} type="text" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Código Institucional</label>
              <input value={code} onChange={e => setCode(e.target.value)} type="text" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nueva Contraseña (Opcional)</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="text" placeholder="Dejar en blanco para no cambiar" className={inputClass} />
            </div>
          </div>

          <div className="flex gap-3">
            <button disabled={loading} onClick={() => setIsEditing(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition">
              Cancelar
            </button>
            <button disabled={loading} onClick={handleSave} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setIsEditing(true)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Editar">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      </button>
      <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Borrar">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>
  )
}
