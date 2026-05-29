import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import EnrollmentManager from './EnrollmentManager'
import MobileWarningBanner from '@/components/MobileWarningBanner'

export const dynamic = 'force-dynamic'

export default async function SubjectEnrollmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Obtener la materia
  const { data: subject } = await supabase.from('subjects').select('*').eq('id', id).single()
  
  if (!subject) redirect('/admin/subjects')

  // Obtener inscripciones actuales
  const { data: enrolledStudents } = await supabase
    .from('enrollments')
    .select('student:profiles(id, name)')
    .eq('subject_id', id)

  // Solo estudiantes activos disponibles para inscribir
  const { data: allStudents } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'STUDENT')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/admin/subjects" className="text-emerald-600 hover:text-emerald-700 font-medium text-sm flex items-center gap-1 mb-4 w-fit">
            ← Volver a Materias
          </Link>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestionar Estudiantes</h1>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg text-sm">{subject.code}</span>
              <p className="text-gray-600 font-medium">{subject.name}</p>
            </div>
          </div>
        </header>

        <EnrollmentManager 
          subjectId={id} 
          enrolledStudents={enrolledStudents || []} 
          allStudents={allStudents || []} 
        />
      </div>
      </div>
    </div>
  )
}
