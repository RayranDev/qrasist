'use client'

import { useState } from 'react'
import { createUserAccount, deleteUserAccount } from '@/lib/actions/admin'

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

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Agregar Nuevo Usuario</h3>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre Completo</label>
          <input required name="name" type="text" placeholder="Ej. Juan Pérez" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Correo Electrónico</label>
          <input required name="email" type="email" placeholder="correo@test.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Contraseña</label>
          <input required name="password" type="text" placeholder="Min 6 caracteres" minLength={6} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Rol Inicial</label>
          <select name="role" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white">
            <option value="STUDENT">Estudiante</option>
            <option value="PROFESSOR">Profesor</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
        <div>
          <button disabled={loading} type="submit" className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            {loading ? 'Creando...' : '+ Crear Usuario'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function DeleteUserButton({ userId }: { userId: string }) {
  const handleDelete = async () => {
    if (confirm('¿Estás seguro? Se borrará permanentemente este usuario y toda su información.')) {
      const result = await deleteUserAccount(userId)
      if (!result.success) alert(result.error)
    }
  }

  return (
    <button onClick={handleDelete} className="ml-2 text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded">
      Borrar
    </button>
  )
}
