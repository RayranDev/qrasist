import { requireRole } from '@/lib/auth/requireRole'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import EnrollmentRequestsPanel from '@/components/enrollmentRequests/EnrollmentRequestsPanel'
import type { RequestsSearchParams } from '@/lib/enrollmentRequests/filters'

export const dynamic = 'force-dynamic'

export default async function SubjectRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<RequestsSearchParams>
}) {
  const { id: subjectId } = await params
  const query = await searchParams
  // requireRole exige cuenta activa: un admin desactivado con sesion viva
  // no debe ver datos de toda la institucion.
  const { supabase, user, role } = await requireRole(['PROFESSOR', 'ADMIN'])
  const isAdmin = role === 'ADMIN'

  // Un admin puede revisar solicitudes de cualquier materia (mismo
  // permiso que ya usa la server action `approveEnrollmentRequests` vía
  // `resolveReviewableSubjects`) -- solo el profesor dueño queda
  // restringido a las suyas.
  const subjectQuery = supabase.from('subjects').select('id, name, code').eq('id', subjectId)
  const { data: subject } = isAdmin
    ? await subjectQuery.single()
    : await subjectQuery.eq('professor_id', user.id).single()

  if (!subject) redirect(isAdmin ? '/admin/subjects' : '/professor/subjects')

  return (
    <div className="min-h-screen bg-surface">
      <div className="p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <Link
            href={isAdmin ? '/admin/enrollment-requests' : '/professor/requests'}
            className="text-navy-700 hover:text-navy-900 font-medium text-sm flex items-center gap-1 mb-2"
          >
            ← Volver a todas las solicitudes
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Solicitudes de Inscripción</h1>
          <p className="text-gray-500 mb-8">
            {subject.name} · <span className="font-mono">{subject.code}</span>
          </p>

          <EnrollmentRequestsPanel
            supabase={supabase}
            scope={isAdmin ? {} : { professorId: user.id }}
            params={query}
            basePath={`/professor/subjects/${subjectId}/requests`}
            fixedSubjectId={subjectId}
          />
        </div>
      </div>
    </div>
  )
}
