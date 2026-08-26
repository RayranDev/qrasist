import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EnrollmentManager from './EnrollmentManager'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import BackLink from '@/components/BackLink'

export const dynamic = 'force-dynamic'

export default async function SubjectEnrollmentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Obtener la materia
  const { data: subject } = await supabase.from('subjects').select('*').eq('id', id).single()

  if (!subject) redirect('/admin/subjects')

  // Carreras de la materia (regla A: sin carrera no se gestionan
  // estudiantes)
  const { data: subjectCareers } = await supabase
    .from('subject_careers')
    .select('career_id')
    .eq('subject_id', id)
    .eq('is_active', true)
  const subjectCareerIds = (subjectCareers || []).map((sc) => sc.career_id)

  // Obtener inscripciones actuales
  const { data: enrolledStudents } = await supabase
    .from('enrollments')
    .select('student:profiles(id, name)')
    .eq('subject_id', id)

  // Solo estudiantes activos, con su(s) carrera(s), disponibles
  // para inscribir (regla D: debe coincidir con la de la materia)
  const { data: allStudentsRaw } = await supabase
    .from('profiles')
    .select('id, name, student_careers(career_id, is_active)')
    .eq('role', 'STUDENT')
    .eq('is_active', true)
    .order('name')

  const allStudents = (allStudentsRaw || []).map((s) => ({
    id: s.id,
    name: s.name,
    careerIds: ((s.student_careers || []) as { career_id: string; is_active: boolean }[])
      .filter((sc) => sc.is_active)
      .map((sc) => sc.career_id),
  }))

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="mb-8">
            <BackLink href="/admin/subjects">Volver a Materias</BackLink>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm mt-2">
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mb-2">
                Gestionar Estudiantes
              </h1>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg text-sm">
                  {subject.code}
                </span>
                <p className="text-gray-600 font-medium">{subject.name}</p>
              </div>
            </div>
          </header>

          {subjectCareerIds.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-8 text-center">
              <p className="font-bold text-amber-800 mb-1">
                Esta materia no pertenece a ninguna carrera todavía.
              </p>
              <p className="text-sm text-amber-700">
                Asignale una carrera desde{' '}
                <a href="/admin/subjects" className="underline font-semibold">
                  Materias
                </a>{' '}
                antes de inscribir estudiantes.
              </p>
            </div>
          ) : (
            <EnrollmentManager
              subjectId={id}
              enrolledStudents={
                (enrolledStudents || []) as unknown as Parameters<
                  typeof EnrollmentManager
                >[0]['enrolledStudents']
              }
              allStudents={allStudents}
              subjectCareerIds={subjectCareerIds}
            />
          )}
        </div>
      </div>
    </div>
  )
}
