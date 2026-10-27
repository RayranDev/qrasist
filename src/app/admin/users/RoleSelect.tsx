'use client'

import { useState } from 'react'
import { updateUserRole } from '@/lib/actions/admin'
import { useToast } from '@/components/toast/ToastProvider'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { ROLE_LABEL, type UserRole } from '@/components/ui/roleMeta'

interface Props {
  userId: string
  currentRole: UserRole
}

export default function RoleSelect({ userId, currentRole }: Props) {
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as UserRole
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
    <div className="inline-flex items-center gap-2">
      <RoleBadge role={currentRole} variant="compact" />
      <select
        value={currentRole}
        onChange={handleChange}
        disabled={loading}
        aria-label="Rol del usuario"
        className="text-xs font-medium text-neutral-800 bg-white border border-neutral-200/90 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:border-neutral-300 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 transition-colors shadow-2xs disabled:opacity-50"
      >
        <option value="STUDENT">{ROLE_LABEL.STUDENT}</option>
        <option value="PROFESSOR">{ROLE_LABEL.PROFESSOR}</option>
        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
      </select>
    </div>
  )
}
