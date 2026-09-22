'use client'

import { useState } from 'react'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import ReasonModal from './ReasonModal'
import { markAttendanceManually, removeAttendanceMark } from '@/lib/actions/attendanceManual'
import { useToast } from '@/components/toast/ToastProvider'

type PendingAction = { kind: 'PRESENT' | 'LATE' } | { kind: 'REMOVE' } | null

interface AttendanceRowActionsProps {
  sessionId: string
  studentId: string
  attendanceId: string | null
  currentStatus: 'PRESENT' | 'LATE' | null
  onChanged: () => void
}

export default function AttendanceRowActions({
  sessionId,
  studentId,
  attendanceId,
  currentStatus,
  onChanged,
}: AttendanceRowActionsProps) {
  const [pending, setPending] = useState<PendingAction>(null)
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleConfirm = async (reason: string) => {
    if (!pending) return
    setLoading(true)
    const result =
      pending.kind === 'REMOVE'
        ? await removeAttendanceMark({ attendanceId: attendanceId as string, reason })
        : await markAttendanceManually({ sessionId, studentId, status: pending.kind, reason })
    setLoading(false)

    if (result.success) {
      showToast('Asistencia actualizada.', 'success')
      setPending(null)
      onChanged()
    } else {
      showToast(result.error || 'No se pudo actualizar la asistencia.', 'error')
    }
  }

  return (
    <>
      {pending && (
        <ReasonModal
          title={
            pending.kind === 'REMOVE'
              ? 'Quitar asistencia'
              : pending.kind === 'LATE'
                ? 'Marcar como tarde'
                : 'Marcar presente'
          }
          description={
            pending.kind === 'REMOVE'
              ? 'El registro se elimina y el estudiante vuelve a quedar sin registro para esta sesión.'
              : undefined
          }
          confirmLabel={pending.kind === 'REMOVE' ? 'Quitar' : 'Confirmar'}
          confirmVariant={pending.kind === 'REMOVE' ? 'danger' : 'primary'}
          loading={loading}
          onCancel={() => setPending(null)}
          onConfirm={handleConfirm}
        />
      )}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          aria-label="Marcar presente"
          title="Marcar presente"
          onClick={() => setPending({ kind: 'PRESENT' })}
          disabled={currentStatus === 'PRESENT'}
          className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:pointer-events-none transition"
        >
          <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Marcar tarde"
          title="Marcar tarde"
          onClick={() => setPending({ kind: 'LATE' })}
          disabled={currentStatus === 'LATE'}
          className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 disabled:pointer-events-none transition"
        >
          <Clock3 className="w-4 h-4" strokeWidth={2} />
        </button>
        {attendanceId && (
          <button
            type="button"
            aria-label="Quitar asistencia"
            title="Quitar asistencia"
            onClick={() => setPending({ kind: 'REMOVE' })}
            className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition"
          >
            <XCircle className="w-4 h-4" strokeWidth={2} />
          </button>
        )}
      </div>
    </>
  )
}
