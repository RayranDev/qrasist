import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import { formatBogotaDateTime } from '@/lib/utils/bogotaDay'
import { AUDIT_ACTION_LABELS, auditActionLabel, summarizeAuditDetails } from './auditDisplay'
import AuditFilters from './AuditFilters'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

interface AuditLogRow {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  subject_id: string | null
  details: Record<string, unknown>
  created_at: string
  actor: { name: string; email: string | null } | null
  subject: { name: string; code: string } | null
}

function buildHref(params: {
  page: number
  action?: string
  actor?: string
  from?: string
  to?: string
}) {
  const qs = new URLSearchParams()
  if (params.action) qs.set('action', params.action)
  if (params.actor) qs.set('actor', params.actor)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.page > 1) qs.set('page', String(params.page))
  const s = qs.toString()
  return s ? `?${s}` : '?'
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    action?: string
    actor?: string
    from?: string
    to?: string
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

  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const actorQuery = (params.actor || '').trim().replace(/[,()]/g, '').slice(0, 100)

  let actorIdFilter: string[] | undefined
  if (actorQuery) {
    const { data: matchingActors } = await supabase
      .from('profiles')
      .select('id')
      .or(`name.ilike.%${actorQuery}%,email.ilike.%${actorQuery}%`)
    actorIdFilter = (matchingActors || []).map((a) => a.id)
    if (actorIdFilter.length === 0) actorIdFilter = ['00000000-0000-0000-0000-000000000000']
  }

  let query = supabase
    .from('audit_log')
    // actor_id es la única FK de audit_log hacia profiles (ver 023),
    // así que este embed no es ambiguo y no necesita pinearse con
    // !constraint_name.
    .select(
      'id, action, entity_type, entity_id, subject_id, details, created_at, actor:profiles(name, email), subject:subjects(name, code)',
      {
        count: 'exact',
      }
    )
    .order('created_at', { ascending: false })

  if (params.action) {
    query = query.eq('action', params.action)
  }
  if (actorIdFilter) {
    query = query.in('actor_id', actorIdFilter)
  }
  if (params.from) {
    query = query.gte('created_at', `${params.from}T00:00:00-05:00`)
  }
  if (params.to) {
    query = query.lte('created_at', `${params.to}T23:59:59-05:00`)
  }

  const { data, count } = await query.range(from, to)
  const rows = (data || []) as unknown as AuditLogRow[]
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <AdminHeader
            title="Bitácora de Auditoría"
            description="Acciones sensibles registradas por la app: quién, qué y cuándo"
            activeHref="/admin/audit"
          />

          <AuditFilters
            actionOptions={Object.entries(AUDIT_ACTION_LABELS)}
            initialAction={params.action || ''}
            initialActor={params.actor || ''}
            initialFrom={params.from || ''}
            initialTo={params.to || ''}
          />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">
                      Fecha
                    </th>
                    <th className="px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">
                      Actor
                    </th>
                    <th className="px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">
                      Acción
                    </th>
                    <th className="px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">
                      Entidad
                    </th>
                    <th className="px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">
                      Materia
                    </th>
                    <th className="px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">
                      Detalle
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length > 0 ? (
                    rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/50 transition align-top">
                        <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                          {formatBogotaDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <p className="font-bold text-gray-900">{row.actor?.name || 'Sistema'}</p>
                          {row.actor?.email && (
                            <p className="text-gray-400 font-mono">{row.actor.email}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-navy-700">
                          {auditActionLabel(row.action)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                          {row.entity_type}
                          {row.entity_id ? ` #${row.entity_id.slice(0, 8)}` : ''}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {row.subject ? `${row.subject.name} (${row.subject.code})` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">
                          {summarizeAuditDetails(row.action, row.details || {})}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-gray-400 italic">
                        No hay eventos registrados con estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium">
                  Página {currentPage} de {totalPages} · {count ?? 0} evento
                  {count !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <Link
                    href={buildHref({
                      page: currentPage - 1,
                      action: params.action,
                      actor: params.actor,
                      from: params.from,
                      to: params.to,
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
                      page: currentPage + 1,
                      action: params.action,
                      actor: params.actor,
                      from: params.from,
                      to: params.to,
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
          </div>
        </div>
      </div>
    </div>
  )
}
