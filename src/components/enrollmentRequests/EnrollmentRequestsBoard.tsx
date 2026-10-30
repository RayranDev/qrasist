'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, UserPlus } from 'lucide-react'
import {
  approveAllEnrollmentRequests,
  approveEnrollmentRequests,
  rejectEnrollmentRequests,
} from '@/lib/actions/enrollmentRequests'
import { useToast } from '@/components/toast/ToastProvider'
import ConfirmModal from '@/components/ConfirmModal'
import LocalTime from '@/components/LocalTime'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { BULK_REVIEW_MAX, type RequestsView } from '@/lib/enrollmentRequests/constants'
import type { RequestFilters } from '@/lib/enrollmentRequests/filters'
import type { PendingRequest, RequestGroup } from '@/lib/enrollmentRequests/grouping'
import {
  describeApproveAll,
  describeBulkResult,
  type ReviewFailure,
} from '@/lib/enrollmentRequests/messages'
import { chunk, selectionState, setSelected } from '@/lib/enrollmentRequests/selection'
import { countOf } from '@/lib/utils/plural'

const FALLBACK = 'No se pudo procesar la solicitud.'

type ReviewKind = 'approve' | 'reject'
type Confirm = 'approve-selected' | 'reject-selected' | 'approve-all' | null

function Checkbox({
  state,
  label,
  onChange,
  disabled,
}: {
  state: 'none' | 'some' | 'all'
  label: string
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={state === 'all'}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-gray-300 text-navy-700 focus:ring-navy-600 cursor-pointer disabled:cursor-not-allowed"
    />
  )
}

export default function EnrollmentRequestsBoard({
  groups,
  view,
  totalMatching,
  truncated,
  filters,
  canApproveAll,
  filtered = false,
}: {
  groups: RequestGroup[]
  view: RequestsView
  /** Pendientes que coinciden con los filtros, en todas las páginas. */
  totalMatching: number
  /** Había más pendientes de las que se pueden leer: `totalMatching` es una cota inferior. */
  truncated: boolean
  filters: RequestFilters
  canApproveAll: boolean
  /** Hay búsqueda o filtros activos (cambia el texto del estado vacío). */
  filtered?: boolean
}) {
  const router = useRouter()
  const showToast = useToast()
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [selected, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, requests: g.requests.filter((r) => !removed.has(r.id)) }))
        .filter((g) => g.requests.length > 0),
    [groups, removed]
  )
  const visibleIds = useMemo(
    () => visibleGroups.flatMap((g) => g.requests.map((r) => r.id)),
    [visibleGroups]
  )
  // Solo cuentan las filas que se ven: al cambiar de página o refrescar, una
  // selección vieja no puede colarse en "Aprobar seleccionadas".
  const selectedIds = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected]
  )

  // Lo ya procesado en esta pantalla se descuenta del total solo mientras
  // las props aún lo incluyen: tras router.refresh() el servidor ya lo excluye.
  const removedStillInProps = groups.reduce(
    (sum, g) => sum + g.requests.filter((r) => removed.has(r.id)).length,
    0
  )
  const pendingAfterLocal = Math.max(0, totalMatching - removedStillInProps)
  const allMatchingLabel = describeApproveAll(pendingAfterLocal, truncated)

  const applyDone = (done: string[]) => {
    if (done.length === 0) return
    setRemoved((prev) => new Set([...prev, ...done]))
    setSelection((prev) => setSelected(prev, done, false))
  }

  const review = async (kind: ReviewKind, ids: string[]) => {
    const done: string[] = []
    const failures: ReviewFailure[] = []
    for (const batch of chunk(ids, BULK_REVIEW_MAX)) {
      try {
        if (kind === 'approve') {
          const result = await approveEnrollmentRequests(batch)
          if (result.success) {
            done.push(...result.approved)
            failures.push(...result.failures)
          } else {
            failures.push(...batch.map((id) => ({ id, message: result.error || FALLBACK })))
          }
        } else {
          const result = await rejectEnrollmentRequests(batch)
          if (result.success) {
            done.push(...result.rejected)
            failures.push(...result.failures)
          } else {
            failures.push(...batch.map((id) => ({ id, message: result.error || FALLBACK })))
          }
        }
      } catch {
        failures.push(...batch.map((id) => ({ id, message: FALLBACK })))
      }
    }

    applyDone(done)
    const { message, type } = describeBulkResult({ action: kind, done: done.length, failures })
    showToast(message, type)
    if (done.length > 0) router.refresh()
  }

  const reviewRow = async (kind: ReviewKind, request: PendingRequest) => {
    setRowBusy(request.id)
    await review(kind, [request.id])
    setRowBusy(null)
  }

  const runConfirmed = async () => {
    const action = confirm
    if (!action) return
    setBusy(true)
    if (action === 'approve-all') {
      try {
        const result = await approveAllEnrollmentRequests(filters)
        if (!result.success) {
          showToast(result.error || FALLBACK, 'error')
        } else {
          applyDone(result.approved)
          const { message, type } = describeBulkResult({
            action: 'approve',
            done: result.approved.length,
            failures: result.failures,
            remaining: result.remaining,
          })
          showToast(message, type)
          router.refresh()
        }
      } catch {
        showToast(FALLBACK, 'error')
      }
    } else {
      await review(action === 'approve-selected' ? 'approve' : 'reject', selectedIds)
    }
    setBusy(false)
    setConfirm(null)
  }

  if (visibleGroups.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10">
        <EmptyState
          icon={<UserPlus className="w-5 h-5" />}
          title={
            filtered
              ? 'Ninguna solicitud coincide con los filtros'
              : 'No hay solicitudes pendientes'
          }
          description={
            filtered
              ? 'Prueba con otra búsqueda o quita los filtros.'
              : 'Cuando un estudiante pida inscribirse en una materia, aparecerá aquí.'
          }
        />
      </div>
    )
  }

  const pageState = selectionState(selected, visibleIds)
  const confirmCount = selectedIds.length

  return (
    <div className="space-y-4">
      <div className="sticky top-2 z-10 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Checkbox
            state={pageState}
            label="Seleccionar todas las solicitudes de esta página"
            onChange={(on) => setSelection((prev) => setSelected(prev, visibleIds, on))}
            disabled={busy}
          />
          Seleccionar todas
        </label>
        <span className="text-xs text-gray-500" aria-live="polite">
          {selectedIds.length === 0
            ? `${countOf(visibleIds.length, 'solicitud', 'solicitudes')} en esta página`
            : `${countOf(selectedIds.length, 'seleccionada', 'seleccionadas')}`}
        </span>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Button
            size="sm"
            disabled={selectedIds.length === 0 || busy}
            onClick={() => setConfirm('approve-selected')}
          >
            Aprobar seleccionadas ({selectedIds.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.length === 0 || busy}
            onClick={() => setConfirm('reject-selected')}
          >
            Rechazar seleccionadas ({selectedIds.length})
          </Button>
          {canApproveAll && pendingAfterLocal > 0 && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<CheckCheck className="w-4 h-4" />}
              disabled={busy}
              onClick={() => setConfirm('approve-all')}
            >
              {allMatchingLabel.buttonLabel}
            </Button>
          )}
        </div>
      </div>

      {visibleGroups.map((group) => {
        const ids = group.requests.map((r) => r.id)
        return (
          <section
            key={group.key}
            aria-label={group.title}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <header className="flex items-center gap-3 px-4 py-3 bg-gray-50/70 border-b border-gray-100">
              <Checkbox
                state={selectionState(selected, ids)}
                label={`Seleccionar todas las solicitudes de ${group.title}`}
                onChange={(on) => setSelection((prev) => setSelected(prev, ids, on))}
                disabled={busy}
              />
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 font-bold text-gray-900 text-sm">
                  {view === 'student' && <RoleBadge role="STUDENT" variant="compact" />}
                  <span className="truncate">{group.title}</span>
                </h2>
                {group.code && <p className="text-xs text-gray-400 font-mono">{group.code}</p>}
              </div>
              <Badge variant="warning" size="sm">
                {countOf(ids.length, 'pendiente', 'pendientes')}
              </Badge>
            </header>
            <ul className="divide-y divide-gray-50">
              {group.requests.map((req) => (
                <li key={req.id} className="flex items-center gap-3 px-4 py-3">
                  <Checkbox
                    state={selected.has(req.id) ? 'all' : 'none'}
                    label={`Seleccionar la solicitud de ${req.studentName} para ${req.subjectName}`}
                    onChange={(on) => setSelection((prev) => setSelected(prev, [req.id], on))}
                    disabled={busy}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
                      {view === 'subject' && <RoleBadge role="STUDENT" variant="compact" />}
                      <span className="truncate">
                        {view === 'subject' ? req.studentName : req.subjectName}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400">
                      <span className="font-mono">
                        {view === 'subject' ? req.studentCode || '---' : req.subjectCode}
                      </span>{' '}
                      · solicitada el <LocalTime date={req.requestedAt} />
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={busy || rowBusy === req.id}
                      onClick={() => reviewRow('approve', req)}
                      className="px-3 py-1.5 text-xs font-bold text-navy-700 bg-navy-50 hover:bg-navy-100 rounded-lg transition disabled:opacity-50"
                    >
                      {rowBusy === req.id ? '...' : 'Aprobar'}
                    </button>
                    <button
                      disabled={busy || rowBusy === req.id}
                      onClick={() => reviewRow('reject', req)}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                    >
                      {rowBusy === req.id ? '...' : 'Rechazar'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {confirm === 'approve-selected' && (
        <ConfirmModal
          title={`¿Aprobar ${countOf(confirmCount, 'solicitud', 'solicitudes')}?`}
          message="Cada estudiante quedará inscrito en la materia que solicitó. Si alguna no se puede aprobar, verás el motivo."
          confirmLabel={`Aprobar (${confirmCount})`}
          loading={busy}
          onConfirm={runConfirmed}
          onCancel={() => !busy && setConfirm(null)}
        />
      )}
      {confirm === 'reject-selected' && (
        <ConfirmModal
          title={`¿Rechazar ${countOf(confirmCount, 'solicitud', 'solicitudes')}?`}
          message="Las solicitudes quedarán rechazadas. Los estudiantes podrán volver a solicitar la inscripción."
          confirmLabel={`Rechazar (${confirmCount})`}
          loading={busy}
          onConfirm={runConfirmed}
          onCancel={() => !busy && setConfirm(null)}
        />
      )}
      {confirm === 'approve-all' && (
        <ConfirmModal
          title={allMatchingLabel.title}
          message={allMatchingLabel.message}
          confirmLabel="Aprobar todas"
          loading={busy}
          onConfirm={runConfirmed}
          onCancel={() => !busy && setConfirm(null)}
        />
      )}
    </div>
  )
}
