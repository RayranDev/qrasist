'use client'

import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ROLE_LABEL, type UserRole } from '@/components/ui/roleMeta'
import DialogShell from './DialogShell'

/**
 * Warning shown before a role change that removes something (enrollments, pending
 * requests, taught subjects). Cancel is the default focus: the confirm action is
 * destructive.
 */
export default function RoleChangeConfirmDialog({
  newRole,
  paragraphs,
  loading,
  onConfirm,
  onCancel,
}: {
  newRole: UserRole
  paragraphs: string[]
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <DialogShell labelledBy="role-change-title" onClose={onCancel} closeDisabled={loading}>
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <TriangleAlert className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id="role-change-title" className="text-base font-bold text-neutral-900">
              Confirmar cambio de rol
            </h3>
            <div className="mt-2 space-y-2 text-sm text-neutral-700">
              {paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
              <p className="text-xs text-neutral-600">
                Esta acción queda registrada en la auditoría.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-neutral-100">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            data-autofocus
          >
            Cancelar
          </Button>
          <Button type="button" variant="danger" size="sm" isLoading={loading} onClick={onConfirm}>
            {`Sí, cambiar a ${ROLE_LABEL[newRole]}`}
          </Button>
        </div>
      </div>
    </DialogShell>
  )
}
