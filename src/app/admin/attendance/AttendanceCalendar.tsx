import type { ReactNode } from 'react'
import Link from 'next/link'
import { Ban, CalendarX2, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { attendanceHref } from '@/lib/attendance/attendanceHref'
import {
  buildMonthGrid,
  countClasses,
  formatDayLabel,
  formatMonthLabel,
  shiftMonth,
  WEEKDAY_LABELS,
  type DaySummary,
} from '@/lib/attendance/calendarGrid'
import type { DaySession } from '@/lib/attendance/calendarData'
import { formatBogotaTime } from '@/lib/utils/bogotaDay'

interface Filters {
  careerId?: string
  subjectId?: string
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** "3 clases" o "3 clases, 1 suspendida": dictadas primero, suspendidas aparte. */
function countsLabel(c: DaySummary) {
  const held = plural(c.held, 'clase', 'clases')
  return c.suspended > 0 ? `${held}, ${plural(c.suspended, 'suspendida', 'suspendidas')}` : held
}

/** Etiqueta accesible de un día: nada depende solo del color. */
function dayAriaLabel(
  day: string,
  summary: DaySummary | undefined,
  isToday: boolean,
  isSelected: boolean
) {
  const parts = [formatDayLabel(day)]
  if (isToday) parts.push('hoy')
  if (summary?.held) parts.push(plural(summary.held, 'clase', 'clases'))
  if (summary?.suspended) parts.push(plural(summary.suspended, 'suspendida', 'suspendidas'))
  if (!summary) parts.push('sin clases')
  if (isSelected) parts.push('seleccionado')
  return parts.join(', ')
}

/**
 * Vista de calendario de /admin/attendance. Es un componente de servidor: la
 * navegación entre meses y días son enlaces (el estado vive en la URL) y los
 * datos ya vienen acotados al mes y al día visibles.
 */
export default function AttendanceCalendar({
  month,
  today,
  now,
  summaries,
  selectedDay,
  daySessions,
  selectedSessionId,
  filters,
  monthActions,
  dayActions,
}: {
  month: string
  today: string
  now: Date
  summaries: Map<string, DaySummary>
  selectedDay: string | null
  daySessions: DaySession[]
  selectedSessionId?: string
  filters: Filters
  monthActions?: ReactNode
  dayActions?: ReactNode
}) {
  const weeks = buildMonthGrid(month, today)
  const base = { view: 'calendar' as const, ...filters }
  const monthTitle = formatMonthLabel(month)
  const todayMonth = today.slice(0, 7)
  // Misma definición en celdas, total del mes y panel del día (countClasses):
  // "clases" = dictadas o por dictar; las suspendidas se cuentan aparte. Las
  // archivadas y las materias inactivas no entran (igual que en las descargas).
  const monthTotals = [...summaries.entries()]
    .filter(([day]) => day.startsWith(month))
    .reduce((sum, [, s]) => ({ held: sum.held + s.held, suspended: sum.suspended + s.suspended }), {
      held: 0,
      suspended: 0,
    })
  const dayTotals = countClasses(daySessions)

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="calendar-month-title"
        className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2
              id="calendar-month-title"
              className="text-base font-bold text-gray-900 capitalize"
              aria-live="polite"
            >
              {monthTitle}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{countsLabel(monthTotals)} en el mes</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <nav aria-label="Cambiar de mes" className="flex items-center gap-1.5">
              <Link
                href={attendanceHref({ ...base, month: shiftMonth(month, -1) })}
                className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[36px] rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-navy-600"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Anterior</span>
                <span className="sr-only">mes</span>
              </Link>
              <Link
                href={attendanceHref({ ...base, month: todayMonth, day: today })}
                aria-current={month === todayMonth && selectedDay === today ? 'date' : undefined}
                className="inline-flex items-center px-3 py-2 min-h-[36px] rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-navy-600"
              >
                Hoy
              </Link>
              <Link
                href={attendanceHref({ ...base, month: shiftMonth(month, 1) })}
                className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[36px] rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-navy-600"
              >
                <span className="sr-only sm:not-sr-only">Siguiente</span>
                <span className="sr-only">mes</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </nav>
            {monthActions}
          </div>
        </div>

        <div className="p-1.5 sm:p-3">
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">
              Clases de {monthTitle}. Selecciona un día para ver sus clases.
            </caption>
            <thead>
              <tr>
                {WEEKDAY_LABELS.map(([short, full]) => (
                  <th
                    key={full}
                    scope="col"
                    className="pb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500"
                  >
                    <span className="sr-only">{full}</span>
                    <span aria-hidden="true" className="sm:hidden">
                      {full[0].toUpperCase()}
                    </span>
                    <span aria-hidden="true" className="hidden sm:inline">
                      {short}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0].date}>
                  {week.map((cell) => {
                    const summary = summaries.get(cell.date)
                    const isSelected = cell.date === selectedDay
                    if (!cell.inMonth) {
                      // Relleno de la semana: sin datos cargados, no es navegable.
                      return (
                        <td key={cell.date} className="p-0.5 sm:p-1">
                          <div
                            aria-hidden="true"
                            className="min-h-[3.25rem] sm:min-h-[5rem] rounded-lg p-1 sm:p-2 text-xs text-gray-300"
                          >
                            {cell.dayOfMonth}
                          </div>
                        </td>
                      )
                    }
                    return (
                      <td key={cell.date} className="p-0.5 sm:p-1 align-top">
                        <Link
                          href={attendanceHref({ ...base, month, day: cell.date })}
                          aria-label={dayAriaLabel(cell.date, summary, cell.isToday, isSelected)}
                          aria-current={isSelected ? 'true' : cell.isToday ? 'date' : undefined}
                          className={`flex flex-col items-center sm:items-start gap-1 min-h-[3.25rem] sm:min-h-[5rem] rounded-lg border p-1 sm:p-2 transition focus-visible:ring-2 focus-visible:ring-navy-600 ${
                            isSelected
                              ? 'bg-navy-50 border-navy-600 ring-1 ring-navy-600'
                              : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-full text-xs font-bold ${
                              cell.isToday ? 'bg-navy-800 text-white' : 'text-gray-800'
                            }`}
                          >
                            {cell.dayOfMonth}
                          </span>
                          {summary?.held ? (
                            <span
                              aria-hidden="true"
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200/60 bg-emerald-50 px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold leading-none text-emerald-700"
                            >
                              {summary.held}
                              <span className="hidden sm:inline font-medium">
                                {summary.held === 1 ? 'clase' : 'clases'}
                              </span>
                            </span>
                          ) : null}
                          {summary?.suspended ? (
                            <span
                              aria-hidden="true"
                              className="inline-flex items-center gap-1 rounded-md border border-red-200/60 bg-red-50 px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold leading-none text-red-700"
                            >
                              <Ban className="w-3 h-3" strokeWidth={2.5} />
                              {summary.suspended}
                              <span className="hidden sm:inline font-medium">susp.</span>
                            </span>
                          ) : null}
                        </Link>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="calendar-day-title"
        className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 id="calendar-day-title" className="text-sm font-bold text-gray-900 capitalize">
              {selectedDay ? formatDayLabel(selectedDay) : 'Clases del día'}
            </h2>
            {selectedDay && (
              <p className="text-xs text-gray-500 mt-0.5">{countsLabel(dayTotals)}</p>
            )}
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
          <ul className="divide-y divide-gray-50">
            {daySessions.map((s) => {
              const isSuspended = !!s.suspendedAt
              const isOpenNow = s.isActive !== false && !!s.expiresAt && new Date(s.expiresAt) > now
              const isSelected = s.id === selectedSessionId
              return (
                <li key={s.id}>
                  <Link
                    href={attendanceHref({
                      ...base,
                      month,
                      day: selectedDay,
                      sessionId: s.id,
                    })}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 transition ${
                      isSelected ? 'bg-navy-50/70' : 'hover:bg-gray-50/70'
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
        )}
      </section>
    </div>
  )
}
