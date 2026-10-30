import { requireRole } from '@/lib/auth/requireRole'
import { redirect } from 'next/navigation'
import InstitutionMark from '@/components/brand/InstitutionMark'
import BackLink from '@/components/BackLink'
import EnrollmentRequestsPanel from '@/components/enrollmentRequests/EnrollmentRequestsPanel'
import type { RequestsSearchParams } from '@/lib/enrollmentRequests/filters'

export const dynamic = 'force-dynamic'

export default async function ProfessorRequestsPage({
  searchParams,
}: {
  searchParams: Promise<RequestsSearchParams>
}) {
  const params = await searchParams
  // requireRole exige cuenta activa. Coordinación tiene su propia pantalla
  // con todas las materias.
  const { supabase, user, role } = await requireRole(['PROFESSOR', 'ADMIN'])
  if (role === 'ADMIN') redirect('/admin/enrollment-requests')

  return (
    <div className="min-h-screen bg-surface">
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8 pb-6 border-b border-gray-100 border-t-4 border-t-brand-700 -mt-4 pt-4 md:-mt-8 md:pt-6 flex flex-col gap-4">
            <InstitutionMark size="sm" />
            <div>
              <BackLink href="/professor/subjects">Volver a Mis Materias</BackLink>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                Solicitudes de inscripción
              </h1>
              <p className="text-gray-500 mt-1 text-sm">
                Solicitudes pendientes de tus materias, agrupadas por materia o por estudiante.
              </p>
            </div>
          </header>

          <EnrollmentRequestsPanel
            supabase={supabase}
            scope={{ professorId: user.id }}
            params={params}
            basePath="/professor/requests"
          />
        </div>
      </div>
    </div>
  )
}
