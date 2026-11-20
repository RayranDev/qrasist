'use client'

import { useState, useEffect, useRef } from 'react'
import {
  createSubject,
  deleteSubject,
  updateSubject,
  reactivateSubject,
  listSubjectSchedules,
  addSubjectSchedule,
  removeSubjectSchedule,
  type SubjectSchedule,
} from '@/lib/actions/adminSubjects'
import { assignSubjectToCareer, removeSubjectFromCareer } from '@/lib/actions/academic'
import { useToast } from '@/components/toast/ToastProvider'
import ConfirmModal from '@/components/ConfirmModal'
import CreateFormToggle from '@/components/CreateFormToggle'
import { EmptyState } from '@/components/ui/EmptyState'
import { Plus, Pencil, Trash2, Calendar, BookMarked } from 'lucide-react'
import { computePlannedSessions } from '@/lib/utils/plannedSessions'
import {
  DEFAULT_GLOBAL_POLICY,
  MIN_CHANGE_REASON_LENGTH,
  type GlobalPolicy,
} from '@/lib/settings/globalPolicy'
import {
  SubjectPolicyFields,
  policyFormFromPolicy,
  type PolicyFormValue,
  type PolicyMode,
} from './SubjectPolicyFields'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const inputClass =
  'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-navy-600 focus:ring-2 focus:ring-navy-100 transition-all shadow-sm'

interface Professor {
  id: string
  name: string
  careerIds: string[]
}

interface Period {
  id: string
  name: string
  start_date?: string | null
  end_date?: string | null
}

interface Career {
  id: string
  name: string
  code: string
}

interface SubjectCareerLink {
  id: string
  level: number | null
  career: { id: string; name: string; code: string } | null
}

interface Subject {
  id: string
  name: string
  code: string
  professor_id: string | null
  period_id: string | null
  is_active?: boolean
  /** true = política personalizada; false = hereda la global. */
  policy_override?: boolean
  absence_rule_type?: 'PERCENTAGE' | 'FIXED_COUNT'
  max_absence_percentage?: number
  max_absence_count?: number | null
  total_planned_sessions?: number
  late_after_minutes?: number | null
  lates_per_absence?: number | null
}

// Evento que usa el estado vacío (otro componente cliente) para pedirle al
// formulario que se abra: evita subir el estado a un provider por una sola acción.
const OPEN_CREATE_SUBJECT_EVENT = 'qrasist:open-create-subject'

function scrollToForm(form: HTMLElement) {
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  form.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
}

// `resetKey` identifica la vista del listado (ver buildSubjectsViewKey: estado,
// búsqueda y filtros, sin la página). Al cambiar, el formulario se cierra: filtrar o cambiar de pestaña
// solo modifica los searchParams, así que sin esto la instancia sobrevive y el
// formulario quedaría abierto mientras el admin navega por otras materias.
// Paginar no cambia la key, para no perder lo escrito al revisar otra página.
export function CreateSubjectForm({
  periods,
  resetKey = '',
  globalPolicy = DEFAULT_GLOBAL_POLICY,
}: {
  periods: Period[]
  resetKey?: string
  /** Política global vigente: es la que hereda la materia nueva por defecto. */
  globalPolicy?: GlobalPolicy
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [policy, setPolicy] = useState<PolicyFormValue>(() =>
    policyFormFromPolicy('global', globalPolicy)
  )
  const formRef = useRef<HTMLFormElement>(null)
  const scrollOnOpen = useRef(false)
  const showToast = useToast()

  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setOpen(false)
  }

  useEffect(() => {
    const handleOpen = () => {
      if (formRef.current) {
        // Ya estaba abierto: solo se trae a la vista.
        scrollToForm(formRef.current)
        return
      }
      scrollOnOpen.current = true
      setOpen(true)
    }
    window.addEventListener(OPEN_CREATE_SUBJECT_EVENT, handleOpen)
    return () => window.removeEventListener(OPEN_CREATE_SUBJECT_EVENT, handleOpen)
  }, [])

  // Al abrirse, el foco pasa al primer campo (el botón que lo abrió se
  // desmonta y el foco caería en <body>). Si se abrió desde el estado vacío, el
  // formulario puede quedar fuera de pantalla (el listado está más abajo): se
  // trae a la vista una vez montado.
  useEffect(() => {
    if (!open || !formRef.current) return
    formRef.current.querySelector<HTMLInputElement>('input[name="name"]')?.focus({
      preventScroll: true,
    })
    if (scrollOnOpen.current) {
      scrollOnOpen.current = false
      scrollToForm(formRef.current)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const result = await createSubject(formData)
    if (result.success) {
      ;(e.target as HTMLFormElement).reset()
      setPolicy(policyFormFromPolicy('global', globalPolicy))
      setOpen(false)
      showToast(`Materia "${name}" creada.`, 'success')
    } else {
      showToast(result.error || 'No se pudo crear la materia.', 'error')
    }
    setLoading(false)
  }

  if (!open) {
    return <CreateFormToggle label="Crear Nueva Materia" onClick={() => setOpen(true)} />
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 mb-6"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-navy-50 flex items-center justify-center text-navy-700">
            <Plus className="w-5 h-5" strokeWidth={2} />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Crear Nueva Materia</h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-bold text-gray-400 hover:text-gray-600 transition"
        >
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">
            Nombre
          </label>
          <input
            required
            name="name"
            type="text"
            placeholder="Ej. Cálculo I"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">
            Código
          </label>
          <input
            required
            name="code"
            type="text"
            placeholder="Ej. CALC-101"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1 uppercase tracking-wider">
            Período
          </label>
          <select name="period_id" className={`${inputClass} appearance-none cursor-pointer`}>
            <option value="">Sin asignar</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pt-3 border-t border-gray-100">
        <div className="max-w-xs">
          <label className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1">
            Clases del semestre (total)
          </label>
          <input
            name="total_planned_sessions"
            type="number"
            defaultValue={16}
            min={1}
            max={60}
            className={`${inputClass} text-xs`}
          />
        </div>
      </div>

      <div className="pt-3 mt-3 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 ml-1">
          Política de asistencia
        </p>
        <SubjectPolicyFields
          value={policy}
          onChange={(patch) => setPolicy((prev) => ({ ...prev, ...patch }))}
          globalPolicy={globalPolicy}
          reasonRequired={policy.mode === 'custom'}
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-xs text-gray-400">
          El profesor se asigna después, una vez que la materia tenga carrera vinculada.
        </p>
        <button
          disabled={loading}
          type="submit"
          className="py-2.5 px-6 bg-navy-800 text-white rounded-xl text-sm font-bold hover:bg-navy-900 transition shadow-xs active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
        >
          {loading ? 'Guardando...' : 'Crear Materia'}
        </button>
      </div>
    </form>
  )
}

// Estado vacío del listado. En la vista de archivadas no se ofrece crear: las
// materias nuevas siempre nacen activas, así que la acción no tendría efecto.
export function SubjectsEmptyState({ archived }: { archived: boolean }) {
  return (
    <EmptyState
      icon={<BookMarked className="w-5 h-5" />}
      title="Ninguna materia coincide con tu búsqueda"
      description={
        archived
          ? 'Prueba ajustando la búsqueda o los filtros.'
          : 'Prueba ajustando la búsqueda o los filtros, o crea una materia nueva.'
      }
      action={
        archived ? undefined : (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_CREATE_SUBJECT_EVENT))}
            className="text-sm font-bold text-navy-700 hover:text-navy-900 underline underline-offset-2 cursor-pointer"
          >
            Crear materia
          </button>
        )
      }
    />
  )
}

export function SubjectActionButtons({
  subject,
  professors,
  periods,
  subjectCareerIds,
  globalPolicy = DEFAULT_GLOBAL_POLICY,
}: {
  subject: Subject
  professors: Professor[]
  periods: Period[]
  subjectCareerIds: string[]
  /** Política global vigente, para mostrar lo que hereda la materia. */
  globalPolicy?: GlobalPolicy
}) {
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (!isEditing) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsEditing(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(subject.name)
  const [code, setCode] = useState(subject.code)
  const [profId, setProfId] = useState(subject.professor_id || '')
  const [periodId, setPeriodId] = useState(subject.period_id || '')
  const [totalPlannedSessions, setTotalPlannedSessions] = useState(
    subject.total_planned_sessions ?? 16
  )
  // Valores de política que la materia tiene hoy (los efectivos), para arrancar
  // el formulario y detectar si el admin los cambió.
  const currentPolicy: GlobalPolicy = {
    lateAfterMinutes: subject.late_after_minutes ?? null,
    latesPerAbsence: subject.lates_per_absence ?? null,
    absenceRuleType: subject.absence_rule_type ?? 'PERCENTAGE',
    maxAbsencePercentage: subject.max_absence_percentage ?? 20,
    maxAbsenceCount: subject.max_absence_count ?? null,
  }
  const initialPolicyMode: PolicyMode = subject.policy_override ? 'custom' : 'global'
  const [policy, setPolicy] = useState<PolicyFormValue>(() =>
    policyFormFromPolicy(initialPolicyMode, currentPolicy)
  )
  const showToast = useToast()

  // Un cambio de política (de modo o de valores propios) exige motivo y se audita.
  const initialPolicyForm = policyFormFromPolicy(initialPolicyMode, currentPolicy)
  const policyChanged =
    policy.mode !== initialPolicyMode ||
    (policy.mode === 'custom' &&
      (policy.lateAfter !== initialPolicyForm.lateAfter ||
        policy.latesPerAbsence !== initialPolicyForm.latesPerAbsence ||
        policy.ruleType !== initialPolicyForm.ruleType ||
        policy.percentage !== initialPolicyForm.percentage ||
        policy.count !== initialPolicyForm.count))
  const reasonMissing = policyChanged && policy.reason.trim().length < MIN_CHANGE_REASON_LENGTH

  const isActive = subject.is_active !== false
  const hasCareer = subjectCareerIds.length > 0
  const eligibleProfessors = hasCareer
    ? professors.filter((p) => p.careerIds.some((id) => subjectCareerIds.includes(id)))
    : []

  const handleDelete = async () => {
    setLoading(true)
    const result = await deleteSubject(subject.id)
    if (result.success) {
      showToast(
        result.archived
          ? `"${subject.name}" tiene datos asociados: se archivó en vez de borrarse.`
          : `"${subject.name}" eliminada permanentemente.`,
        'success'
      )
    } else {
      showToast(result.error || 'No se pudo eliminar la materia.', 'error')
    }
    setLoading(false)
    setShowDeleteConfirm(false)
  }

  const handleReactivate = async () => {
    setLoading(true)
    const result = await reactivateSubject(subject.id)
    if (result.success) {
      showToast(`"${subject.name}" reactivada.`, 'success')
    } else {
      showToast(result.error || 'No se pudo reactivar la materia.', 'error')
    }
    setLoading(false)
  }

  const handleSave = async () => {
    setLoading(true)
    const result = await updateSubject(subject.id, {
      name,
      code,
      professor_id: profId === '' ? null : profId,
      period_id: periodId === '' ? null : periodId,
      total_planned_sessions: Number(totalPlannedSessions) || 16,
      policy_mode: policy.mode,
      policy_reason: policy.reason,
      ...(policy.mode === 'custom'
        ? {
            absence_rule_type: policy.ruleType,
            max_absence_percentage: Number(policy.percentage),
            max_absence_count: policy.count !== '' ? Number(policy.count) : null,
            late_after_minutes: policy.lateAfter !== '' ? Number(policy.lateAfter) : null,
            lates_per_absence:
              policy.latesPerAbsence !== '' ? Number(policy.latesPerAbsence) : null,
          }
        : {}),
    })
    if (result.success) {
      setIsEditing(false)
      showToast('Materia actualizada.', 'success')
    } else {
      showToast(result.error || 'No se pudo guardar la materia.', 'error')
    }
    setLoading(false)
  }

  if (isEditing) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div
          className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-subject-title"
        >
          <h3 id="edit-subject-title" className="text-lg font-bold text-gray-900 mb-4">
            Editar Materia
          </h3>
          <div className="space-y-4 mb-6 text-left">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                type="text"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Código</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                type="text"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Profesor Asignado
              </label>
              {hasCareer ? (
                <select
                  value={profId}
                  onChange={(e) => setProfId(e.target.value)}
                  className={`${inputClass} appearance-none cursor-pointer`}
                >
                  <option value="">Sin asignar</option>
                  {eligibleProfessors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  Vincula esta materia a una carrera primero para poder asignar profesor.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Período</label>
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className={`${inputClass} appearance-none cursor-pointer`}
              >
                <option value="">Sin asignar</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <label className="block text-[11px] text-gray-500 mb-1">
                Clases Planificadas (Semestre)
              </label>
              <input
                type="number"
                value={totalPlannedSessions}
                onChange={(e) => setTotalPlannedSessions(Number(e.target.value))}
                min={1}
                max={60}
                className={`${inputClass} text-xs`}
              />
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-700 mb-2">Política de asistencia</p>
              <SubjectPolicyFields
                value={policy}
                onChange={(patch) => setPolicy((prev) => ({ ...prev, ...patch }))}
                globalPolicy={globalPolicy}
                reasonRequired={policyChanged}
              />
            </div>

            <div className="pt-3 border-t border-gray-100">
              <SubjectScheduleManager
                subjectId={subject.id}
                periodStart={periods.find((p) => p.id === periodId)?.start_date}
                periodEnd={periods.find((p) => p.id === periodId)?.end_date}
                onCalculate={(total) => setTotalPlannedSessions(total)}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              disabled={loading}
              onClick={() => setIsEditing(false)}
              className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
            <button
              disabled={loading || reasonMissing}
              onClick={handleSave}
              className="flex-1 py-2 bg-navy-800 text-white rounded-xl text-sm font-bold hover:bg-navy-900 transition"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 relative z-10">
      {showDeleteConfirm && (
        <ConfirmModal
          title="Eliminar materia"
          message={`¿Eliminar "${subject.name}"? Si no tiene sesiones, inscripciones ni pénsum asociados se borrará permanentemente. Si tiene datos asociados, se archivará en su lugar para no perder el historial.`}
          confirmLabel="Eliminar"
          loadingLabel="Eliminando..."
          loading={loading}
          icon={Trash2}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {isActive ? (
        <>
          <button
            onClick={() => setIsEditing(true)}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-navy-700 hover:bg-navy-50 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
            title="Editar"
            aria-label={`Editar ${subject.name}`}
          >
            <Pencil className="w-5 h-5" strokeWidth={2} />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
            title="Eliminar materia"
            aria-label={`Eliminar ${subject.name}`}
          >
            <Trash2 className="w-5 h-5" strokeWidth={2} />
          </button>
        </>
      ) : (
        <button
          onClick={handleReactivate}
          disabled={loading}
          className="px-3 py-1 text-xs font-bold text-navy-700 bg-navy-50 hover:bg-navy-100 rounded-lg transition disabled:opacity-50"
          title="Reactivar materia"
        >
          {loading ? '...' : 'Reactivar'}
        </button>
      )}
    </div>
  )
}

export function SubjectCareerAssignment({
  subjectId,
  assignments,
  careers,
}: {
  subjectId: string
  assignments: SubjectCareerLink[]
  careers: Career[]
}) {
  const [adding, setAdding] = useState(false)
  const [careerId, setCareerId] = useState('')
  const [level, setLevel] = useState('')
  const [loading, setLoading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const showToast = useToast()

  const assignedCareerIds = new Set(assignments.map((a) => a.career?.id))
  const availableCareers = careers.filter((c) => !assignedCareerIds.has(c.id))

  const handleAdd = async () => {
    if (!careerId) return
    setLoading(true)
    const result = await assignSubjectToCareer(subjectId, careerId, level ? Number(level) : null)
    if (result.success) {
      showToast('Materia asignada a la carrera.', 'success')
      setAdding(false)
      setCareerId('')
      setLevel('')
    } else {
      showToast(result.error || 'No se pudo asignar la materia.', 'error')
    }
    setLoading(false)
  }

  const handleRemove = async (link: SubjectCareerLink) => {
    if (!link.career) return
    setRemovingId(link.id)
    const result = await removeSubjectFromCareer(link.id, link.career.id)
    if (result.success) {
      showToast(`Quitada de "${link.career.name}".`, 'success')
    } else {
      showToast(result.error || 'No se pudo quitar la materia.', 'error')
    }
    setRemovingId(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {assignments.map((a) =>
        a.career ? (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-sky-50 text-sky-700 rounded-lg"
          >
            {a.career.code}
            {a.level != null && (
              <span className="text-sky-400 font-medium">· Semestre {a.level}</span>
            )}
            <button
              type="button"
              onClick={() => handleRemove(a)}
              disabled={removingId === a.id}
              className="text-sky-400 hover:text-sky-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 rounded"
              title="Quitar de esta carrera"
              aria-label={`Quitar de ${a.career.name}`}
            >
              ×
            </button>
          </span>
        ) : null
      )}

      {adding ? (
        <div className="flex items-center gap-1.5">
          <select
            value={careerId}
            onChange={(e) => setCareerId(e.target.value)}
            className="px-2 py-1 text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg"
          >
            <option value="">Carrera...</option>
            {availableCareers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={20}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="Semestre"
            className="w-16 px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading || !careerId}
            className="px-2 py-1 text-xs font-bold bg-navy-800 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? '...' : 'OK'}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="px-2 py-1 text-xs font-bold text-gray-400 hover:text-gray-600"
          >
            Cancelar
          </button>
        </div>
      ) : availableCareers.length > 0 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-2 py-1 text-xs font-bold text-gray-400 border border-dashed border-gray-300 rounded-lg hover:text-sky-600 hover:border-sky-300 transition"
        >
          + Carrera
        </button>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------
// Horario semanal (subject_schedules) -- usado por
// "Calcular sesiones planificadas" para estimar total_planned_sessions
// a partir de bloques x semanas del período, sin dejar de ser editable.
// ------------------------------------------------------------

function SubjectScheduleManager({
  subjectId,
  periodStart,
  periodEnd,
  onCalculate,
}: {
  subjectId: string
  periodStart?: string | null
  periodEnd?: string | null
  onCalculate: (total: number) => void
}) {
  const [schedules, setSchedules] = useState<SubjectSchedule[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('09:00')
  const [modality, setModality] = useState<'PRESENCIAL' | 'VIRTUAL'>('PRESENCIAL')
  const [savingAdd, setSavingAdd] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const showToast = useToast()

  useEffect(() => {
    listSubjectSchedules(subjectId).then((result) => {
      if (result.success) {
        setSchedules(result.schedules || [])
      } else {
        showToast(result.error || 'No se pudo cargar el horario.', 'error')
      }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  const reload = async () => {
    setLoading(true)
    const result = await listSubjectSchedules(subjectId)
    if (result.success) setSchedules(result.schedules || [])
    else showToast(result.error || 'No se pudo cargar el horario.', 'error')
    setLoading(false)
  }

  const handleAdd = async () => {
    setSavingAdd(true)
    const result = await addSubjectSchedule(subjectId, {
      dayOfWeek: Number(dayOfWeek),
      startTime,
      endTime,
      modality,
    })
    if (result.success) {
      showToast('Bloque de horario agregado.', 'success')
      setAdding(false)
      await reload()
    } else {
      showToast(result.error || 'No se pudo agregar el bloque.', 'error')
    }
    setSavingAdd(false)
  }

  const handleRemove = async (scheduleId: string) => {
    setRemovingId(scheduleId)
    const result = await removeSubjectSchedule(scheduleId, subjectId)
    if (result.success) {
      showToast('Bloque de horario eliminado.', 'success')
      await reload()
    } else {
      showToast(result.error || 'No se pudo quitar el bloque.', 'error')
    }
    setRemovingId(null)
  }

  const handleCalculate = () => {
    const count = schedules?.length || 0
    const total = computePlannedSessions(count, periodStart, periodEnd)
    if (total === null) {
      showToast(
        count === 0
          ? 'Agrega al menos un bloque de horario para poder calcular.'
          : 'El período seleccionado no tiene fechas de inicio y fin válidas.',
        'error'
      )
      return
    }
    onCalculate(total)
    showToast(`Clases planificadas calculadas: ${total}.`, 'success')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" strokeWidth={2} />
          Horario
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[11px] font-bold text-navy-700 hover:text-navy-900 underline underline-offset-2"
          >
            + Agregar bloque
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Cargando horario...</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {(schedules || []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
            >
              <span className="font-semibold text-gray-700">
                {DAY_NAMES[s.day_of_week]} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-md font-bold ${
                  s.modality === 'PRESENCIAL'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-sky-50 text-sky-700'
                }`}
              >
                {s.modality === 'PRESENCIAL' ? 'Presencial' : 'Virtual'}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(s.id)}
                disabled={removingId === s.id}
                className="text-gray-400 hover:text-red-600 disabled:opacity-50 shrink-0"
                title="Quitar bloque"
                aria-label="Quitar bloque de horario"
              >
                ×
              </button>
            </div>
          ))}
          {(schedules || []).length === 0 && !adding && (
            <p className="text-xs text-gray-400">Sin bloques de horario definidos.</p>
          )}
        </div>
      )}

      {adding && (
        <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2 mb-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className={`${inputClass} text-xs appearance-none cursor-pointer`}
            >
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value as 'PRESENCIAL' | 'VIRTUAL')}
              className={`${inputClass} text-xs appearance-none cursor-pointer`}
            >
              <option value="PRESENCIAL">Presencial</option>
              <option value="VIRTUAL">Virtual</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`${inputClass} text-xs`}
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={`${inputClass} text-xs`}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={savingAdd}
              className="flex-1 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={savingAdd}
              className="flex-1 py-1.5 bg-navy-800 text-white rounded-lg text-xs font-bold hover:bg-navy-900 transition disabled:opacity-50"
            >
              {savingAdd ? 'Guardando...' : 'Agregar'}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleCalculate}
        className="w-full py-1.5 text-xs font-bold text-navy-700 bg-navy-50 hover:bg-navy-100 rounded-lg transition"
        title="Usa la cantidad de bloques de horario x semanas del período seleccionado"
      >
        Calcular sesiones planificadas
      </button>
    </div>
  )
}
