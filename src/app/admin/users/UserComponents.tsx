'use client'

import { useState } from 'react'
import { createUserAccount, deleteUserAccount, updateUserAccount, reactivateUser } from '@/lib/actions/admin'

function DeactivateConfirmModal({ userName, onConfirm, onCancel, loading }: {
  userName: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  const [typed, setTyped] = useState('')
  const match = typed === userName

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Desactivar usuario</h3>
        <p className="text-sm text-gray-500 text-center mb-1">
          El usuario no podrá iniciar sesión. Sus datos e historial se conservan.
        </p>
        <p className="text-sm text-gray-500 text-center mb-5">
          Escribe <span className="font-bold text-gray-800">{userName}</span> para confirmar.
        </p>
        <input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          type="text"
          placeholder="Escribe el nombre exacto..."
          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all mb-4"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!match || loading}
            className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Desactivando...' : 'Desactivar'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

  const inputClass = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm"

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
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
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Código (12 dígitos)</label>
          <input
            required
            name="student_code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{12}"
            minLength={12}
            maxLength={12}
            placeholder="12 dígitos numéricos"
            title="El código debe tener exactamente 12 dígitos numéricos"
            className={inputClass}
            onInput={e => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 12) }}
          />
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
          <button disabled={loading} type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-md active:scale-95 flex items-center justify-center gap-2">
            {loading ? 'Creando...' : 'Crear Usuario'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function ActionButtons({ userId, currentName, currentCode, isActive }: {
  userId: string
  currentName: string
  currentCode?: string
  isActive: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(currentName)
  const [code, setCode] = useState(currentCode || '')
  const [password, setPassword] = useState('')

  const handleDeactivate = async () => {
    setLoading(true)
    const result = await deleteUserAccount(userId)
    if (!result.success) alert(result.error)
    setLoading(false)
    setIsDeactivating(false)
  }

  const handleReactivate = async () => {
    setLoading(true)
    const result = await reactivateUser(userId)
    if (!result.success) alert(result.error)
    setLoading(false)
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

  const inputClass = "w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 transition-all"

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
              <label className="block text-xs font-bold text-gray-700 mb-1">Código Institucional (12 dígitos)</label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 12))}
                type="text"
                inputMode="numeric"
                maxLength={12}
                placeholder="12 dígitos numéricos"
                className={inputClass}
              />
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
            <button disabled={loading} onClick={handleSave} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition">
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {isDeactivating && (
        <DeactivateConfirmModal
          userName={currentName}
          onConfirm={handleDeactivate}
          onCancel={() => setIsDeactivating(false)}
          loading={loading}
        />
      )}
      <div className="flex items-center gap-2">
        {isActive ? (
          <>
            <button onClick={() => setIsEditing(true)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition" title="Editar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button onClick={() => setIsDeactivating(true)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition" title="Desactivar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </button>
          </>
        ) : (
          <button
            onClick={handleReactivate}
            disabled={loading}
            className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50"
            title="Reactivar usuario"
          >
            {loading ? '...' : 'Reactivar'}
          </button>
        )}
      </div>
    </>
  )
}
