import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX2, ClipboardCheck, Users } from 'lucide-react'
import AdminHeader from '@/components/admin/AdminHeader'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import SessionRosterPanel from '@/components/attendance/SessionRosterPanel'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatBogotaDateTime } from '@/lib/utils/bogotaDay'
import SubjectPicker from './SubjectPicker'
import PastClassModal from './PastClassModal'
import SessionActiveToggle from './SessionActiveToggle'

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
  }>
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

  const [{ data: careers }, { data: subjects }, { data: links }] = await Promise.all([
    supabase.from('careers').select('id, name').eq('is_active', true).order('name'),
    supabase.from('subjects').select('id, name, code').eq('is_active', true).order('name'),
    supabase.from('subject_careers').select('subject_id, career_id').eq('is_active', true),
  ])

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

  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let sessions: SessionRow[] = []
  let totalSessions = 0
  let enrolledCount = 0
  if (selectedSubject) {
    const [{ data, count }, { count: enrolled }] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, date, modality, is_makeup, is_active, expires_at, note, attendances(count)', {
          count: 'exact',
        })
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
  if (!selectedSession && selectedSubject && params.sessionId) {
    const { data } = await supabase
      .from('sessions')
      .select('id, date')
      .eq('id', params.sessionId)
      .eq('subject_id', selectedSubject.id)
      .maybeSingle()
    selectedSession = data
  }
  const now = new Date()

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

          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-5">
            <SubjectPicker
              careers={careers || []}
              subjects={subjectOptions}
              initialCareerId={careerId}
              selectedSubjectId={selectedSubject?.id || ''}
            />
          </div>

          {!selectedSubject ? (
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
                  <PastClassModal
                    subjectId={selectedSubject.id}
                    subjectName={selectedSubject.name}
                    careerId={careerId || undefined}
                  />
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
                                {s.is_active === false && (
                                  <Badge variant="warning" size="sm">
                                    Archivada
                                  </Badge>
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
                          <SessionActiveToggle sessionId={s.id} isActive={s.is_active !== false} />
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
