'use client'

import { useState, useRef } from 'react'
import { updateOwnProfile } from '@/lib/actions/profile'
import { User, Eye, EyeOff } from 'lucide-react'

const inputClass =
  'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all'

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          className={`${inputClass} pr-10`}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
          tabIndex={-1}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ProfileModal({
  currentFirstName,
  currentLastName,
}: {
  currentFirstName: string
  currentLastName: string
}) {
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState(currentFirstName)
  const [lastName, setLastName] = useState(currentLastName)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const signOutFormRef = useRef<HTMLFormElement>(null)

  const wantsPasswordChange = newPassword.trim() !== '' || currentPassword.trim() !== ''

  const resetPasswordFields = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowCurrent(false)
    setShowNew(false)
    setShowConfirm(false)
  }

  const handleSave = async () => {
    if (wantsPasswordChange) {
      if (!currentPassword) {
        setFeedback({ type: 'error', msg: 'Ingresá tu contraseña actual para poder cambiarla.' })
        return
      }
      if (newPassword !== confirmPassword) {
        setFeedback({ type: 'error', msg: 'La nueva contraseña y su confirmación no coinciden.' })
        return
      }
    }

    setLoading(true)
    setFeedback(null)
    const result = await updateOwnProfile({
      first_name: firstName !== currentFirstName ? firstName : undefined,
      last_name: lastName !== currentLastName ? lastName : undefined,
      current_password: wantsPasswordChange ? currentPassword : undefined,
      password: wantsPasswordChange ? newPassword : undefined,
    })
    if (result.success) {
      if (wantsPasswordChange) {
        // Supabase invalida la sesion actual (no solo las de otros
        // dispositivos) al cambiar la contraseña por API de admin --
        // en vez de dejar que la proxima navegacion rebote sola y sin
        // explicacion a /login, se cierra sesion a proposito con un
        // mensaje claro de por que.
        setFeedback({
          type: 'success',
          msg: 'Contraseña actualizada. Cerrando sesión para que vuelvas a entrar con la nueva…',
        })
        setTimeout(() => signOutFormRef.current?.requestSubmit(), 1200)
      } else {
        setFeedback({ type: 'success', msg: 'Perfil actualizado correctamente.' })
      }
      resetPasswordFields()
    } else {
      setFeedback({ type: 'error', msg: result.error || 'Error desconocido.' })
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 transition"
        title="Editar perfil"
      >
        <User className="w-4 h-4" strokeWidth={2} />
        Mi Perfil
      </button>

      <form ref={signOutFormRef} action="/auth/signout" method="post" className="hidden">
        <input
          type="hidden"
          name="message"
          value="Tu contraseña se actualizó. Iniciá sesión de nuevo con la nueva."
        />
      </form>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-gray-900 mb-5">Mi Perfil</h3>

            <div className="space-y-4 mb-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nombres</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    type="text"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Apellidos</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    type="text"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 mt-3">
                  Cambiar contraseña (opcional)
                </p>
                <div className="space-y-3">
                  <PasswordField
                    label="Contraseña Actual"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    show={showCurrent}
                    onToggleShow={() => setShowCurrent((v) => !v)}
                    placeholder="Requerida para cambiarla"
                  />
                  <PasswordField
                    label="Nueva Contraseña"
                    value={newPassword}
                    onChange={setNewPassword}
                    show={showNew}
                    onToggleShow={() => setShowNew((v) => !v)}
                    placeholder="Mín. 6 caracteres"
                  />
                  <PasswordField
                    label="Confirmar Nueva Contraseña"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    show={showConfirm}
                    onToggleShow={() => setShowConfirm((v) => !v)}
                    placeholder="Repetí la nueva contraseña"
                  />
                </div>
              </div>
            </div>

            {feedback && (
              <p
                className={`text-sm font-semibold mb-4 px-3 py-2 rounded-lg ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}
              >
                {feedback.msg}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setOpen(false)
                  setFeedback(null)
                  resetPasswordFields()
                }}
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
