import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CreateSubjectForm, SubjectActionButtons } from './SubjectComponents'
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
    .select('*, professor:profiles(name), enrollments(student_id)')
    .order('is_active', { ascending: false })
    .order('name')
  const { data: professors } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'PROFESSOR')
    .eq('is_active', true)

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

          <CreateSubjectForm professors={professors || []} />

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
                        </div>
                        <SubjectActionButtons subject={sub} professors={professors || []} />
                      </div>
                      <h3 className="font-bold text-gray-900 mb-1 text-lg">{sub.name}</h3>
                      <p className="text-sm text-gray-500 font-medium mb-4">
                        Prof. {sub.professor?.name || 'Sin asignar'}
                      </p>

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
