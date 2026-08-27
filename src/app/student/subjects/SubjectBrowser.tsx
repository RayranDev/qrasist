'use client'

import { useMemo, useState } from 'react'
import { requestEnrollmentBySubjectId } from '@/lib/actions/enrollmentRequests'
import { useToast } from '@/components/toast/ToastProvider'
import FilterPanel, { FilterField } from '@/components/FilterPanel'
import { Send, Check, Clock, X } from 'lucide-react'

interface Career {
  id: string
  name: string
  code: string
}

type Status = 'enrolled' | 'pending' | 'rejected' | 'none'

interface SubjectItem {
  subjectCareerId: string
  level: number | null
  career: Career
  subject: { id: string; name: string; code: string }
  status: Status
}

const selectClass =
  'px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:border-emerald-500 appearance-none cursor-pointer'

export default function SubjectBrowser({
  careers,
  items,
}: {
  careers: Career[]
  items: SubjectItem[]
}) {
  const [careerFilter, setCareerFilter] = useState(careers.length === 1 ? careers[0].id : '')
  const [levelFilter, setLevelFilter] = useState('')
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState<Record<string, Status>>({})
  const showToast = useToast()

  const filteredByCareer = careerFilter ? items.filter((i) => i.career.id === careerFilter) : items

  const availableLevels = useMemo(() => {
    const levels = new Set(
      filteredByCareer.map((i) => i.level).filter((l): l is number => l != null)
    )
    return Array.from(levels).sort((a, b) => a - b)
  }, [filteredByCareer])

  const visible = levelFilter
    ? filteredByCareer.filter((i) => String(i.level) === levelFilter)
    : filteredByCareer

  const handleRequest = async (item: SubjectItem) => {
    setRequestingId(item.subject.id)
    const result = await requestEnrollmentBySubjectId(item.subject.id)
    if (result.success) {
      showToast(`Solicitud enviada para ${item.subject.name}.`, 'success')
      setLocalStatus((prev) => ({ ...prev, [item.subject.id]: 'pending' }))
    } else {
      showToast(result.error || 'No se pudo enviar la solicitud.', 'error')
    }
    setRequestingId(null)
  }

  const showFilters = careers.length > 1 || availableLevels.length > 0

  return (
    <div className="flex flex-col gap-4">
      {showFilters && (
        <FilterPanel>
          {careers.length > 1 && (
            <FilterField label="Carrera">
              <select
                value={careerFilter}
                onChange={(e) => {
                  setCareerFilter(e.target.value)
                  setLevelFilter('')
                }}
                className={selectClass}
              >
                <option value="">Todas</option>
                {careers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
          )}
          {availableLevels.length > 0 && (
            <FilterField label="Semestre">
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className={selectClass}
              >
                <option value="">Todos</option>
                {availableLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Semestre {lvl}
                  </option>
                ))}
              </select>
            </FilterField>
          )}
        </FilterPanel>
      )}

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-500 font-medium">No hay materias para este filtro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const status = localStatus[item.subject.id] || item.status
            return (
              <div
                key={item.subjectCareerId}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{item.subject.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-emerald-600">{item.subject.code}</span>
                    <span>·</span>
                    <span>{item.career.code}</span>
                    {item.level != null && (
                      <>
                        <span>·</span>
                        <span>Semestre {item.level}</span>
                      </>
                    )}
                  </p>
                </div>

                <StatusAction
                  status={status}
                  loading={requestingId === item.subject.id}
                  onRequest={() => handleRequest(item)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusAction({
  status,
  loading,
  onRequest,
}: {
  status: Status
  loading: boolean
  onRequest: () => void
}) {
  if (status === 'enrolled') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg">
        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        Inscrito
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 rounded-lg">
        <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
        Pendiente
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
          Rechazada
        </span>
        <button
          onClick={onRequest}
          disabled={loading}
          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline transition disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Solicitar de nuevo'}
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={onRequest}
      disabled={loading}
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
    >
      <Send className="w-3.5 h-3.5" strokeWidth={2.5} />
      {loading ? 'Enviando...' : 'Solicitar'}
    </button>
  )
}
