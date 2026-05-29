'use client'

import { useState, useEffect } from 'react'
import { createUserAccount, deleteUserAccount, updateUserAccount, reactivateUser, getStudentAttendanceHistory } from '@/lib/actions/admin'

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

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

export function StudentHistoryModal({ userId, studentName, onClose }: {
  userId: string
  studentName: string
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStudentAttendanceHistory(userId).then(result => {
      if (result.success) {
        setRecords(result.data || [])
      } else {
        setError(result.error || 'Error al cargar el historial')
      }
      setLoading(false)
    })
  }, [userId])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Historial de Asistencias</h3>
            <p className="text-sm text-gray-500 mt-0.5">{studentName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
          ) : error ? (
            <div className="text-center py-10 text-red-500 text-sm">{error}</div>
          ) : records.length === 0 ? (
            <div className="text-center py-10 text-gray-400 italic text-sm">Sin asistencias registradas</div>
          ) : (
            <div className="space-y-2">
              {records.map((record: any) => (
                <div key={record.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">{record.session?.subject?.name}</div>
                    <div className="text-xs text-emerald-600 font-medium">{record.session?.subject?.code}</div>
                  </div>
                  <div className="text-xs text-gray-500 font-medium whitespace-nowrap">
                    {new Date(record.scanned_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {' '}
                    {new Date(record.scanned_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
          <p className="text-xs text-gray-400">
            {records.length} asistencia{records.length !== 1 ? 's' : ''} registrada{records.length !== 1 ? 's' : ''}
          </p>
          <button onClick={onClose} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export function CreateUserForm() {
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState<'STUDENT' | 'PROFESSOR' | 'ADMIN'>('STUDENT')
  const [showPassword, setShowPassword] = useState(false)

  const isStudent = role === 'STUDENT'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await createUserAccount(formData)
    if (result.success) {
      (e.target as HTMLFormElement).reset()
      setRole('STUDENT')
      setShowPassword(false)
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
          <input required name="email" type="email" placeholder="correo@urepublicana.edu.co" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Contraseña</label>
          <div className="relative">
            <input
              required
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min 6 caracteres"
              minLength={6}
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">
            {isStudent ? 'Código (12 dígitos)' : 'Identificación'}
          </label>
          {isStudent ? (
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
          ) : (
            <input
              required
              name="student_code"
              type="text"
              inputMode="numeric"
              placeholder="Solo números"
              className={inputClass}
              onInput={e => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/\D/g, '') }}
            />
          )}
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">Rol Inicial</label>
          <select
            name="role"
            value={role}
            onChange={e => setRole(e.target.value as 'STUDENT' | 'PROFESSOR' | 'ADMIN')}
            className={`${inputClass} appearance-none cursor-pointer`}
          >
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

export function ActionButtons({ userId, currentName, currentCode, currentRole, isActive }: {
  userId: string
  currentName: string
  currentCode?: string
  currentRole: string
  isActive: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(currentName)
  const [code, setCode] = useState(currentCode || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isStudent = currentRole === 'STUDENT'

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
      setShowPassword(false)
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
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {isStudent ? 'Código Institucional (12 dígitos)' : 'Identificación'}
              </label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, isStudent ? 12 : 20))}
                type="text"
                inputMode="numeric"
                maxLength={isStudent ? 12 : 20}
                placeholder={isStudent ? '12 dígitos numéricos' : 'Solo números'}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nueva Contraseña (Opcional)</label>
              <div className="relative">
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Dejar en blanco para no cambiar"
                  className={`${inputClass} pr-8`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              disabled={loading}
              onClick={() => { setIsEditing(false); setPassword(''); setShowPassword(false) }}
              className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition"
            >
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
