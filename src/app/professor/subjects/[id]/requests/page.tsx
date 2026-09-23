import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import RequestsList from './RequestsList'

export const dynamic = 'force-dynamic'

export default async function SubjectRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'ADMIN'

  // Un admin puede revisar solicitudes de cualquier materia (mismo
  // permiso que ya usa la server action `approveEnrollmentRequest` vía
  // `checkAdminOrSubjectProfessor`) -- solo el profesor dueño queda
  // restringido a las suyas.
  const subjectQuery = supabase.from('subjects').select('id, name, code').eq('id', subjectId)
  const { data: subject } = isAdmin
    ? await subjectQuery.single()
    : await subjectQuery.eq('professor_id', user.id).single()

  if (!subject) redirect(isAdmin ? '/admin/subjects' : '/professor/subjects')

  // enrollment_requests tiene dos FK hacia profiles (student_id y
  // reviewed_by) -- hay que decirle a PostgREST cual usar para el
  // embed, si no la query falla con PGRST201 (ambiguedad) y se
  // pierde en silencio como "sin solicitudes".
  const { data: requests, error: requestsError } = await supabase
    .from('enrollment_requests')
    .select(
      'id, requested_at, student:profiles!enrollment_requests_student_id_fkey(name, student_code)'
    )
    .eq('subject_id', subjectId)
    .eq('status', 'pending')
    .order('requested_at')

  if (requestsError) {
    console.error('Error cargando solicitudes de inscripción:', requestsError)
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <Link
            href={isAdmin ? '/admin/subjects' : '/professor/subjects'}
            className="text-navy-700 hover:text-navy-900 font-medium text-sm flex items-center gap-1 mb-2"
          >
            ← Volver a {isAdmin ? 'Materias' : 'Mis Materias'}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Solicitudes de Inscripción</h1>
          <p className="text-gray-500 mb-8">
            {subject.name} · <span className="font-mono">{subject.code}</span>
          </p>

          <RequestsList
            requests={
              (requests || []) as unknown as {
                id: string
                requested_at: string
                student: { name: string; student_code: string | null } | null
              }[]
            }
          />
        </div>
      </div>
    </div>
  )
}
