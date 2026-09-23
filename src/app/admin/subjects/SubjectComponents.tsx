'use client'

import { useState, useEffect } from 'react'
import {
  createSubject,
  deleteSubject,
  updateSubject,
  reactivateSubject,
} from '@/lib/actions/adminSubjects'
import { assignSubjectToCareer, removeSubjectFromCareer } from '@/lib/actions/academic'
import { useToast } from '@/components/toast/ToastProvider'
import ConfirmModal from '@/components/ConfirmModal'
import CreateFormToggle from '@/components/CreateFormToggle'
import { Plus, Pencil, Trash2 } from 'lucide-react'

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
  absence_rule_type?: 'PERCENTAGE' | 'FIXED_COUNT'
  max_absence_percentage?: number
  max_absence_count?: number | null
  total_planned_sessions?: number
  late_after_minutes?: number | null
  lates_per_absence?: number | null
}

export function CreateSubjectForm({ periods }: { periods: Period[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const result = await createSubject(formData)
    if (result.success) {
      ;(e.target as HTMLFormElement).reset()
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
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 ml-1">
          Regla de Inasistencias y Reprobación
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1">
              Cálculo por
            </label>
            <select
              name="absence_rule_type"
              className={`${inputClass} appearance-none cursor-pointer text-xs`}
            >
              <option value="PERCENTAGE">Porcentaje (% de inasistencia)</option>
              <option value="FIXED_COUNT">Cantidad fija de fallas</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1">
              % Máx / Faltas Permitidas
            </label>
            <div className="flex gap-2">
              <input
                name="max_absence_percentage"
                type="number"
                defaultValue={20}
                min={1}
                max={100}
                placeholder="20%"
                className={`${inputClass} text-xs`}
                title="% Máximo de inasistencias"
              />
              <input
                name="max_absence_count"
                type="number"
                min={1}
                max={50}
                placeholder="Faltas (ej. 4)"
                className={`${inputClass} text-xs`}
                title="Cantidad fija de fallas (si aplica)"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1">
              Clases Semestre (Total)
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
      </div>

      <div className="pt-3 mt-3 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 ml-1">
          Tardanzas
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1">
              Tolerancia (minutos)
            </label>
            <input
              name="late_after_minutes"
              type="number"
              defaultValue={15}
              min={1}
              max={180}
              placeholder="Vacío = sin seguimiento"
              className={`${inputClass} text-xs`}
              title="Minutos tras abrir el QR a partir de los cuales el escaneo cuenta como tarde. Vacío desactiva el seguimiento de tardanzas."
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1 ml-1">
              Tardanzas por falta
            </label>
            <input
              name="lates_per_absence"
              type="number"
              min={1}
              max={10}
              placeholder="Ej. 3 (opcional)"
              className={`${inputClass} text-xs`}
              title="Cada cuántas tardanzas se suma una inasistencia. Vacío = las tardanzas nunca se convierten en falta."
            />
          </div>
        </div>
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

export function SubjectActionButtons({
  subject,
  professors,
  periods,
  subjectCareerIds,
}: {
  subject: Subject
  professors: Professor[]
  periods: Period[]
  subjectCareerIds: string[]
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
  const [absenceRuleType, setAbsenceRuleType] = useState<'PERCENTAGE' | 'FIXED_COUNT'>(
    subject.absence_rule_type || 'PERCENTAGE'
  )
  const [maxAbsencePercentage, setMaxAbsencePercentage] = useState(
    subject.max_absence_percentage ?? 20
  )
  const [maxAbsenceCount, setMaxAbsenceCount] = useState<number | string>(
    subject.max_absence_count ?? ''
  )
  const [totalPlannedSessions, setTotalPlannedSessions] = useState(
    subject.total_planned_sessions ?? 16
  )
  const [lateAfterMinutes, setLateAfterMinutes] = useState<number | string>(
    subject.late_after_minutes ?? 15
  )
  const [latesPerAbsence, setLatesPerAbsence] = useState<number | string>(
    subject.lates_per_absence ?? ''
  )
  const showToast = useToast()

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
      absence_rule_type: absenceRuleType,
      max_absence_percentage: Number(maxAbsencePercentage) || 20,
      max_absence_count: maxAbsenceCount !== '' ? Number(maxAbsenceCount) : null,
      total_planned_sessions: Number(totalPlannedSessions) || 16,
      late_after_minutes: lateAfterMinutes !== '' ? Number(lateAfterMinutes) : null,
      lates_per_absence: latesPerAbsence !== '' ? Number(latesPerAbsence) : null,
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
                  Vinculá esta materia a una carrera primero para poder asignar profesor.
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
              <p className="text-xs font-bold text-gray-700 mb-2">Regla de Inasistencias</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Tipo de Regla</label>
                  <select
                    value={absenceRuleType}
                    onChange={(e) =>
                      setAbsenceRuleType(e.target.value as 'PERCENTAGE' | 'FIXED_COUNT')
                    }
                    className={`${inputClass} text-xs appearance-none`}
                  >
                    <option value="PERCENTAGE">Porcentaje (%)</option>
                    <option value="FIXED_COUNT">Cantidad de Fallas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    {absenceRuleType === 'PERCENTAGE' ? '% Límite' : 'Faltas Máx.'}
                  </label>
                  {absenceRuleType === 'PERCENTAGE' ? (
                    <input
                      type="number"
                      value={maxAbsencePercentage}
                      onChange={(e) => setMaxAbsencePercentage(Number(e.target.value))}
                      min={1}
                      max={100}
                      className={`${inputClass} text-xs`}
                    />
                  ) : (
                    <input
                      type="number"
                      value={maxAbsenceCount}
                      onChange={(e) => setMaxAbsenceCount(e.target.value)}
                      placeholder="Ej. 4"
                      min={1}
                      max={50}
                      className={`${inputClass} text-xs`}
                    />
                  )}
                </div>
              </div>
              <div>
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
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-700 mb-2">Tardanzas</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Tolerancia (min)</label>
                  <input
                    type="number"
                    value={lateAfterMinutes}
                    onChange={(e) => setLateAfterMinutes(e.target.value)}
                    min={1}
                    max={180}
                    placeholder="Vacío = sin seguimiento"
                    title="Minutos tras abrir el QR a partir de los cuales el escaneo cuenta como tarde. Vacío desactiva el seguimiento de tardanzas."
                    className={`${inputClass} text-xs`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Tardanzas por falta
                  </label>
                  <input
                    type="number"
                    value={latesPerAbsence}
                    onChange={(e) => setLatesPerAbsence(e.target.value)}
                    min={1}
                    max={10}
                    placeholder="Ej. 3 (opcional)"
                    title="Cada cuántas tardanzas se suma una inasistencia. Vacío = las tardanzas nunca se convierten en falta."
                    className={`${inputClass} text-xs`}
                  />
                </div>
              </div>
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
              disabled={loading}
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
