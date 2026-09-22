'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { getSessionRoster, type RosterStudent } from '@/lib/actions/attendanceManual'
import AttendanceRowActions from './AttendanceRowActions'
import LocalTime from '@/components/LocalTime'

interface SessionRosterPanelProps {
  sessionId: string
}

const POLL_MS = 5000

export default function SessionRosterPanel({ sessionId }: SessionRosterPanelProps) {
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [totalEnrolled, setTotalEnrolled] = useState(0)
  const [totalRegistered, setTotalRegistered] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const fetchRoster = useCallback(async () => {
    const res = await getSessionRoster(sessionId)
    if (res.success && res.roster) {
      setRoster(res.roster)
      setTotalEnrolled(res.totalEnrolled ?? 0)
      setTotalRegistered(res.totalRegistered ?? 0)
    }
    setLoaded(true)
  }, [sessionId])

  useEffect(() => {
    // Se pausa el polling con la pestaña oculta (proyector bloqueado o
    // el profesor cambió de app) para no gastar cuota de la API sin
    // que nadie esté mirando el panel. La primera carga se dispara
    // vía setTimeout(0) en vez de una llamada directa en el cuerpo del
    // efecto, igual que el patrón de rotación de QRDisplay.tsx.
    const poll = () => {
      if (document.hidden) return
      fetchRoster()
    }
    const immediate = setTimeout(poll, 0)
    const interval = setInterval(poll, POLL_MS)

    return () => {
      clearTimeout(immediate)
      clearInterval(interval)
    }
  }, [fetchRoster])

  return (
    <div className="w-full bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-gray-50/60 transition"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-navy-50 text-navy-700 flex items-center justify-center shrink-0">
            <Users className="w-4.5 h-4.5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">
              {totalRegistered} de {totalEnrolled} inscritos registrados
            </p>
            <p className="text-xs text-gray-400">Se actualiza automáticamente cada 5s</p>
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-4 max-h-105 overflow-y-auto divide-y divide-gray-50 border-t border-gray-100">
          {!loaded ? (
            <p className="text-xs text-gray-400 text-center py-6">Cargando...</p>
          ) : roster.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">
              No hay estudiantes inscritos en esta materia.
            </p>
          ) : (
            roster.map((r) => (
              <div
                key={r.studentId}
                className="flex items-center justify-between gap-3 py-2.5 px-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{r.name}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge
                      variant={
                        r.status === 'LATE'
                          ? 'warning'
                          : r.status === 'PRESENT'
                            ? 'success'
                            : 'neutral'
                      }
                      size="sm"
                    >
                      {r.status === 'LATE'
                        ? 'Tarde'
                        : r.status === 'PRESENT'
                          ? 'Presente'
                          : 'Sin registrar'}
                    </Badge>
                    {r.isManual && (
                      <Badge variant="info" size="sm">
                        Manual
                      </Badge>
                    )}
                    {r.scannedAt && (
                      <span className="text-[11px] text-gray-400">
                        <LocalTime date={r.scannedAt} formatStr="h:mm a" />
                      </span>
                    )}
                  </div>
                </div>
                <AttendanceRowActions
                  sessionId={sessionId}
                  studentId={r.studentId}
                  attendanceId={r.attendanceId}
                  currentStatus={r.status}
                  onChanged={fetchRoster}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
