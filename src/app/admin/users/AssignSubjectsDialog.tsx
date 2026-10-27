'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Presentation, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/toast/ToastProvider'
import {
  assignSubjectsToProfessor,
  listSubjectsAssignableToProfessor,
  type AssignableSubject,
  type AssignSubjectFailure,
} from '@/lib/actions/adminSubjects'
import { MAX_ASSIGN_SUBJECTS } from '@/lib/admin/assignSubjects'
import { countOf } from '@/lib/utils/plural'
import DialogShell from './DialogShell'

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; noCareers: boolean; subjects: AssignableSubject[]; total: number }

/**
 * Optional second step after promoting a user to professor: pick the subjects they
 * will teach. Only subjects without a professor that match the professor's careers
 * are offered; the server re-validates every one on submit.
 */
export default function AssignSubjectsDialog({
  professorId,
  professorName,
  onClose,
  onAssignCareers,
}: {
  professorId: string
  professorName: string
  onClose: () => void
  /** Opens the professor's careers editor (shown when they have no careers yet). */
  onAssignCareers?: () => void
}) {
  const showToast = useToast()
  const [search, setSearch] = useState('')
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [selected, setSelected] = useState<Map<string, AssignableSubject>>(new Map())
  const [submitting, setSubmitting] = useState(false)
  const [failures, setFailures] = useState<AssignSubjectFailure[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const requestId = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchList = async (term: string): Promise<ListState> => {
    try {
      const res = await listSubjectsAssignableToProfessor(professorId, term)
      return res.success
        ? { status: 'ready', noCareers: res.noCareers, subjects: res.subjects, total: res.total }
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
    debounce.current = setTimeout(() => void load(value.trim(), true), 300)
  }

  const toggle = (subject: AssignableSubject) => {
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
      const res = await assignSubjectsToProfessor(professorId, Array.from(selected.keys()))
      if (res.success) {
        showToast(
          `${countOf(res.assigned.length, 'materia asignada', 'materias asignadas')}.`,
          'success'
        )
        onClose()
        return
      }
      setSubmitError(res.error || 'No se pudieron asignar las materias.')
      setFailures(res.failures)
      if (res.assigned.length > 0) {
        // Partial outcome (concurrent change): drop what was assigned and refresh.
        setSelected((prev) => {
          const next = new Map(prev)
          res.assigned.forEach((id) => next.delete(id))
          return next
        })
        void load(search.trim(), false)
      }
    } catch {
      setSubmitError('Ocurrió un error inesperado al conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  const subjects = list.status === 'ready' ? list.subjects : []

  return (
    <DialogShell labelledBy="assign-subjects-title" onClose={onClose} closeDisabled={submitting}>
      <div className="px-6 py-4 border-b border-neutral-100 flex items-center gap-2.5 bg-neutral-50/50">
        <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
          <Presentation className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="assign-subjects-title" className="text-sm font-bold text-neutral-900">
            ¿Qué materias dictará?
          </h3>
          <p className="text-xs text-neutral-600 truncate">
            {professorName} ya es Docente. Puedes asignarle materias ahora o hacerlo después desde
            Materias.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {list.status === 'ready' && list.noCareers ? (
          <div
            role="status"
            className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-medium"
          >
            Este docente todavía no tiene carreras asignadas, así que no se le pueden asignar
            materias. Asígnale una carrera con el botón de carreras (birrete) de su fila en Usuarios
            y luego asigna sus materias desde Materias.
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
                <p className="text-xs text-neutral-600">
                  No hay materias sin docente que coincidan con las carreras de este docente
                  {search.trim() ? ' y con tu búsqueda' : ''}.
                </p>
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
          {list.status === 'ready' && list.noCareers && onAssignCareers && (
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
          {!(list.status === 'ready' && list.noCareers) && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={submitting}
              disabled={selected.size === 0}
              onClick={handleSubmit}
              className="bg-neutral-900 hover:bg-neutral-800 border-neutral-950"
            >
              {selected.size > 0
                ? `Asignar ${countOf(selected.size, 'materia')}`
                : 'Asignar materias'}
            </Button>
          )}
        </div>
      </div>
    </DialogShell>
  )
}
