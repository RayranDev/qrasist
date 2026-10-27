'use client'

import { useState } from 'react'
import { getRoleChangeImpact, updateUserRole } from '@/lib/actions/admin'
import { useToast } from '@/components/toast/ToastProvider'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { ROLE_LABEL, type UserRole } from '@/components/ui/roleMeta'
import { buildRoleChangeWarning, hasRoleChangeImpact } from '@/lib/admin/roleChangeImpact'
import { countOf } from '@/lib/utils/plural'
import RoleChangeConfirmDialog from './RoleChangeConfirmDialog'

interface Props {
  userId: string
  currentRole: UserRole
  /** Shown in the confirmation warning. */
  userName?: string
  /** Called after a successful change to PROFESSOR, to offer assigning subjects. */
  onPromotedToProfessor?: (user: { id: string; name: string }) => void
}

export default function RoleSelect({
  userId,
  currentRole,
  userName,
  onPromotedToProfessor,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<{ newRole: UserRole; paragraphs: string[] } | null>(null)
  const showToast = useToast()

  const applyChange = async (newRole: UserRole, confirmed: boolean) => {
    setLoading(true)
    const result = await updateUserRole(userId, newRole, confirmed ? { unenroll: true } : undefined)
    setLoading(false)
    setPending(null)
    if (result.success) {
      const removed = result.enrollmentsRemoved ?? 0
      const unassigned = result.subjectsUnassigned ?? 0
      const details = [
        removed > 0 ? `Se desmatriculó de ${countOf(removed, 'materia')}.` : '',
        unassigned > 0 ? `Se desvinculó de ${countOf(unassigned, 'materia')} como docente.` : '',
      ].filter(Boolean)
      showToast([`Rol actualizado a ${ROLE_LABEL[newRole]}.`, ...details].join(' '), 'success')
      if (newRole === 'PROFESSOR') {
        onPromotedToProfessor?.({ id: userId, name: userName || 'Este usuario' })
      }
    } else {
      showToast(result.error || 'No se pudo actualizar el rol.', 'error')
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as UserRole
    if (newRole === currentRole) return

    setLoading(true)
    const impactResult = await getRoleChangeImpact(userId, newRole)
    if (!impactResult.success) {
      setLoading(false)
      showToast(impactResult.error || 'No se pudo revisar el cambio de rol.', 'error')
      return
    }

    // The <select> is controlled by `currentRole`, so cancelling the dialog just
    // leaves it showing the role that is really in effect.
    if (hasRoleChangeImpact(impactResult.impact)) {
      setLoading(false)
      setPending({
        newRole,
        paragraphs: buildRoleChangeWarning({
          userName: userName || 'Este usuario',
          newRole,
          impact: impactResult.impact,
        }),
      })
      return
    }

    await applyChange(newRole, false)
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

      {pending && (
        <RoleChangeConfirmDialog
          newRole={pending.newRole}
          paragraphs={pending.paragraphs}
          loading={loading}
          onConfirm={() => applyChange(pending.newRole, true)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
