import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Ban, CalendarCheck } from 'lucide-react'
import AdminHeader from '@/components/admin/AdminHeader'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { fetchClassOmissions } from '@/lib/attendance/classOmissionsData'
import { fetchSuspendedClasses } from '@/lib/attendance/suspendedClasses'
import { formatBlockTime } from '@/lib/attendance/classOmissions'
import { formatCivilDate } from '@/lib/utils/civilDate'
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import { formatBogotaDateTime } from '@/lib/utils/bogotaDay'
import PastClassModal from '../attendance/PastClassModal'
import SuspendDayModal from '../attendance/SuspendDayModal'
import SessionSuspensionControl from '../attendance/SessionSuspensionControl'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

type StatusFilter = 'unjustified' | 'justified' | 'all' | 'suspended'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'unjustified', label: 'Sin justificar' },
  { value: 'justified', label: 'Justificadas' },
  { value: 'all', label: 'Todas' },
  { value: 'suspended', label: 'Suspendidas' },
]

function buildHref(status: StatusFilter, professorId: string, page = 1) {
  const qs = new URLSearchParams({ status })
  if (professorId) qs.set('professorId', professorId)
  if (page > 1) qs.set('page', String(page))
  return `/admin/omissions?${qs.toString()}`
}

export default async function AdminOmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; professorId?: string; page?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .eq('is_active', true)
    .single()
  if (!profile || profile.role !== 'ADMIN') redirect('/login')

  const status: StatusFilter = STATUS_TABS.some((t) => t.value === params.status)
    ? (params.status as StatusFilter)
    : 'unjustified'
  const professorId = params.professorId || ''
  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1)

  const [all, suspendedAll, { count: scheduleBlocks }] = await Promise.all([
    fetchClassOmissions(supabase),
    fetchSuspendedClasses(supabase),
    supabase.from('subject_schedules').select('*', { count: 'exact', head: true }),
  ])

  // El filtro de docente se aplica antes de contar, para que las pestañas
  // reflejen lo que se vería al abrirlas.
  const byProfessor = professorId ? all.filter((o) => o.professorId === professorId) : all
  const suspendedFiltered = professorId
    ? suspendedAll.filter((c) => c.professorId === professorId)
    : suspendedAll
  const counts: Record<StatusFilter, number> = {
    suspended: suspendedFiltered.length,
    unjustified: byProfessor.filter((o) => !o.justified).length,
    justified: byProfessor.filter((o) => o.justified).length,
    all: byProfessor.length,
  }
  const filtered =
    status === 'suspended'
      ? []
      : byProfessor.filter(
          (o) => status === 'all' || (status === 'justified' ? o.justified : !o.justified)
        )
  const suspendedRows = status === 'suspended' ? suspendedFiltered : []

  const professors = Array.from(
    new Map(
      [...all, ...suspendedAll]
        .filter((o) => o.professorId)
        .map((o) => [o.professorId as string, o.professorName])
    )
  )
    .map(([id, name]) => ({ id, name: name || 'Sin nombre' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const listLength = status === 'suspended' ? suspendedRows.length : filtered.length
  const totalPages = Math.max(1, Math.ceil(listLength / PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const suspendedPage = suspendedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <AdminHeader
            title="Clases no registradas"
            description="Clases del horario semanal en las que el docente no registró asistencia, con su justificación"
            activeHref="/admin/omissions"
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <nav
              aria-label="Filtrar por estado"
              className="inline-flex p-1 bg-neutral-100 rounded-xl border border-neutral-200/80 max-w-full overflow-x-auto"
            >
              {STATUS_TABS.map((tab) => (
                <Link
                  key={tab.value}
                  href={buildHref(tab.value, professorId)}
                  aria-current={tab.value === status ? 'page' : undefined}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                    tab.value === status
                      ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50'
                  }`}
                >
                  {tab.label} ({counts[tab.value]})
                </Link>
              ))}
            </nav>

            {professors.length > 0 && (
              <form method="get" action="/admin/omissions" className="flex items-center gap-2">
                <input type="hidden" name="status" value={status} />
                <label htmlFor="omissions-professor" className="sr-only">
                  Docente
                </label>
                <select
                  id="omissions-professor"
                  name="professorId"
                  defaultValue={professorId}
                  className="max-w-56 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 outline-none hover:border-gray-300 focus:border-navy-600 focus:ring-2 focus:ring-navy-100"
                >
                  <option value="">Todos los docentes</option>
                  {professors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-bold text-navy-700 bg-navy-50 rounded-xl hover:bg-navy-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
                >
                  Filtrar
                </button>
              </form>
            )}
          </div>

          {status === 'suspended' ? (
            suspendedPage.length === 0 ? (
              <EmptyState
                icon={<Ban className="w-5 h-5" />}
                title="No hay clases suspendidas"
                description="Aquí aparecen las clases que un docente o coordinación suspendieron, con su motivo."
              />
            ) : (
              <ul className="bg-white rounded-2xl border border-gray-200/80 shadow-xs divide-y divide-gray-100 overflow-hidden">
                {suspendedPage.map((c) => (
                  <li
                    key={c.sessionId}
                    className="p-4 md:p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900 capitalize">
                          {formatCivilDate(bogotaCalendarDate(new Date(c.date)))}
                        </p>
                        <Badge variant="danger" size="sm">
                          Suspendida
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">{c.subjectName}</span>{' '}
                        <span className="text-xs font-mono text-gray-400">{c.subjectCode}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Docente: {c.professorName || 'Sin docente asignado'} · Suspendida por{' '}
                        {c.suspendedByName || 'usuario desconocido'} el{' '}
                        {formatBogotaDateTime(c.suspendedAt)}
                      </p>
                      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mt-2 wrap-break-word">
                        {c.reason}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {c.attendancesKept === 0
                          ? 'Sin asistencias conservadas'
                          : `${c.attendancesKept} ${
                              c.attendancesKept === 1
                                ? 'asistencia conservada'
                                : 'asistencias conservadas'
                            } (no cuentan)`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        href={`/admin/attendance?subjectId=${c.subjectId}&sessionId=${c.sessionId}`}
                        className="px-3 py-1.5 text-xs font-bold text-navy-700 bg-navy-50 rounded-lg hover:bg-navy-100 transition"
                      >
                        Ver clase
                      </Link>
                      <SessionSuspensionControl sessionId={c.sessionId} isSuspended />
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : all.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="w-5 h-5" />}
              title="No hay clases sin registrar"
              description={
                (scheduleBlocks ?? 0) === 0
                  ? 'Todavía no hay materias con horario semanal. Define el horario y el período de cada materia para vigilar el cumplimiento de las clases.'
                  : 'Se calculan con el horario semanal y el período de cada materia. Si una materia no tiene período con fechas o bloques de horario, no se vigila.'
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="w-5 h-5" />}
              title="Sin resultados para este filtro"
              description="Prueba con otra pestaña o con todos los docentes."
            />
          ) : (
            <ul className="bg-white rounded-2xl border border-gray-200/80 shadow-xs divide-y divide-gray-100 overflow-hidden">
              {rows.map((o) => (
                <li
                  key={`${o.subjectId}-${o.date}`}
                  className="p-4 md:p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900 capitalize">
                        {formatCivilDate(o.date)}
                      </p>
                      <Badge variant={o.justified ? 'success' : 'warning'} size="sm">
                        {o.justified ? 'Justificada' : 'Sin justificar'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">{o.subjectName}</span>{' '}
                      <span className="text-xs font-mono text-gray-400">{o.subjectCode}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {o.professorName || 'Sin docente asignado'} · {formatBlockTime(o.startTime)} –{' '}
                      {formatBlockTime(o.endTime)}
                    </p>
                    {o.justified && o.reason && (
                      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mt-2 wrap-break-word">
                        {o.reason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <PastClassModal
                      subjectId={o.subjectId}
                      subjectName={o.subjectName}
                      defaultStartsAt={`${o.date}T${formatBlockTime(o.startTime)}`}
                      buttonLabel="Registrar clase"
                    />
                    <SuspendDayModal
                      subjectId={o.subjectId}
                      subjectName={o.subjectName}
                      defaultDate={o.date}
                      buttonLabel="Suspender"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">
                Página {page} de {totalPages} · {listLength} {listLength === 1 ? 'clase' : 'clases'}
              </p>
              <div className="flex gap-2">
                <Link
                  href={buildHref(status, professorId, page - 1)}
                  aria-disabled={page <= 1}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    page <= 1
                      ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  ← Anterior
                </Link>
                <Link
                  href={buildHref(status, professorId, page + 1)}
                  aria-disabled={page >= totalPages}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    page >= totalPages
                      ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Siguiente →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
