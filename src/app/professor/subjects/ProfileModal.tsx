'use client'

import { useState } from 'react'
import { updateOwnProfile } from '@/lib/actions/profile'

export default function ProfileModal({ currentName }: { currentName: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(currentName)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const handleSave = async () => {
    setLoading(true)
    setFeedback(null)
    const result = await updateOwnProfile({
      name: name !== currentName ? name : undefined,
      password: password.trim() !== '' ? password : undefined,
    })
    if (result.success) {
      setFeedback({ type: 'success', msg: 'Perfil actualizado correctamente.' })
      setPassword('')
    } else {
      setFeedback({ type: 'error', msg: result.error || 'Error desconocido.' })
    }
    setLoading(false)
  }

  const inputClass = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition"
        title="Editar perfil"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-gray-900 mb-5">Mi Perfil</h3>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre Completo</label>
                <input value={name} onChange={e => setName(e.target.value)} type="text" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nueva Contraseña</label>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  placeholder="Dejar en blanco para no cambiar"
                  className={inputClass}
                />
              </div>
            </div>

            {feedback && (
              <p className={`text-sm font-semibold mb-4 px-3 py-2 rounded-lg ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {feedback.msg}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setOpen(false); setFeedback(null) }}
                disabled={loading}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition"
              >
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
