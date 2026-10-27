import { requireRole } from '@/lib/auth/requireRole'
import Link from 'next/link'
import { CalendarDays, CalendarX2, ClipboardCheck, List, Users } from 'lucide-react'
import AdminHeader from '@/components/admin/AdminHeader'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import SessionRosterPanel from '@/components/attendance/SessionRosterPanel'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { attendanceHref } from '@/lib/attendance/attendanceHref'
import {
  bogotaMonthOf,
  dayBounds,
  formatDayLabel,
  formatMonthLabel,
  monthBounds,
  parseCivilDay,
  parseMonth,
  summarizeDays,
} from '@/lib/attendance/calendarGrid'
import { fetchDaySessions, fetchMonthSessions } from '@/lib/attendance/calendarData'
import { fetchAllRows, unwrapRows } from '@/lib/supabase/fetchAll'
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import { formatBogotaDateTime } from '@/lib/utils/bogotaDay'
import ReportDownloadButton from '@/components/ReportDownloadButton'
import { attendanceRangeUrl } from '@/lib/reports/attendanceRangeUrl'
import AttendanceCalendar from './AttendanceCalendar'
import AttendanceDayPanel from './AttendanceDayPanel'
import SubjectPicker from './SubjectPicker'
import PastClassModal from './PastClassModal'
import SessionActiveToggle from './SessionActiveToggle'
import SessionSuspensionControl from './SessionSuspensionControl'
import SuspendDayModal from './SuspendDayModal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 15

interface SessionRow {
  id: string
  date: string
  modality: 'PRESENCIAL' | 'VIRTUAL' | null
  is_makeup: boolean
  is_active: boolean | null
  expires_at: string | null
  note: string | null
  suspended_at: string | null
  suspension_reason: string | null
  attendances: { count: number }[] | null
}

function buildHref(params: {
  subjectId: string
  careerId?: string
  page?: number
  sessionId?: string
}) {
  const qs = new URLSearchParams({ subjectId: params.subjectId })
  if (params.careerId) qs.set('careerId', params.careerId)
  if (params.page && params.page > 1) qs.set('page', String(params.page))
  if (params.sessionId) qs.set('sessionId', params.sessionId)
  return `/admin/attendance?${qs.toString()}`
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    careerId?: string
    subjectId?: string
    sessionId?: string
    page?: string
    view?: string
    month?: string
    day?: string
  }>
}) {
  const params = await searchParams
  const { supabase } = await requireRole(['ADMIN'])

  // Subjects and links are paginated: PostgREST silently truncates at 1000
  // rows, which would drop subjects from the picker and from the career scope.
  const [{ data: careers }, subjectsResult, linksResult] = await Promise.all([
    supabase.from('careers').select('id, name').eq('is_active', true).order('name'),
    fetchAllRows<{ id: string; name: string; code: string }>((from, to) =>
      supabase
        .from('subjects')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name')
        .order('id')
        .range(from, to)
    ),
    fetchAllRows<{ subject_id: string; career_id: string }>((from, to) =>
      supabase
        .from('subject_careers')
        .select('subject_id, career_id')
        .eq('is_active', true)
        .order('subject_id')
        .order('career_id')
        .range(from, to)
    ),
  ])
  const subjects = unwrapRows(subjectsResult, 'las materias')
  const links = unwrapRows(linksResult, 'los vínculos materia-carrera')

  const careerIdsBySubject = new Map<string, string[]>()
  for (const l of links || []) {
    careerIdsBySubject.set(l.subject_id, [
      ...(careerIdsBySubject.get(l.subject_id) || []),
      l.career_id,
    ])
  }
  const subjectOptions = (subjects || []).map((s) => ({
    ...s,
    careerIds: careerIdsBySubject.get(s.id) || [],
  }))

  const selectedSubject = params.subjectId
    ? (subjects || []).find((s) => s.id === params.subjectId) || null
    : null
  const careerId =
    params.careerId ||
    (selectedSubject ? careerIdsBySubject.get(selectedSubject.id)?.[0] : '') ||
    ''

  const isCalendar = params.view === 'calendar'
  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let sessions: SessionRow[] = []
  let totalSessions = 0
  let enrolledCount = 0
  if (selectedSubject && !isCalendar) {
    const [{ data, count }, { count: enrolled }] = await Promise.all([
      supabase
        .from('sessions')
        .select(
          'id, date, modality, is_makeup, is_active, expires_at, note, suspended_at, suspension_reason, attendances(count)',
          { count: 'exact' }
        )
        .eq('subject_id', selectedSubject.id)
        .order('date', { ascending: false })
        .range(from, to),
      supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', selectedSubject.id),
    ])
    sessions = (data || []) as unknown as SessionRow[]
    totalSessions = count ?? 0
    enrolledCount = enrolled ?? 0
  }
  const totalPages = Math.max(1, Math.ceil(totalSessions / PAGE_SIZE))
  // La clase abierta puede no estar en la página actual (ej. recién
  // registrada con una fecha antigua): se busca directo, acotada a la materia.
  let selectedSession: { id: string; date: string } | null =
    sessions.find((s) => s.id === params.sessionId) || null
  if (!selectedSession && selectedSubject && params.sessionId && !isCalendar) {
    const { data } = await supabase
      .from('sessions')
      .select('id, date')
      .eq('id', params.sessionId)
      .eq('subject_id', selectedSubject.id)
      .maybeSingle()
    selectedSession = data
  }
  const now = new Date()

  // Calendario: el mes (y el día) visibles acotan TODAS las consultas. Sin
  // materia el calendario cubre todas; con carrera, solo las de esa carrera.
  const today = bogotaCalendarDate(now)
  const dayParam = parseCivilDay(params.day)
  const month = parseMonth(params.month) ?? (dayParam ? dayParam.slice(0, 7) : bogotaMonthOf(now))
  const selectedDay =
    dayParam && dayParam.startsWith(month) ? dayParam : today.startsWith(month) ? today : null
  const monthRange = monthBounds(month)
  const currentMonthRange = monthBounds(bogotaMonthOf(now))
  // Con materia basta la materia: mandar también la carrera heredada podría
  // contradecirla (una materia puede estar en varias carreras).
  const careerName = (careers || []).find((c) => c.id === careerId)?.name
  // Qué cubre cada descarga, dicho en la propia interfaz.
  const reportScopeText = selectedSubject
    ? `Materia: ${selectedSubject.name}`
    : careerName
      ? `Carrera: ${careerName}`
      : 'Todas las materias'
  const reportMonthLabel = formatMonthLabel(isCalendar ? month : bogotaMonthOf(now))
  const reportFilters = selectedSubject
    ? { subjectId: selectedSubject.id }
    : careerId
      ? { careerId }
      : {}
  const calendarScope = selectedSubject
    ? { subjectId: selectedSubject.id }
    : careerId
      ? {
          careerSubjectIds: (subjects || [])
            .filter((s) => careerIdsBySubject.get(s.id)?.includes(careerId))
            .map((s) => s.id),
        }
      : {}
  const [monthSessions, daySessions] = isCalendar
    ? await Promise.all([
        fetchMonthSessions(supabase, monthRange, calendarScope),
        selectedDay ? fetchDaySessions(supabase, dayBounds(selectedDay), calendarScope) : [],
      ])
    : [[], []]
  let calendarSession: { id: string; date: string; subjectName: string } | null = null
  if (isCalendar && params.sessionId) {
    const inDay = daySessions.find((s) => s.id === params.sessionId)
    if (inDay) {
      calendarSession = { id: inDay.id, date: inDay.date, subjectName: inDay.subjectName }
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('id, date, subject:subjects(name)')
        .eq('id', params.sessionId)
        .maybeSingle()
      if (data) {
        const subject = Array.isArray(data.subject) ? data.subject[0] : data.subject
        calendarSession = {
          id: data.id,
          date: data.date,
          subjectName: subject?.name ?? 'Materia',
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <AdminHeader
            title="Asistencias"
            description="Revisa y corrige la asistencia de clases pasadas. Solo coordinación puede hacerlo."
            activeHref="/admin/attendance"
          />

          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <nav aria-label="Vista de asistencias" className="flex">
                <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50/70">
                  {[
                    {
                      key: 'list',
                      label: 'Lista',
                      icon: <List className="w-4 h-4" aria-hidden="true" />,
                      href: attendanceHref({
                        view: 'list',
                        careerId: careerId || undefined,
                        subjectId: selectedSubject?.id,
                      }),
                    },
                    {
                      key: 'calendar',
                      label: 'Calendario',
                      icon: <CalendarDays className="w-4 h-4" aria-hidden="true" />,
                      href: attendanceHref({
                        view: 'calendar',
                        month,
                        careerId: careerId || undefined,
                        subjectId: selectedSubject?.id,
                      }),
                    },
                  ].map((v) => {
                    const active = (v.key === 'calendar') === isCalendar
                    return (
                      <Link
                        key={v.key}
                        href={v.href}
                        aria-current={active ? 'page' : undefined}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-[10px] text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-navy-600 ${
                          active
                            ? 'bg-white text-navy-800 shadow-xs border border-gray-200'
                            : 'text-gray-500 hover:text-gray-800 border border-transparent'
                        }`}
                      >
                        {v.icon}
                        {v.label}
                      </Link>
                    )
                  })}
                </div>
              </nav>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs text-gray-500">{reportScopeText}</span>
                <ReportDownloadButton
                  url={attendanceRangeUrl({
                    from: isCalendar ? monthRange.firstDay : currentMonthRange.firstDay,
                    to: isCalendar ? monthRange.lastDay : currentMonthRange.lastDay,
                    ...reportFilters,
                  })}
                  label={
                    isCalendar
                      ? `Descargar mes de ${reportMonthLabel}`
                      : `Descargar reporte de ${reportMonthLabel}`
                  }
                  title={`Excel con la asistencia de ${reportMonthLabel}. ${reportScopeText}.`}
                  fallbackName="asistencia.xlsx"
                  icon="excel"
                />
              </div>
            </div>
            <SubjectPicker
              careers={careers || []}
              subjects={subjectOptions}
              initialCareerId={careerId}
              selectedSubjectId={selectedSubject?.id || ''}
              view={isCalendar ? 'calendar' : 'list'}
              month={isCalendar ? month : undefined}
            />
          </div>

          {isCalendar ? (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
              <div className="lg:col-span-3 space-y-4">
                {selectedSubject && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <SuspendDayModal
                      subjectId={selectedSubject.id}
                      subjectName={selectedSubject.name}
                      defaultDate={selectedDay ?? ''}
                    />
                    <PastClassModal
                      subjectId={selectedSubject.id}
                      subjectName={selectedSubject.name}
                      careerId={careerId || undefined}
                    />
                  </div>
                )}
                <AttendanceCalendar
                  month={month}
                  today={today}
                  summaries={summarizeDays(monthSessions)}
                  selectedDay={selectedDay}
                  filters={{ careerId: careerId || undefined, subjectId: selectedSubject?.id }}
                />
              </div>
              {/* The calendar is a visual filter: the day's classes sit right
                  beside it (below it on narrow screens), then the roster of the
                  opened class. No sticky: this column can be taller than the
                  viewport. */}
              <aside className="lg:col-span-2 space-y-6">
                <AttendanceDayPanel
                  month={month}
                  now={now}
                  selectedDay={selectedDay}
                  daySessions={daySessions}
                  selectedSessionId={calendarSession?.id}
                  filters={{ careerId: careerId || undefined, subjectId: selectedSubject?.id }}
                  dayActions={
                    selectedDay && (
                      <ReportDownloadButton
                        url={attendanceRangeUrl({
                          from: selectedDay,
                          to: selectedDay,
                          ...reportFilters,
                        })}
                        label="Descargar día"
                        title={`Excel con la asistencia del ${formatDayLabel(selectedDay)}. ${reportScopeText}.`}
                        fallbackName="asistencia.xlsx"
                        icon="excel"
                      />
                    )
                  }
                />
                {calendarSession && (
                  <div id="roster-panel" className="scroll-mt-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      {calendarSession.subjectName} · {formatBogotaDateTime(calendarSession.date)}
                    </p>
                    <SessionRosterPanel
                      key={calendarSession.id}
                      sessionId={calendarSession.id}
                      autoRefresh={false}
                    />
                  </div>
                )}
              </aside>
            </div>
          ) : !selectedSubject ? (
            <EmptyState
              icon={<ClipboardCheck className="w-5 h-5" />}
              title="Elige una materia para ver sus clases"
              description="Selecciona la carrera y la materia. Verás las clases dictadas, de la más reciente a la más antigua, y podrás abrir la lista de cada una para corregirla."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
              <section className="lg:col-span-3 bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
                <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-gray-100">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-gray-900 truncate">
                      {selectedSubject.name}
                    </h2>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                      {selectedSubject.code} · {totalSessions} clase
                      {totalSessions === 1 ? '' : 's'} · {enrolledCount} inscrito
                      {enrolledCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <SuspendDayModal
                      subjectId={selectedSubject.id}
                      subjectName={selectedSubject.name}
                    />
                    <PastClassModal
                      subjectId={selectedSubject.id}
                      subjectName={selectedSubject.name}
                      careerId={careerId || undefined}
                    />
                  </div>
                </div>

                {sessions.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={<CalendarX2 className="w-5 h-5" />}
                      title="Esta materia aún no tiene clases registradas"
                      description="Si la clase se tomó en papel, usa “Registrar clase pasada”."
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {sessions.map((s) => {
                      const registered = s.attendances?.[0]?.count ?? 0
                      const isSuspended = !!s.suspended_at
                      const isOpenNow =
                        s.is_active !== false && !!s.expires_at && new Date(s.expires_at) > now
                      const isSelected = s.id === selectedSession?.id
                      return (
                        <li key={s.id} className="flex items-center pr-3">
                          <Link
                            href={buildHref({
                              subjectId: selectedSubject.id,
                              careerId: careerId || undefined,
                              page: currentPage,
                              sessionId: s.id,
                            })}
                            aria-current={isSelected ? 'true' : undefined}
                            className={`flex flex-1 min-w-0 items-center justify-between gap-3 px-5 py-3.5 transition ${
                              isSelected ? 'bg-navy-50/70' : 'hover:bg-gray-50/70'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900">
                                {formatBogotaDateTime(s.date)}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                {s.modality && (
                                  <Badge variant="neutral" size="sm">
                                    {s.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial'}
                                  </Badge>
                                )}
                                {s.is_makeup && (
                                  <Badge variant="info" size="sm">
                                    Reposición
                                  </Badge>
                                )}
                                {isOpenNow && (
                                  <Badge variant="success" size="sm">
                                    Registro abierto
                                  </Badge>
                                )}
                                {isSuspended && (
                                  <Badge variant="danger" size="sm">
                                    Suspendida
                                  </Badge>
                                )}
                                {s.is_active === false && !isSuspended && (
                                  <Badge variant="warning" size="sm">
                                    Archivada
                                  </Badge>
                                )}
                                {isSuspended && s.suspension_reason && (
                                  <span className="text-[11px] text-gray-500 truncate max-w-64">
                                    {s.suspension_reason}
                                  </span>
                                )}
                                {s.note && (
                                  <span className="text-[11px] text-gray-400 truncate max-w-48">
                                    {s.note}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5 shrink-0">
                              <Users className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                              {registered} registrado{registered === 1 ? '' : 's'}
                            </p>
                          </Link>
                          {!isSuspended && (
                            <SessionActiveToggle
                              sessionId={s.id}
                              isActive={s.is_active !== false}
                            />
                          )}
                          {(isSuspended || s.is_active !== false) && (
                            <SessionSuspensionControl sessionId={s.id} isSuspended={isSuspended} />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 font-medium">
                      Página {currentPage} de {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Link
                        href={buildHref({
                          subjectId: selectedSubject.id,
                          careerId: careerId || undefined,
                          page: currentPage - 1,
                        })}
                        aria-disabled={currentPage <= 1}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                          currentPage <= 1
                            ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        ← Anterior
                      </Link>
                      <Link
                        href={buildHref({
                          subjectId: selectedSubject.id,
                          careerId: careerId || undefined,
                          page: currentPage + 1,
                        })}
                        aria-disabled={currentPage >= totalPages}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                          currentPage >= totalPages
                            ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Siguiente →
                      </Link>
                    </div>
                  </div>
                )}
              </section>

              <aside className="lg:col-span-2 lg:sticky lg:top-4">
                {selectedSession ? (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Clase del {formatBogotaDateTime(selectedSession.date)}
                    </p>
                    <SessionRosterPanel
                      key={selectedSession.id}
                      sessionId={selectedSession.id}
                      autoRefresh={false}
                    />
                  </div>
                ) : (
                  <EmptyState
                    icon={<Users className="w-5 h-5" />}
                    title="Abre una clase"
                    description="Selecciona una clase de la lista para ver a los inscritos y marcar presente, tarde o quitar el registro."
                  />
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
