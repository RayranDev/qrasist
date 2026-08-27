'use client'

import { useState } from 'react'
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
  'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm'

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
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 items-end">
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
        <div>
          <button
            disabled={loading}
            type="submit"
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-md active:scale-95 flex items-center justify-center gap-2"
          >
            {loading ? 'Guardando...' : 'Agregar Materia'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        El profesor se asigna después, una vez que la materia tenga una carrera vinculada.
      </p>
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(subject.name)
  const [code, setCode] = useState(subject.code)
  const [profId, setProfId] = useState(subject.professor_id || '')
  const [periodId, setPeriodId] = useState(subject.period_id || '')
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
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Editar Materia</h3>
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
              {hasCareer && eligibleProfessors.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Ningún profesor pertenece todavía a la(s) carrera(s) de esta materia.
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
              className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition"
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
            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
            title="Editar"
          >
            <Pencil className="w-5 h-5" strokeWidth={2} />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            title="Eliminar materia"
          >
            <Trash2 className="w-5 h-5" strokeWidth={2} />
          </button>
        </>
      ) : (
        <button
          onClick={handleReactivate}
          disabled={loading}
          className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50"
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
              className="text-sky-400 hover:text-sky-700 disabled:opacity-50"
              title="Quitar de esta carrera"
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
            className="px-2 py-1 text-xs font-bold bg-emerald-600 text-white rounded-lg disabled:opacity-50"
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
