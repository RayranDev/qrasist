'use client'

import { useMemo, useState } from 'react'
import { Paperclip, Clock, CheckCircle2, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/toast/ToastProvider'
import ReasonModal from '@/components/attendance/ReasonModal'
import { reviewJustification, getJustificationAttachmentUrl } from '@/lib/actions/justifications'

export interface JustificationRow {
  id: string
  reason: string
  attachment_path: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  subject: { id: string; name: string; code: string } | null
  session: { id: string; date: string } | null
  student: { name: string; student_code: string | null } | null
}

export default function JustificationsList({
  justifications,
  subjects,
}: {
  justifications: JustificationRow[]
  subjects: { id: string; name: string; code: string }[]
}) {
  const [items, setItems] = useState(justifications)
  const [subjectFilter, setSubjectFilter] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<JustificationRow | null>(null)
  const showToast = useToast()

  const filtered = subjectFilter ? items.filter((j) => j.subject?.id === subjectFilter) : items

  // PENDING primero (más recientes arriba), luego el resto ya revisado.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [filtered])

  const pendingCount = items.filter((j) => j.status === 'PENDING').length

  const handleViewAttachment = async (justificationId: string) => {
    const result = await getJustificationAttachmentUrl(justificationId)
    if (result.success && result.url) {
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } else {
      showToast(result.error || 'No se pudo abrir el adjunto.', 'error')
    }
  }

  const handleApprove = async (justification: JustificationRow) => {
    setBusyId(justification.id)
    const result = await reviewJustification({
      justificationId: justification.id,
      decision: 'APPROVED',
    })
    if (result.success) {
      setItems((prev) =>
        prev.map((j) => (j.id === justification.id ? { ...j, status: 'APPROVED' } : j))
      )
      showToast(
        `Justificación de ${justification.student?.name || 'estudiante'} aprobada.`,
        'success'
      )
    } else {
      showToast(result.error || 'No se pudo aprobar la justificación.', 'error')
    }
    setBusyId(null)
  }

  const handleReject = async (note: string) => {
    if (!rejectTarget) return
    setBusyId(rejectTarget.id)
    const result = await reviewJustification({
      justificationId: rejectTarget.id,
      decision: 'REJECTED',
      note,
    })
    if (result.success) {
      setItems((prev) =>
        prev.map((j) =>
          j.id === rejectTarget.id ? { ...j, status: 'REJECTED', review_note: note } : j
        )
      )
      showToast(
        `Justificación de ${rejectTarget.student?.name || 'estudiante'} rechazada.`,
        'success'
      )
      setRejectTarget(null)
    } else {
      showToast(result.error || 'No se pudo rechazar la justificación.', 'error')
    }
    setBusyId(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {subjects.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSubjectFilter('')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              subjectFilter === ''
                ? 'bg-navy-800 text-white border-navy-900/20'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Todas
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSubjectFilter(s.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                subjectFilter === s.id
                  ? 'bg-navy-800 text-white border-navy-900/20'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 font-medium">
        {pendingCount === 0
          ? 'No hay justificaciones pendientes.'
          : `${pendingCount} justificación${pendingCount > 1 ? 'es' : ''} pendiente${pendingCount > 1 ? 's' : ''}`}
      </p>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <p className="text-gray-400 italic">No hay justificaciones para mostrar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {sorted.map((j) => (
              <div key={j.id} className="px-5 py-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm">
                      {j.student?.name || 'Estudiante'}{' '}
                      <span className="text-xs font-mono text-gray-400">
                        {j.student?.student_code || '---'}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {j.subject?.name} ({j.subject?.code}) ·{' '}
                      {j.session?.date
                        ? new Date(j.session.date).toLocaleDateString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </p>
                  </div>
                  <StatusBadge status={j.status} />
                </div>

                <p className="text-sm text-gray-700 bg-gray-50/80 rounded-xl px-3 py-2">
                  {j.reason}
                </p>

                {j.review_note && (
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold">Nota de revisión: </span>
                    {j.review_note}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {j.attachment_path && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      leftIcon={<Paperclip className="w-3.5 h-3.5" />}
                      onClick={() => handleViewAttachment(j.id)}
                    >
                      Ver adjunto
                    </Button>
                  )}

                  {j.status === 'PENDING' && (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        isLoading={busyId === j.id}
                        onClick={() => handleApprove(j)}
                      >
                        Aprobar
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={busyId === j.id}
                        onClick={() => setRejectTarget(j)}
                      >
                        Rechazar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rejectTarget && (
        <ReasonModal
          title="Rechazar justificación"
          description={`${rejectTarget.student?.name || 'Estudiante'} · ${rejectTarget.subject?.name || ''}`}
          confirmLabel="Rechazar"
          confirmVariant="danger"
          loading={busyId === rejectTarget.id}
          onCancel={() => setRejectTarget(null)}
          onConfirm={handleReject}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: JustificationRow['status'] }) {
  if (status === 'PENDING') {
    return (
      <Badge variant="warning" size="sm">
        <Clock className="w-3 h-3" />
        Pendiente
      </Badge>
    )
  }
  if (status === 'APPROVED') {
    return (
      <Badge variant="success" size="sm">
        <CheckCircle2 className="w-3 h-3" />
        Aprobada
      </Badge>
    )
  }
  return (
    <Badge variant="danger" size="sm">
      <X className="w-3 h-3" />
      Rechazada
    </Badge>
  )
}
