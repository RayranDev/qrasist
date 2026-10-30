'use client'

import { useMemo, useState } from 'react'
import { Paperclip, Clock, CheckCircle2, X, FileCheck2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/toast/ToastProvider'
import ReasonModal from '@/components/attendance/ReasonModal'
import ConfirmModal from '@/components/ConfirmModal'
import {
  reviewJustification,
  changeJustificationDecision,
  bulkApproveJustifications,
  getJustificationAttachmentUrl,
} from '@/lib/actions/justifications'
import { MAX_BULK_APPROVE } from '@/lib/justifications/bulk'
import { countOf } from '@/lib/utils/plural'
import ChangeDecisionModal, { type DecisionTarget } from './ChangeDecisionModal'
import { justificationRowStyle } from './rowStyle'

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

const DECISION_TOAST: Record<DecisionTarget, string> = {
  APPROVED: 'aprobada',
  REJECTED: 'rechazada',
  PENDING: 'pendiente',
}

export default function JustificationsList({
  justifications,
  subjects,
  canReview,
  emptyDescription,
}: {
  justifications: JustificationRow[]
  subjects: { id: string; name: string; code: string }[]
  /** Solo coordinación (ADMIN) revisa; el profesor ve el estado en modo lectura. */
  canReview: boolean
  emptyDescription?: string
}) {
  const [items, setItems] = useState(justifications)
  const [subjectFilter, setSubjectFilter] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<JustificationRow | null>(null)
  const [changeTarget, setChangeTarget] = useState<JustificationRow | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingBulk, setConfirmingBulk] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
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

  // La selección masiva solo cuenta lo que se ve: filas PENDING del filtro
  // actual. Así nunca se aprueba algo oculto por el filtro de materia.
  const selectablePending = canReview ? sorted.filter((j) => j.status === 'PENDING') : []
  const selectedIds = selectablePending.filter((j) => selected.has(j.id)).map((j) => j.id)
  const allSelected =
    selectablePending.length > 0 && selectedIds.length === selectablePending.length

  const toggleSelected = (id: string) => {
    if (!selected.has(id) && selectedIds.length >= MAX_BULK_APPROVE) {
      showToast(`Puedes seleccionar máximo ${MAX_BULK_APPROVE} justificaciones a la vez.`, 'error')
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set())
      return
    }
    const ids = selectablePending.slice(0, MAX_BULK_APPROVE).map((j) => j.id)
    setSelected(new Set(ids))
    if (selectablePending.length > MAX_BULK_APPROVE) {
      showToast(`Se seleccionaron las primeras ${MAX_BULK_APPROVE}.`, 'info')
    }
  }

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

  const handleChangeDecision = async (to: DecisionTarget, reason: string) => {
    if (!changeTarget) return
    setBusyId(changeTarget.id)
    const result = await changeJustificationDecision({
      justificationId: changeTarget.id,
      to,
      reason,
    })
    if (result.success) {
      // Mismo efecto que el servidor: PENDING deja la fila como no revisada.
      setItems((prev) =>
        prev.map((j) =>
          j.id === changeTarget.id
            ? to === 'PENDING'
              ? { ...j, status: to, review_note: null, reviewed_at: null }
              : { ...j, status: to, review_note: reason, reviewed_at: new Date().toISOString() }
            : j
        )
      )
      showToast(
        `Decisión de ${changeTarget.student?.name || 'estudiante'} actualizada a ${DECISION_TOAST[to]}.`,
        'success'
      )
      setChangeTarget(null)
    } else {
      showToast(result.error || 'No se pudo cambiar la decisión.', 'error')
    }
    setBusyId(null)
  }

  const handleBulkApprove = async () => {
    setBulkBusy(true)
    const result = await bulkApproveJustifications(selectedIds)
    setConfirmingBulk(false)
    setBulkBusy(false)

    if (!result.success) {
      showToast(result.error || 'No se pudieron aprobar las justificaciones.', 'error')
      return
    }

    const approved = new Set(result.approved)
    if (approved.size > 0) {
      setItems((prev) => prev.map((j) => (approved.has(j.id) ? { ...j, status: 'APPROVED' } : j)))
      showToast(
        `${countOf(approved.size, 'justificación aprobada', 'justificaciones aprobadas')}.`,
        'success'
      )
    }
    if (result.failures.length > 0) {
      showToast(
        `${countOf(result.failures.length, 'justificación no se pudo aprobar', 'justificaciones no se pudieron aprobar')}: ${result.failures[0].message}`,
        'error'
      )
    }
    // Se limpia toda la selección: lo aprobado ya no está pendiente y lo
    // fallido suele estar desactualizado (otra persona lo revisó).
    setSelected(new Set())
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
          ? canReview
            ? 'No hay justificaciones pendientes.'
            : 'Ninguna justificación está en revisión.'
          : canReview
            ? `${countOf(pendingCount, 'justificación pendiente', 'justificaciones pendientes')}`
            : `${countOf(pendingCount, 'justificación', 'justificaciones')} en revisión por coordinación`}
      </p>

      {selectablePending.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5">
          <label className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={bulkBusy}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-neutral-300 text-navy-800 focus:ring-navy-600"
            />
            Seleccionar todas
          </label>
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 font-medium">
                {countOf(selectedIds.length, 'seleccionada', 'seleccionadas')}
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setConfirmingBulk(true)}
              >
                {`Aprobar seleccionadas (${selectedIds.length})`}
              </Button>
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10">
          <EmptyState
            icon={<FileCheck2 className="w-5 h-5" />}
            title={
              subjectFilter
                ? 'Ninguna justificación para esta materia'
                : 'No hay justificaciones para mostrar'
            }
            description={
              subjectFilter
                ? undefined
                : emptyDescription ||
                  'Las justificaciones enviadas por los estudiantes van a aparecer aquí.'
            }
            action={
              subjectFilter ? (
                <button
                  type="button"
                  onClick={() => setSubjectFilter('')}
                  className="text-sm font-bold text-navy-700 hover:text-navy-900 underline underline-offset-2"
                >
                  Ver todas las materias
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-200">
            {sorted.map((j, index) => {
              const style = justificationRowStyle(j.status, index)
              return (
                <div key={j.id} className={`px-5 py-4 flex flex-col gap-2.5 ${style.row}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                      {canReview && j.status === 'PENDING' && (
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar justificación de ${j.student?.name || 'estudiante'}`}
                          checked={selected.has(j.id)}
                          disabled={bulkBusy || busyId === j.id}
                          onChange={() => toggleSelected(j.id)}
                          className="w-4 h-4 mt-0.5 rounded border-neutral-300 text-navy-800 focus:ring-navy-600"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 flex-wrap font-bold text-gray-900 text-sm">
                          <RoleBadge role="STUDENT" variant="compact" />
                          <span>{j.student?.name || 'Estudiante'}</span>
                          <span className="text-xs font-mono text-gray-400">
                            {j.student?.student_code || '---'}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {j.subject?.name} ({j.subject?.code}) ·{' '}
                          {j.session?.date
                            ? new Date(j.session.date).toLocaleDateString('es-CO', {
                                timeZone: 'America/Bogota',
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={j.status} canReview={canReview} />
                  </div>

                  <p className={`text-sm text-gray-700 rounded-xl px-3 py-2 ${style.reasonBox}`}>
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

                    {canReview && j.status === 'PENDING' && (
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

                    {canReview && j.status !== 'PENDING' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        leftIcon={<Pencil className="w-3.5 h-3.5" />}
                        disabled={busyId === j.id}
                        onClick={() => setChangeTarget(j)}
                      >
                        Cambiar decisión
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
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

      {changeTarget && changeTarget.status !== 'PENDING' && (
        <ChangeDecisionModal
          current={changeTarget.status}
          description={`${changeTarget.student?.name || 'Estudiante'} · ${changeTarget.subject?.name || ''}`}
          loading={busyId === changeTarget.id}
          onCancel={() => setChangeTarget(null)}
          onConfirm={handleChangeDecision}
        />
      )}

      {confirmingBulk && (
        <ConfirmModal
          title="Aprobar justificaciones"
          message={`Se aprobarán ${countOf(selectedIds.length, 'justificación', 'justificaciones')}. Cada aprobación queda registrada en la auditoría.`}
          confirmLabel="Aprobar"
          loading={bulkBusy}
          icon={CheckCircle2}
          onConfirm={handleBulkApprove}
          onCancel={() => setConfirmingBulk(false)}
        />
      )}
    </div>
  )
}

function StatusBadge({
  status,
  canReview,
}: {
  status: JustificationRow['status']
  canReview: boolean
}) {
  if (status === 'PENDING') {
    return (
      <Badge variant="warning" size="sm">
        <Clock className="w-3 h-3" />
        {canReview ? 'Pendiente' : 'En revisión'}
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
