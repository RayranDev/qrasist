import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import InstitutionMark from '@/components/brand/InstitutionMark'
import JustificationsList, { JustificationRow } from './JustificationsList'

export const dynamic = 'force-dynamic'

export default async function ProfessorJustificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, name, code')
    .eq('professor_id', user.id)

  const subjectIds = (subjects || []).map((s) => s.id)

  // absence_justifications tiene dos FK hacia profiles (student_id y
  // reviewed_by, ver migración 024) -- se pinea explícitamente cuál
  // usar para el embed, igual que ya se hace con enrollment_requests
  // en RequestsList, para no chocar con la ambigüedad PGRST201.
  const hasSubjects = subjectIds.length > 0
  const { data: justifications, error } = hasSubjects
    ? await supabase
        .from('absence_justifications')
        .select(
          `
          id,
          reason,
          attachment_path,
          status,
          review_note,
          reviewed_at,
          created_at,
          subject:subjects(id, name, code),
          session:sessions(id, date),
          student:profiles!absence_justifications_student_id_fkey(name, student_code)
        `
        )
        .in('subject_id', subjectIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null }

  if (error) {
    console.error('Error cargando justificaciones:', error)
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8 pb-6 border-b border-gray-100 border-t-4 border-t-brand-700 -mt-4 pt-4 md:-mt-8 md:pt-6 flex flex-col gap-4">
            <InstitutionMark size="sm" />
            <div>
              <Link
                href="/professor/subjects"
                className="text-navy-700 hover:text-navy-900 font-semibold text-sm inline-flex items-center gap-1 mb-2"
              >
                ← Volver a Mis Materias
              </Link>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                Justificaciones de Inasistencia
              </h1>
              <p className="text-gray-500 mt-1 text-sm">
                Revisa y decide las justificaciones enviadas por tus estudiantes
              </p>
            </div>
          </header>

          <JustificationsList
            justifications={(justifications || []) as unknown as JustificationRow[]}
            subjects={subjects || []}
          />
        </div>
      </div>
    </div>
  )
}
