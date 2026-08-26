import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminUserList from './AdminUserList'
import MobileWarningBanner from '@/components/MobileWarningBanner'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

type RoleFilter = 'ALL' | 'ADMIN' | 'PROFESSOR' | 'STUDENT'
type StatusFilter = 'active' | 'inactive'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; role?: string; status?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const roleFilter = (['ALL', 'ADMIN', 'PROFESSOR', 'STUDENT'] as RoleFilter[]).includes(
    params.role as RoleFilter
  )
    ? (params.role as RoleFilter)
    : 'ALL'
  const statusFilter: StatusFilter = params.status === 'inactive' ? 'inactive' : 'active'
  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('is_active', statusFilter === 'active')
    .order('role')
    .order('name')

  if (roleFilter !== 'ALL') {
    query = query.eq('role', roleFilter)
  }

  const { data: users, count: totalCount } = await query.range(from, to)

  const { count: inactiveCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', false)

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
              <p className="text-gray-500 mt-1">Administra los roles, perfiles y contraseñas</p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <Link
                href="/admin/dashboard"
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/subjects"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
              >
                Ver Materias
              </Link>
              <Link
                href="/admin/academic"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
              >
                Carreras
              </Link>
              <form action="/auth/signout" method="post">
                <button className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
                  Cerrar Sesión
                </button>
              </form>
            </div>
          </header>

          <AdminUserList
            users={users || []}
            currentUser={user}
            roleFilter={roleFilter}
            statusFilter={statusFilter}
            inactiveCount={inactiveCount || 0}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount || 0}
          />
        </div>
      </div>
    </div>
  )
}
