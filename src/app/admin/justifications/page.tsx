import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import JustificationsList, {
  JustificationRow,
} from '@/components/justifications/JustificationsList'
import RegisterExcuseModal from './RegisterExcuseModal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'APPROVED', label: 'Aprobadas' },
  { value: 'REJECTED', label: 'Rechazadas' },
  { value: 'ALL', label: 'Todas' },
]

function buildHref(status: StatusFilter, page = 1) {
  const qs = new URLSearchParams({ status })
  if (page > 1) qs.set('page', String(page))
  return `/admin/justifications?${qs.toString()}`
}

export default async function AdminJustificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
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
    : 'PENDING'
  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let listQuery = supabase
    .from('absence_justifications')
    // Dos FK hacia profiles (student_id y reviewed_by, migración 024): se
    // pinea cuál usar para evitar la ambigüedad PGRST201.
    .select(
      `
      id,
      reason,
      attachment_path,
      status,
      review_note,
      reviewed_at,
      created_at,
      subject:subjects(id, name, code),
      session:sessions(id, date),
      student:profiles!absence_justifications_student_id_fkey(name, student_code)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
  if (status !== 'ALL') listQuery = listQuery.eq('status', status)

  const countFor = (s: 'PENDING' | 'APPROVED' | 'REJECTED') =>
    supabase
      .from('absence_justifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', s)

  const [{ data, count, error }, pending, approved, rejected] = await Promise.all([
    listQuery.range(from, to),
    countFor('PENDING'),
    countFor('APPROVED'),
    countFor('REJECTED'),
  ])
  if (error) console.error('Error cargando justificaciones:', error)

  const rows = (data || []) as unknown as JustificationRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const counts: Record<StatusFilter, number> = {
    PENDING: pending.count ?? 0,
    APPROVED: approved.count ?? 0,
    REJECTED: rejected.count ?? 0,
    ALL: (pending.count ?? 0) + (approved.count ?? 0) + (rejected.count ?? 0),
  }

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <AdminHeader
            title="Justificaciones"
            description="Revisa las excusas enviadas por los estudiantes o registra una excusa validada por coordinación"
            activeHref="/admin/justifications"
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <nav
              aria-label="Filtrar por estado"
              className="inline-flex p-1 bg-neutral-100 rounded-xl border border-neutral-200/80 max-w-full overflow-x-auto"
            >
              {STATUS_TABS.map((tab) => (
                <Link
                  key={tab.value}
                  href={buildHref(tab.value)}
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
            <RegisterExcuseModal />
          </div>

          <JustificationsList
            key={`${status}-${currentPage}`}
            justifications={rows}
            subjects={[]}
            canReview
            emptyDescription={
              status === 'PENDING'
                ? 'No hay justificaciones por revisar. Las nuevas aparecerán aquí.'
                : 'No hay justificaciones con este estado.'
            }
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">
                Página {currentPage} de {totalPages} · {total}{' '}
                {total === 1 ? 'justificación' : 'justificaciones'}
              </p>
              <div className="flex gap-2">
                <Link
                  href={buildHref(status, currentPage - 1)}
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
                  href={buildHref(status, currentPage + 1)}
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
        </div>
      </div>
    </div>
  )
}
