'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { resetPassword } from './actions'

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
    <div className="w-full space-y-1.5">
      <label className="block text-xs font-semibold text-gray-700 tracking-wide">{label}</label>
      <div className="relative flex items-center">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          minLength={6}
          required
          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-10 text-sm font-medium text-gray-900 placeholder:text-gray-400 transition-all duration-150 min-h-[44px] hover:border-gray-300 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3.5 flex items-center text-gray-400 hover:text-gray-600 transition"
          tabIndex={-1}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const result = await resetPassword(password)
    setLoading(false)

    if (!result.success) {
      setError(result.error || 'No se pudo actualizar la contraseña.')
      return
    }

    setDone(true)
    router.push(
      '/login?info=' + encodeURIComponent('Tu contraseña se actualizó. Iniciá sesión con la nueva.')
    )
  }

  if (done) {
    return (
      <p className="text-center text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-xl p-4">
        Contraseña actualizada. Redirigiendo al inicio de sesión…
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200/80 text-red-700 rounded-xl text-xs font-semibold shadow-xs animate-in fade-in duration-200">
          {error}
        </div>
      )}

      <PasswordField
        label="Nueva contraseña"
        value={password}
        onChange={setPassword}
        show={showPassword}
        onToggleShow={() => setShowPassword((v) => !v)}
        placeholder="Mín. 6 caracteres"
      />
      <PasswordField
        label="Confirmar contraseña"
        value={confirmPassword}
        onChange={setConfirmPassword}
        show={showConfirm}
        onToggleShow={() => setShowConfirm((v) => !v)}
        placeholder="Repetí la nueva contraseña"
      />

      <Button type="submit" variant="primary" size="lg" className="w-full mt-2" isLoading={loading}>
        Actualizar contraseña
      </Button>
    </form>
  )
}
