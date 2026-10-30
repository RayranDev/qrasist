import { requireRole } from '@/lib/auth/requireRole'
import AdminHeader from '@/components/admin/AdminHeader'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import EnrollmentRequestsPanel from '@/components/enrollmentRequests/EnrollmentRequestsPanel'
import type { RequestsSearchParams } from '@/lib/enrollmentRequests/filters'

export const dynamic = 'force-dynamic'

export default async function AdminEnrollmentRequestsPage({
  searchParams,
}: {
  searchParams: Promise<RequestsSearchParams>
}) {
  const params = await searchParams
  const { supabase } = await requireRole(['ADMIN'])

  const { data: careers } = await supabase
    .from('careers')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <AdminHeader
            title="Solicitudes de inscripción"
            description="Revisa las solicitudes pendientes de todas las materias, una por una o en bloque"
            activeHref="/admin/enrollment-requests"
          />

          <EnrollmentRequestsPanel
            supabase={supabase}
            scope={{}}
            params={params}
            basePath="/admin/enrollment-requests"
            careers={careers || []}
          />
        </div>
      </div>
    </div>
  )
}
