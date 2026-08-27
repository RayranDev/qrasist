import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BackLink from '@/components/BackLink'
import SubjectBrowser from './SubjectBrowser'

export const dynamic = 'force-dynamic'

interface SubjectCareerRow {
  id: string
  level: number | null
  career: { id: string; name: string; code: string } | null
  subject: {
    id: string
    name: string
    code: string
    is_active: boolean | null
  } | null
}

export default async function StudentSubjectsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: studentCareers } = await supabase
    .from('student_careers')
    .select('career:careers(id, name, code)')
    .eq('student_id', user.id)
    .eq('is_active', true)

  const careers = (studentCareers || [])
    .map((r) => r.career as unknown as { id: string; name: string; code: string } | null)
    .filter((c): c is { id: string; name: string; code: string } => c !== null)

  const careerIds = careers.map((c) => c.id)

  let rows: SubjectCareerRow[] = []
  if (careerIds.length > 0) {
    const { data } = await supabase
      .from('subject_careers')
      .select(
        `
        id,
        level,
        career:careers ( id, name, code ),
        subject:subjects ( id, name, code, is_active )
      `
      )
      .in('career_id', careerIds)
      .eq('is_active', true)
    rows = (data || []) as unknown as SubjectCareerRow[]
  }

  const available = rows.filter((r) => r.subject && r.subject.is_active !== false)

  const [{ data: enrollments }, { data: requests }] = await Promise.all([
    supabase.from('enrollments').select('subject_id').eq('student_id', user.id),
    supabase.from('enrollment_requests').select('subject_id, status').eq('student_id', user.id),
  ])

  const enrolledIds = new Set((enrollments || []).map((e) => e.subject_id))
  const requestStatusBySubject = new Map(
    (requests || []).map((r) => [r.subject_id, r.status as string])
  )

  const items = available.map((r) => ({
    subjectCareerId: r.id,
    level: r.level,
    career: r.career!,
    subject: {
      id: r.subject!.id,
      name: r.subject!.name,
      code: r.subject!.code,
    },
    status: enrolledIds.has(r.subject!.id)
      ? ('enrolled' as const)
      : requestStatusBySubject.get(r.subject!.id) === 'pending'
        ? ('pending' as const)
        : requestStatusBySubject.get(r.subject!.id) === 'rejected'
          ? ('rejected' as const)
          : ('none' as const),
  }))

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col">
        <header className="mb-6 pt-4">
          <BackLink href="/student/scanner">Volver al Inicio</BackLink>
          <h1 className="text-xl font-black text-gray-900">Mis Materias</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Elegí una materia de tu carrera y pedí inscripción directamente.
          </p>
        </header>

        {careerIds.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
            <p className="text-sm text-gray-500 font-medium">
              Todavía no tenés una carrera asignada.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Contactá al administrador para que te la asigne.
            </p>
          </div>
        ) : (
          <SubjectBrowser careers={careers} items={items} />
        )}
      </div>
    </div>
  )
}
