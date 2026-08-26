import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminUserList from './AdminUserList'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import AdminHeader from '@/components/admin/AdminHeader'

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

  const { data: careers } = await supabase
    .from('careers')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  const { data: studentCareers } = await supabase
    .from('student_careers')
    .select('student_id, career_id')
    .eq('is_active', true)

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <AdminHeader
            title="Gestión de Usuarios"
            description="Administra los roles, perfiles y contraseñas"
            activeHref="/admin/users"
          />

          <AdminUserList
            users={users || []}
            currentUser={user}
            roleFilter={roleFilter}
            statusFilter={statusFilter}
            inactiveCount={inactiveCount || 0}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount || 0}
            careers={careers || []}
            studentCareers={studentCareers || []}
          />
        </div>
      </div>
    </div>
  )
}
