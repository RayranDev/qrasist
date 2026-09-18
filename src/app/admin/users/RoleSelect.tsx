'use client'

import { useState } from 'react'
import { updateUserRole } from '@/lib/actions/admin'
import { useToast } from '@/components/toast/ToastProvider'

interface Props {
  userId: string
  currentRole: 'ADMIN' | 'PROFESSOR' | 'STUDENT'
}

const ROLE_LABEL: Record<Props['currentRole'], string> = {
  ADMIN: 'Administrador',
  PROFESSOR: 'Docente',
  STUDENT: 'Estudiante',
}

export default function RoleSelect({ userId, currentRole }: Props) {
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as 'ADMIN' | 'PROFESSOR' | 'STUDENT'
    if (newRole === currentRole) return

    setLoading(true)
    const result = await updateUserRole(userId, newRole)
    if (result.success) {
      showToast(`Rol actualizado a ${ROLE_LABEL[newRole]}.`, 'success')
    } else {
      showToast(result.error || 'No se pudo actualizar el rol.', 'error')
    }
    setLoading(false)
  }

  return (
    <select
      value={currentRole}
      onChange={handleChange}
      disabled={loading}
      className="text-xs font-medium text-neutral-800 bg-white border border-neutral-200/90 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:border-neutral-300 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 transition-colors shadow-2xs disabled:opacity-50"
    >
      <option value="STUDENT">Estudiante</option>
      <option value="PROFESSOR">Docente</option>
      <option value="ADMIN">Administrador</option>
    </select>
  )
}
