import type { ReactNode } from 'react'
import Link from 'next/link'
import { Ban, ChevronLeft, ChevronRight } from 'lucide-react'
import { attendanceHref } from '@/lib/attendance/attendanceHref'
import {
  buildMonthGrid,
  formatDayLabel,
  formatMonthLabel,
  shiftMonth,
  WEEKDAY_LABELS,
  type DaySummary,
} from '@/lib/attendance/calendarGrid'
import { countsLabel, plural } from '@/lib/attendance/calendarLabels'

interface Filters {
  careerId?: string
  subjectId?: string
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
 * Cuadrícula mensual de /admin/attendance (solo el mes; las clases del día
 * seleccionado las pinta AttendanceDayPanel). Es un componente de servidor: la
 * navegación entre meses y días son enlaces (el estado vive en la URL) y los
 * datos ya vienen acotados al mes visible.
 */
export default function AttendanceCalendar({
  month,
  today,
  summaries,
  selectedDay,
  filters,
  monthActions,
}: {
  month: string
  today: string
  summaries: Map<string, DaySummary>
  selectedDay: string | null
  filters: Filters
  monthActions?: ReactNode
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

  return (
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
      {selectedDay && (
        // En pantallas angostas el panel del día queda debajo del calendario:
        // este enlace lleva a él sin poner un hash en cada celda.
        <div className="lg:hidden border-t border-gray-100 px-4 py-3">
          <a
            href="#day-panel"
            className="text-xs font-bold text-navy-700 hover:text-navy-900 underline underline-offset-2"
          >
            Ver las clases del {formatDayLabel(selectedDay)} ↓
          </a>
        </div>
      )}
    </section>
  )
}
