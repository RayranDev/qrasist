'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  createCareer,
  updateCareer,
  deleteCareer,
  setCareerActive,
  createPeriod,
  updatePeriod,
  deletePeriod,
  setPeriodActive,
} from '@/lib/actions/academic'
import { useToast } from '@/components/toast/ToastProvider'
import ConfirmModal from '@/components/ConfirmModal'
import CreateFormToggle from '@/components/CreateFormToggle'
import { Pencil, Trash2 } from 'lucide-react'

const inputClass =
  'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm'

interface Career {
  id: string
  name: string
  code: string
  is_active: boolean
}

interface Period {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

export function CreateCareerForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const result = await createCareer(formData)
    if (result.success) {
      ;(e.target as HTMLFormElement).reset()
      setOpen(false)
      showToast(`Carrera "${name}" creada.`, 'success')
    } else {
      showToast(result.error || 'No se pudo crear la carrera.', 'error')
    }
    setLoading(false)
  }

  if (!open) {
    return <CreateFormToggle label="Nueva Carrera" onClick={() => setOpen(true)} />
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Nueva Carrera</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-bold text-gray-400 hover:text-gray-600 transition"
        >
          Cancelar
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Nombre
          </label>
          <input
            required
            name="name"
            type="text"
            placeholder="Ej. Ingeniería de Sistemas"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Código
          </label>
          <input required name="code" type="text" placeholder="Ej. ISIS" className={inputClass} />
        </div>
      </div>
      <button
        disabled={loading}
        type="submit"
        className="mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50"
      >
        {loading ? 'Guardando...' : 'Agregar Carrera'}
      </button>
    </form>
  )
}

export function CareerList({ careers }: { careers: Career[] }) {
  const showToast = useToast()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Career | null>(null)
  const [deleting, setDeleting] = useState<Career | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')

  const handleReactivate = async (career: Career) => {
    setLoadingId(career.id)
    const result = await setCareerActive(career.id, true)
    if (result.success) {
      showToast(`"${career.name}" reactivada.`, 'success')
    } else {
      showToast(result.error || 'No se pudo reactivar la carrera.', 'error')
    }
    setLoadingId(null)
  }

  const openEdit = (career: Career) => {
    setEditing(career)
    setEditName(career.name)
    setEditCode(career.code)
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    setLoadingId(editing.id)
    const result = await updateCareer(editing.id, { name: editName, code: editCode })
    if (result.success) {
      showToast('Carrera actualizada.', 'success')
      setEditing(null)
    } else {
      showToast(result.error || 'No se pudo actualizar la carrera.', 'error')
    }
    setLoadingId(null)
  }

  const handleDelete = async () => {
    if (!deleting) return
    setLoadingId(deleting.id)
    const result = await deleteCareer(deleting.id)
    if (result.success) {
      showToast(
        result.archived
          ? `"${deleting.name}" tiene datos asociados: se archivó en vez de borrarse.`
          : `"${deleting.name}" eliminada permanentemente.`,
        'success'
      )
    } else {
      showToast(result.error || 'No se pudo eliminar la carrera.', 'error')
    }
    setLoadingId(null)
    setDeleting(null)
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Editar Carrera</h3>
            <div className="space-y-4 mb-6 text-left">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  type="text"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Código</label>
                <input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  type="text"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                disabled={loadingId === editing.id}
                onClick={() => setEditing(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                disabled={loadingId === editing.id}
                onClick={handleSaveEdit}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition"
              >
                {loadingId === editing.id ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <ConfirmModal
          title="Eliminar carrera"
          message={`¿Eliminar "${deleting.name}"? Si no tiene materias, estudiantes ni profesores asociados se borrará permanentemente. Si tiene datos asociados, se archivará en su lugar.`}
          confirmLabel="Eliminar"
          loadingLabel="Eliminando..."
          loading={loadingId === deleting.id}
          icon={Trash2}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {careers.length > 0 ? (
        <div className="divide-y divide-gray-50">
          {careers.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="font-bold text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400 font-mono">{c.code}</p>
              </div>
              <div className="flex items-center gap-3">
                {!c.is_active && (
                  <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                    Archivada
                  </span>
                )}
                <Link
                  href={`/admin/academic/${c.id}/pensum`}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg transition bg-sky-50 text-sky-700 hover:bg-sky-100"
                >
                  Ver Pénsum
                </Link>
                <button
                  disabled={loadingId === c.id}
                  onClick={() => openEdit(c)}
                  className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                  title="Editar"
                >
                  <Pencil className="w-4 h-4" strokeWidth={2} />
                </button>
                {c.is_active ? (
                  <button
                    disabled={loadingId === c.id}
                    onClick={() => setDeleting(c)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Eliminar carrera"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={2} />
                  </button>
                ) : (
                  <button
                    disabled={loadingId === c.id}
                    onClick={() => handleReactivate(c)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-50 bg-gray-50 text-gray-600 hover:bg-gray-100"
                  >
                    {loadingId === c.id ? '...' : 'Reactivar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-6 py-6 text-sm text-gray-400 italic text-center">
          Sin carreras registradas.
        </p>
      )}
    </div>
  )
}

export function CreatePeriodForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const showToast = useToast()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const startDate = formData.get('start_date') as string
    const endDate = formData.get('end_date') as string
    if (startDate && endDate && startDate >= endDate) {
      showToast('La fecha de inicio debe ser anterior a la fecha de fin.', 'error')
      setLoading(false)
      return
    }
    const result = await createPeriod(formData)
    if (result.success) {
      ;(e.target as HTMLFormElement).reset()
      setOpen(false)
      showToast(`Período "${name}" creado.`, 'success')
    } else {
      showToast(result.error || 'No se pudo crear el período.', 'error')
    }
    setLoading(false)
  }

  if (!open) {
    return <CreateFormToggle label="Nuevo Período Académico" onClick={() => setOpen(true)} />
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Nuevo Período Académico</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-bold text-gray-400 hover:text-gray-600 transition"
        >
          Cancelar
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Período
          </label>
          <input required name="name" type="text" placeholder="Ej. 2026-1" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Inicio (opcional)
          </label>
          <input name="start_date" type="date" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
            Fin (opcional)
          </label>
          <input name="end_date" type="date" className={inputClass} />
        </div>
      </div>
      <button
        disabled={loading}
        type="submit"
        className="mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50"
      >
        {loading ? 'Guardando...' : 'Agregar Período'}
      </button>
    </form>
  )
}

export function PeriodList({ periods }: { periods: Period[] }) {
  const showToast = useToast()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Period | null>(null)
  const [deleting, setDeleting] = useState<Period | null>(null)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  const handleReactivate = async (period: Period) => {
    setLoadingId(period.id)
    const result = await setPeriodActive(period.id, true)
    if (result.success) {
      showToast(`Período "${period.name}" reactivado.`, 'success')
    } else {
      showToast(result.error || 'No se pudo reactivar el período.', 'error')
    }
    setLoadingId(null)
  }

  const openEdit = (period: Period) => {
    setEditing(period)
    setEditName(period.name)
    setEditStart(period.start_date || '')
    setEditEnd(period.end_date || '')
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    if (editStart && editEnd && editStart >= editEnd) {
      showToast('La fecha de inicio debe ser anterior a la fecha de fin.', 'error')
      return
    }
    setLoadingId(editing.id)
    const result = await updatePeriod(editing.id, {
      name: editName,
      start_date: editStart || null,
      end_date: editEnd || null,
    })
    if (result.success) {
      showToast('Período actualizado.', 'success')
      setEditing(null)
    } else {
      showToast(result.error || 'No se pudo actualizar el período.', 'error')
    }
    setLoadingId(null)
  }

  const handleDelete = async () => {
    if (!deleting) return
    setLoadingId(deleting.id)
    const result = await deletePeriod(deleting.id)
    if (result.success) {
      showToast(
        result.archived
          ? `Período "${deleting.name}" tiene materias asociadas: se archivó en vez de borrarse.`
          : `Período "${deleting.name}" eliminado permanentemente.`,
        'success'
      )
    } else {
      showToast(result.error || 'No se pudo eliminar el período.', 'error')
    }
    setLoadingId(null)
    setDeleting(null)
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Editar Período</h3>
            <div className="space-y-4 mb-6 text-left">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Período</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  type="text"
                  placeholder="Ej. 2026-1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Inicio (opcional)
                </label>
                <input
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  type="date"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Fin (opcional)</label>
                <input
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  type="date"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                disabled={loadingId === editing.id}
                onClick={() => setEditing(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                disabled={loadingId === editing.id}
                onClick={handleSaveEdit}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition"
              >
                {loadingId === editing.id ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <ConfirmModal
          title="Eliminar período"
          message={`¿Eliminar "${deleting.name}"? Si no tiene materias asociadas se borrará permanentemente. Si tiene materias asociadas, se archivará en su lugar.`}
          confirmLabel="Eliminar"
          loadingLabel="Eliminando..."
          loading={loadingId === deleting.id}
          icon={Trash2}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {periods.length > 0 ? (
        <div className="divide-y divide-gray-50">
          {periods.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-6 py-4">
              <p className="font-bold text-gray-900">{p.name}</p>
              <div className="flex items-center gap-3">
                {!p.is_active && (
                  <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                    Archivado
                  </span>
                )}
                <button
                  disabled={loadingId === p.id}
                  onClick={() => openEdit(p)}
                  className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                  title="Editar"
                >
                  <Pencil className="w-4 h-4" strokeWidth={2} />
                </button>
                {p.is_active ? (
                  <button
                    disabled={loadingId === p.id}
                    onClick={() => setDeleting(p)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Eliminar período"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={2} />
                  </button>
                ) : (
                  <button
                    disabled={loadingId === p.id}
                    onClick={() => handleReactivate(p)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-50 bg-gray-50 text-gray-600 hover:bg-gray-100"
                  >
                    {loadingId === p.id ? '...' : 'Reactivar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-6 py-6 text-sm text-gray-400 italic text-center">
          Sin períodos registrados.
        </p>
      )}
    </div>
  )
}
