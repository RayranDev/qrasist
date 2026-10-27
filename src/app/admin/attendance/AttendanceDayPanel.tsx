import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarX2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { attendanceHref } from '@/lib/attendance/attendanceHref'
import { countClasses, formatDayLabel } from '@/lib/attendance/calendarGrid'
import { countsLabel } from '@/lib/attendance/calendarLabels'
import type { DaySession } from '@/lib/attendance/calendarData'
import { formatBogotaTime } from '@/lib/utils/bogotaDay'

interface Filters {
  careerId?: string
  subjectId?: string
}

/**
 * Clases del día seleccionado en el calendario: el calendario actúa como un
 * filtro visual y este panel (columna derecha, encima de la lista de
 * inscritos) muestra de inmediato lo que hay ese día. Componente de servidor:
 * abrir una clase es un enlace (sessionId en la URL).
 */
export default function AttendanceDayPanel({
  month,
  now,
  selectedDay,
  daySessions,
  selectedSessionId,
  filters,
  dayActions,
}: {
  month: string
  now: Date
  selectedDay: string | null
  daySessions: DaySession[]
  selectedSessionId?: string
  filters: Filters
  dayActions?: ReactNode
}) {
  const base = { view: 'calendar' as const, ...filters }
  // Misma definición que las celdas del mes (countClasses).
  const dayTotals = countClasses(daySessions)

  return (
    <section
      id="day-panel"
      aria-labelledby="calendar-day-title"
      className="scroll-mt-4 bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-5 py-4 border-b border-gray-100">
        <div className="min-w-0">
          <h2 id="calendar-day-title" className="text-sm font-bold text-gray-900 capitalize">
            {selectedDay ? formatDayLabel(selectedDay) : 'Clases del día'}
          </h2>
          {selectedDay && <p className="text-xs text-gray-500 mt-0.5">{countsLabel(dayTotals)}</p>}
        </div>
        {selectedDay && dayActions}
      </div>

      {!selectedDay ? (
        <div className="p-6">
          <EmptyState
            icon={<CalendarX2 className="w-5 h-5" />}
            title="Elige un día del calendario"
            description="Verás las clases de ese día y podrás abrir la lista de cada una para corregirla."
          />
        </div>
      ) : daySessions.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={<CalendarX2 className="w-5 h-5" />}
            title="No hay clases este día"
            description="Si alguna clase se tomó en papel, elige la materia y usa “Registrar clase pasada”."
          />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-50">
            {daySessions.map((s) => {
              const isSuspended = !!s.suspendedAt
              const isOpenNow = s.isActive !== false && !!s.expiresAt && new Date(s.expiresAt) > now
              const isSelected = s.id === selectedSessionId
              return (
                <li key={s.id}>
                  <Link
                    // #roster-panel: al abrir una clase, en pantallas angostas el
                    // navegador baja hasta la lista de inscritos.
                    href={`${attendanceHref({
                      ...base,
                      month,
                      day: selectedDay,
                      sessionId: s.id,
                    })}#roster-panel`}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`flex items-center justify-between gap-3 border-l-4 px-4 sm:px-5 py-3.5 transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-600 ${
                      isSelected
                        ? 'border-navy-600 bg-navy-50'
                        : 'border-transparent hover:bg-gray-50/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {s.subjectName}
                        {s.subjectCode && (
                          <span className="ml-2 text-xs font-mono font-medium text-gray-500">
                            {s.subjectCode}
                          </span>
                        )}
                        {isSelected && <span className="sr-only"> (clase abierta)</span>}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <span className="text-xs font-semibold text-gray-700">
                          {formatBogotaTime(s.date)}
                        </span>
                        {s.modality && (
                          <Badge variant="neutral" size="sm">
                            {s.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial'}
                          </Badge>
                        )}
                        {s.isMakeup && (
                          <Badge variant="info" size="sm">
                            Reposición
                          </Badge>
                        )}
                        {isOpenNow && !isSuspended && (
                          <Badge variant="success" size="sm">
                            Registro abierto
                          </Badge>
                        )}
                        {isSuspended && (
                          <Badge variant="danger" size="sm">
                            Suspendida
                          </Badge>
                        )}
                        {s.isActive === false && !isSuspended && (
                          <Badge variant="warning" size="sm">
                            Archivada
                          </Badge>
                        )}
                        {isSuspended && s.suspensionReason && (
                          <span className="text-[11px] text-gray-500 truncate max-w-64">
                            {s.suspensionReason}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5 shrink-0">
                      <Users className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                      <span>
                        {s.registered} de {s.enrolled}
                        <span className="sr-only"> inscritos registraron asistencia</span>
                      </span>
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
          {!selectedSessionId && (
            <p className="px-4 sm:px-5 py-3 border-t border-gray-100 text-xs text-gray-500">
              Elige una clase para ver a los inscritos.
            </p>
          )}
        </>
      )}
    </section>
  )
}
