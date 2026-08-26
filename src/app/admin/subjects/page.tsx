import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  CreateSubjectForm,
  SubjectActionButtons,
  SubjectCareerAssignment,
} from './SubjectComponents'
import ExportSubjectsButton from './ExportSubjectsButton'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import AdminHeader from '@/components/admin/AdminHeader'
import BulkImportButton from '@/components/admin/BulkImportButton'

export const dynamic = 'force-dynamic'

export default async function AdminSubjectsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch subjects (todos para mostrar activos e inactivos) y profesores activos
  const { data: subjects } = await supabase
    .from('subjects')
    .select(
      '*, professor:profiles(name), enrollments(student_id), period:periods(id, name), subject_careers(id, level, is_active, career:careers(id, name, code))'
    )
    .order('is_active', { ascending: false })
    .order('name')
  const { data: professorsRaw } = await supabase
    .from('profiles')
    .select('id, name, professor_careers(career_id, is_active)')
    .eq('role', 'PROFESSOR')
    .eq('is_active', true)

  const professors = (professorsRaw || []).map((p) => ({
    id: p.id,
    name: p.name,
    careerIds: ((p.professor_careers || []) as { career_id: string; is_active: boolean }[])
      .filter((pc) => pc.is_active)
      .map((pc) => pc.career_id),
  }))
  const { data: periods } = await supabase
    .from('periods')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: false })
  const { data: careers } = await supabase
    .from('careers')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  const exportRows = (subjects || []).map((s) => ({
    code: s.code,
    name: s.name,
    professorName: s.professor?.name || 'Sin asignar',
    isActive: s.is_active !== false,
    studentCount: (s.enrollments as { student_id: string }[] | null)?.length || 0,
  }))

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <AdminHeader
            title="Panel de Administrador"
            description="Gestiona las materias y profesores"
            activeHref="/admin/subjects"
          />

          <CreateSubjectForm periods={periods || []} />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-xl font-semibold">Materias</h2>
              <div className="flex items-center gap-3">
                {subjects?.some((s) => s.is_active === false) && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                    {subjects.filter((s) => s.is_active === false).length} archivada(s)
                  </span>
                )}
                <BulkImportButton types={['SUBJECT', 'ENROLLMENT']} />
                <ExportSubjectsButton subjects={exportRows} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects?.map((sub) => {
                const isActive = sub.is_active !== false
                const activeCareerLinks = (
                  (sub.subject_careers || []) as {
                    id: string
                    level: number | null
                    is_active: boolean
                    career: { id: string; name: string; code: string } | null
                  }[]
                ).filter((a) => a.is_active)
                const subjectCareerIds = activeCareerLinks
                  .map((a) => a.career?.id)
                  .filter((id): id is string => Boolean(id))
                return (
                  <div
                    key={sub.id}
                    className={`p-4 border rounded-xl transition flex flex-col justify-between ${
                      isActive
                        ? 'border-gray-100 hover:border-emerald-100'
                        : 'border-dashed border-amber-200 bg-amber-50/30 opacity-70'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2 relative">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-1 text-xs font-bold rounded-md ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                          >
                            {sub.code}
                          </span>
                          {!isActive && (
                            <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
                              Archivada
                            </span>
                          )}
                          {sub.period && (
                            <span className="px-2 py-0.5 text-xs font-bold bg-violet-50 text-violet-700 rounded-full">
                              {sub.period.name}
                            </span>
                          )}
                        </div>
                        <SubjectActionButtons
                          subject={sub}
                          professors={professors}
                          periods={periods || []}
                          subjectCareerIds={subjectCareerIds}
                        />
                      </div>
                      <h3 className="font-bold text-gray-900 mb-1 text-lg">{sub.name}</h3>
                      <p className="text-sm text-gray-500 font-medium mb-3">
                        Prof. {sub.professor?.name || 'Sin asignar'}
                      </p>

                      <SubjectCareerAssignment
                        subjectId={sub.id}
                        assignments={activeCareerLinks}
                        careers={careers || []}
                      />

                      {isActive && (
                        <Link
                          href={`/admin/subjects/${sub.id}/enrollments`}
                          className="block w-full py-2 bg-gray-50 hover:bg-emerald-50 text-emerald-600 text-center rounded-xl text-sm font-bold transition border border-gray-100 hover:border-emerald-100"
                        >
                          Gestionar Estudiantes
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
