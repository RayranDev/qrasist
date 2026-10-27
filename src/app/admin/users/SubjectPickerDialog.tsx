'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/toast/ToastProvider'
import { MAX_ASSIGN_SUBJECTS } from '@/lib/admin/assignSubjects'
import DialogShell from './DialogShell'

export interface PickerSubject {
  id: string
  code: string
  name: string
}

export interface PickerFailure {
  subjectId: string
  code: string | null
  error: string
}

export type PickerListResult =
  | {
      success: true
      noCareers: boolean
      subjects: PickerSubject[]
      total: number
      /** The server capped its candidate window: there may be more results than `total`. */
      truncated?: boolean
    }
  | { success: false; error: string }

export interface PickerSubmitResult {
  success: boolean
  error?: string
  /** Ids that were applied (also on a partial outcome). */
  done: string[]
  failures: PickerFailure[]
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      noCareers: boolean
      subjects: PickerSubject[]
      total: number
      truncated: boolean
    }

/**
 * Shared frame of the optional "link subjects" step shown after a role change
 * (teach subjects for a new professor, enroll in subjects for a new student):
 * searchable list of candidates (one page, "mostrando X de N"), multi-select,
 * per-subject failures, an always-present "Omitir por ahora", and a no-careers
 * state with an optional shortcut to the careers editor. Which subjects are
 * offered and the final validation live in the server actions passed in.
 */
export default function SubjectPickerDialog({
  titleId,
  title,
  subtitle,
  icon,
  noCareersMessage,
  emptyMessage,
  submitIdleLabel,
  submitLabel,
  successMessage,
  partialMessage,
  loadSubjects,
  submitSubjects,
  onClose,
  onAssignCareers,
}: {
  titleId: string
  title: string
  subtitle: string
  icon: ReactNode
  noCareersMessage: string
  /** Shown when the list is empty; `searching` is true when the admin typed a search. */
  emptyMessage: (searching: boolean) => string
  submitIdleLabel: string
  submitLabel: (selectedCount: number) => string
  successMessage: (doneCount: number) => string
  /** Toast when only some subjects were applied, so it stays visible after "Omitir por ahora". */
  partialMessage: (doneCount: number) => string
  loadSubjects: (term: string) => Promise<PickerListResult>
  submitSubjects: (subjectIds: string[]) => Promise<PickerSubmitResult>
  onClose: () => void
  /** Opens the careers editor (shown when the user has no careers yet). */
  onAssignCareers?: () => void
}) {
  const showToast = useToast()
  const [search, setSearch] = useState('')
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [selected, setSelected] = useState<Map<string, PickerSubject>>(new Map())
  const [submitting, setSubmitting] = useState(false)
  const [failures, setFailures] = useState<PickerFailure[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const requestId = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchList = async (term: string): Promise<ListState> => {
    try {
      const res = await loadSubjects(term)
      return res.success
        ? {
            status: 'ready',
            noCareers: res.noCareers,
            subjects: res.subjects,
            total: res.total,
            truncated: res.truncated === true,
          }
        : { status: 'error', message: res.error }
    } catch {
      return { status: 'error', message: 'No se pudieron cargar las materias.' }
    }
  }

  // A newer request supersedes older ones: only the latest result is applied.
  const load = (term: string, showLoading: boolean) => {
    const current = ++requestId.current
    if (showLoading) setList({ status: 'loading' })
    void fetchList(term).then((state) => {
      if (current === requestId.current) setList(state)
    })
  }

  useEffect(() => {
    const current = ++requestId.current
    void fetchList('').then((state) => {
      if (current === requestId.current) setList(state)
    })
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = (value: string) => {
    setSearch(value)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => load(value.trim(), true), 300)
  }

  const toggle = (subject: PickerSubject) => {
    setFailures([])
    setSubmitError(null)
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(subject.id)) next.delete(subject.id)
      else if (next.size < MAX_ASSIGN_SUBJECTS) next.set(subject.id, subject)
      return next
    })
  }

  const handleSubmit = async () => {
    if (selected.size === 0 || submitting) return
    setSubmitting(true)
    setFailures([])
    setSubmitError(null)
    try {
      const res = await submitSubjects(Array.from(selected.keys()))
      if (res.success) {
        showToast(successMessage(res.done.length), 'success')
        onClose()
        return
      }
      setSubmitError(res.error || 'No se pudieron guardar las materias.')
      setFailures(res.failures)
      if (res.done.length > 0) {
        // Partial outcome (concurrent change): say what was applied, drop it from the
        // selection and refresh the list.
        showToast(partialMessage(res.done.length), 'success')
        setSelected((prev) => {
          const next = new Map(prev)
          res.done.forEach((id) => next.delete(id))
          return next
        })
        load(search.trim(), false)
      }
    } catch {
      setSubmitError('Ocurrió un error inesperado al conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  const subjects = list.status === 'ready' ? list.subjects : []
  const noCareers = list.status === 'ready' && list.noCareers

  return (
    <DialogShell labelledBy={titleId} onClose={onClose} closeDisabled={submitting}>
      <div className="px-6 py-4 border-b border-neutral-100 flex items-center gap-2.5 bg-neutral-50/50">
        <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-bold text-neutral-900">
            {title}
          </h3>
          <p className="text-xs text-neutral-600">{subtitle}</p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {noCareers ? (
          <div
            role="status"
            className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-medium"
          >
            {noCareersMessage}
          </div>
        ) : (
          <>
            <div className="relative">
              <Search
                className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                type="text"
                aria-label="Buscar materia por código o nombre"
                placeholder="Código o nombre…"
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

            <div aria-live="polite">
              {list.status === 'loading' && (
                <p className="text-xs text-neutral-600">Cargando materias…</p>
              )}
              {list.status === 'error' && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {list.message}
                </p>
              )}
              {list.status === 'ready' && subjects.length === 0 && (
                <p className="text-xs text-neutral-600">{emptyMessage(search.trim() !== '')}</p>
              )}
            </div>

            {subjects.length > 0 && (
              <ul className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {subjects.map((subject) => {
                  const checked = selected.has(subject.id)
                  const disabled = !checked && selected.size >= MAX_ASSIGN_SUBJECTS
                  return (
                    <li key={subject.id}>
                      <label className="flex items-center gap-3 p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 cursor-pointer text-sm text-neutral-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled || submitting}
                          onChange={() => toggle(subject)}
                          className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                        />
                        <span className="shrink-0 px-2 py-0.5 text-xs font-mono font-medium bg-neutral-100 text-neutral-700 border border-neutral-200/60 rounded-md">
                          {subject.code}
                        </span>
                        <span className="min-w-0 truncate font-medium">{subject.name}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}

            {list.status === 'ready' && list.truncated && (
              <p className="text-xs text-neutral-600">Hay más resultados, afina la búsqueda.</p>
            )}

            {list.status === 'ready' && list.total > subjects.length && (
              <p className="text-xs text-neutral-600">
                Mostrando {subjects.length} de {list.total} materias. Usa el buscador para acotar.
              </p>
            )}
          </>
        )}

        {submitError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs font-medium flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p>{submitError}</p>
              {failures.length > 0 && (
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {failures.map((f) => (
                    <li key={f.subjectId}>
                      {f.code ? `${f.code}: ` : ''}
                      {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-neutral-100">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Omitir por ahora
          </Button>
          {noCareers && onAssignCareers && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onAssignCareers}
              className="bg-neutral-900 hover:bg-neutral-800 border-neutral-950"
            >
              Asignar carreras
            </Button>
          )}
          {!noCareers && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={submitting}
              disabled={selected.size === 0}
              onClick={handleSubmit}
              className="bg-neutral-900 hover:bg-neutral-800 border-neutral-950"
            >
              {selected.size > 0 ? submitLabel(selected.size) : submitIdleLabel}
            </Button>
          )}
        </div>
      </div>
    </DialogShell>
  )
}
