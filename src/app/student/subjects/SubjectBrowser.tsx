'use client'

import { useMemo, useState } from 'react'
import { requestEnrollmentBySubjectId } from '@/lib/actions/enrollmentRequests'
import { useToast } from '@/components/toast/ToastProvider'
import FilterPanel, { FilterField } from '@/components/FilterPanel'
import {
  Check,
  Clock,
  X,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  FileWarning,
  SearchX,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { StudentAttendanceSummary } from '@/lib/utils/attendancePolicy'
import type { MissedSessionItem } from './missedSessions'
import JustifyModal from './JustifyModal'

interface Career {
  id: string
  name: string
  code: string
}

type Status = 'enrolled' | 'pending' | 'rejected' | 'none'

export interface SubjectItem {
  subjectCareerId: string
  level: number | null
  career: Career
  subject: { id: string; name: string; code: string }
  status: Status
  attendanceSummary?: StudentAttendanceSummary
  missedSessions?: MissedSessionItem[]
}

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
  const [justifyTarget, setJustifyTarget] = useState<MissedSessionItem | null>(null)
  const showToast = useToast()

  const handleJustified = () => {
    showToast('Justificación enviada. Te avisaremos cuando el docente la revise.', 'success')
    setJustifyTarget(null)
    // El listado de sesiones perdidas y los conteos de faltas vienen
    // del server component -- un refresh trae el estado actualizado
    // (revalidatePath ya invalidó la cache en el servidor).
    window.location.reload()
  }

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

  return (
    <div className="flex flex-col gap-4">
      <FilterPanel>
        {careers.length > 1 && (
          <FilterField label="Carrera">
            <select
              value={careerFilter}
              onChange={(e) => {
                setCareerFilter(e.target.value)
                setLevelFilter('')
              }}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none"
            >
              <option value="">Todas las carreras</option>
              {careers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </FilterField>
        )}

        {availableLevels.length > 0 && (
          <FilterField label="Semestre / Nivel">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none"
            >
              <option value="">Todos los semestres</option>
              {availableLevels.map((lvl) => (
                <option key={lvl} value={String(lvl)}>
                  Semestre {lvl}
                </option>
              ))}
            </select>
          </FilterField>
        )}
      </FilterPanel>

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-gray-200">
          <EmptyState
            icon={<SearchX className="w-5 h-5" />}
            title="No hay materias para el filtro seleccionado"
            description="Probá con otro filtro o carrera."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const status = localStatus[item.subject.id] || item.status
            const summary = item.attendanceSummary

            return (
              <div
                key={item.subjectCareerId}
                className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs flex flex-col gap-3 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{item.subject.name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="font-mono text-navy-700 font-bold bg-navy-50 px-1.5 py-0.5 rounded text-[11px]">
                        {item.subject.code}
                      </span>
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

                {/* Si está inscrito, mostramos su medidor de inasistencias y alertas */}
                {status === 'enrolled' && summary && (
                  <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500 font-medium">
                        Asistencia:{' '}
                        <strong className="text-gray-900 font-bold">
                          {summary.attendancesCount}/{summary.sessionsHeld}
                        </strong>
                      </span>
                      {summary.absencesCount > 0 && (
                        <span className="text-red-700 font-bold">
                          ({summary.absencesCount} falla{summary.absencesCount > 1 ? 's' : ''})
                        </span>
                      )}
                      {summary.justifiedCount > 0 && (
                        <Badge variant="info" size="sm">
                          {summary.justifiedCount} justificada
                          {summary.justifiedCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {summary.lateCount > 0 && (
                        <Badge variant="warning" size="sm">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {summary.lateCount} tarde{summary.lateCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    <div>
                      {summary.status === 'FAILED_ATTENDANCE' ? (
                        <Badge variant="danger" size="sm">
                          <AlertOctagon className="w-3 h-3 text-red-600" />
                          Reprobado por fallas
                        </Badge>
                      ) : summary.status === 'WARNING' ? (
                        <Badge variant="warning" size="sm">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          {summary.remainingAbsences === 0
                            ? 'Límite alcanzado'
                            : `Riesgo: queda ${summary.remainingAbsences} falta`}
                        </Badge>
                      ) : (
                        <Badge variant="success" size="sm">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Al día ({summary.remainingAbsences} permitidas)
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {status === 'enrolled' && item.missedSessions && item.missedSessions.length > 0 && (
                  <MissedSessionsList
                    sessions={item.missedSessions}
                    onJustify={(s) => setJustifyTarget(s)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {justifyTarget && (
        <JustifyModal
          session={justifyTarget}
          onClose={() => setJustifyTarget(null)}
          onSubmitted={handleJustified}
        />
      )}
    </div>
  )
}

function MissedSessionsList({
  sessions,
  onJustify,
}: {
  sessions: MissedSessionItem[]
  onJustify: (session: MissedSessionItem) => void
}) {
  return (
    <div className="pt-2.5 border-t border-gray-100 space-y-2">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <FileWarning className="w-3.5 h-3.5" />
        Sesiones sin justificar
      </p>
      {sessions.map((s) => (
        <div
          key={s.sessionId}
          className="flex items-center justify-between gap-2 bg-gray-50/80 rounded-xl px-3 py-2"
        >
          <span className="text-xs text-gray-600 font-medium">
            {new Date(s.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
          </span>
          <JustificationChip session={s} onJustify={onJustify} />
        </div>
      ))}
    </div>
  )
}

function JustificationChip({
  session,
  onJustify,
}: {
  session: MissedSessionItem
  onJustify: (session: MissedSessionItem) => void
}) {
  const status = session.justification?.status

  if (status === 'PENDING') {
    return (
      <Badge variant="warning" size="sm">
        <Clock className="w-3 h-3" />
        En revisión
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

  if (status === 'REJECTED') {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="danger" size="sm">
          <X className="w-3 h-3" />
          Rechazada
        </Badge>
        {session.withinWindow && (
          <Button variant="outline" size="sm" onClick={() => onJustify(session)}>
            Volver a enviar
          </Button>
        )}
      </div>
    )
  }

  if (!session.withinWindow) {
    return (
      <Badge variant="neutral" size="sm">
        Sin justificar
      </Badge>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="neutral" size="sm">
        Sin justificar
      </Badge>
      <Button variant="outline" size="sm" onClick={() => onJustify(session)}>
        Justificar
      </Button>
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
      <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-100">
        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        Inscrito
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 rounded-lg border border-amber-100">
        <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
        Pendiente
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <div className="shrink-0 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
          Rechazada
        </span>
        <Button variant="outline" size="sm" isLoading={loading} onClick={onRequest}>
          Reintentar
        </Button>
      </div>
    )
  }
  return (
    <Button variant="primary" size="sm" isLoading={loading} onClick={onRequest}>
      Inscribirse
    </Button>
  )
}
