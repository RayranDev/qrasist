'use client'

import { useState } from 'react'
import { updateUserRole } from '@/lib/actions/admin'

interface Props {
  userId: string
  currentRole: 'ADMIN' | 'PROFESSOR' | 'STUDENT'
}

export default function RoleSelect({ userId, currentRole }: Props) {
  const [loading, setLoading] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as 'ADMIN' | 'PROFESSOR' | 'STUDENT'
    if (newRole === currentRole) return

    setLoading(true)
    const result = await updateUserRole(userId, newRole)
    if (!result.success) {
      alert(result.error)
    }
    setLoading(false)
  }

  return (
    <select
      value={currentRole}
      onChange={handleChange}
      disabled={loading}
      className={`text-xs font-semibold rounded-lg px-3 py-1.5 outline-none cursor-pointer border-2 transition ${
        currentRole === 'ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-100 hover:border-purple-200' :
        currentRole === 'PROFESSOR' ? 'bg-amber-50 text-amber-700 border-amber-100 hover:border-amber-200' :
        'bg-emerald-50 text-emerald-700 border-emerald-100 hover:border-emerald-200'
      }`}
    >
      <option value="STUDENT">Estudiante</option>
      <option value="PROFESSOR">Profesor</option>
      <option value="ADMIN">Administrador</option>
    </select>
  )
}
