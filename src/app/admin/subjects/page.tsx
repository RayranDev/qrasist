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
import SubjectFilters from './SubjectFilters'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

type StatusFilter = 'active' | 'inactive'

interface SubjectCareerLinkRow {
  subject_id: string
  career_id: string
  level: number | null
  is_active: boolean
}

export default async function AdminSubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    career?: string
    level?: string
    professor?: string
    status?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const statusFilter: StatusFilter = params.status === 'inactive' ? 'inactive' : 'active'
  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: careers } = await supabase
    .from('careers')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  const { data: professorsRaw } = await supabase
    .from('profiles')
    .select('id, name, professor_careers(career_id, is_active)')
    .eq('role', 'PROFESSOR')
    .eq('is_active', true)
    .order('name')

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

  const { data: allSubjectCareers } = await supabase
    .from('subject_careers')
    .select('subject_id, career_id, level, is_active')
    .eq('is_active', true)

  const subjectCareerLinks = (allSubjectCareers || []) as SubjectCareerLinkRow[]

  const careerFilter = careers?.some((c) => c.id === params.career) ? params.career : undefined
  const availableLevels = careerFilter
    ? Array.from(
        new Set(
          subjectCareerLinks
            .filter((sc) => sc.career_id === careerFilter && sc.level != null)
            .map((sc) => sc.level as number)
        )
      ).sort((a, b) => a - b)
    : []
  const levelFilter =
    careerFilter && params.level && availableLevels.includes(Number(params.level))
      ? Number(params.level)
      : undefined

  const professorFilter =
    params.professor === 'unassigned' || professors.some((p) => p.id === params.professor)
      ? params.professor
      : undefined

  let query = supabase
    .from('subjects')
    .select(
      '*, professor:profiles(name), enrollments(student_id), period:periods(id, name), subject_careers(id, level, is_active, career:careers(id, name, code))',
      { count: 'exact' }
    )
    .eq('is_active', statusFilter === 'active')
    .order('name')

  if (careerFilter) {
    let ids = subjectCareerLinks
      .filter((sc) => sc.career_id === careerFilter)
      .map((sc) => sc.subject_id)
    if (levelFilter !== undefined) {
      ids = subjectCareerLinks
        .filter((sc) => sc.career_id === careerFilter && sc.level === levelFilter)
        .map((sc) => sc.subject_id)
    }
    query = query.in('id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])
  }

  if (professorFilter === 'unassigned') {
    query = query.is('professor_id', null)
  } else if (professorFilter) {
    query = query.eq('professor_id', professorFilter)
  }

  const { data: subjects, count: totalCount } = await query.range(from, to)

  const { count: inactiveCount } = await supabase
    .from('subjects')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', false)

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / PAGE_SIZE))

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
                <BulkImportButton types={['SUBJECT', 'ENROLLMENT']} />
                <ExportSubjectsButton subjects={exportRows} />
              </div>
            </div>

            <SubjectFilters
              careers={careers || []}
              professors={professors}
              availableLevels={availableLevels}
              careerFilter={careerFilter}
              levelFilter={levelFilter}
              professorFilter={professorFilter}
              statusFilter={statusFilter}
              inactiveCount={inactiveCount || 0}
            />

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
              {subjects?.length === 0 && (
                <p className="col-span-full text-center text-gray-400 italic py-10">
                  Ninguna materia coincide con estos filtros.
                </p>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 px-1">
                <p className="text-xs text-gray-500 font-medium">
                  Página {currentPage} de {totalPages} · {totalCount} materia
                  {totalCount !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <PageLink
                    page={currentPage - 1}
                    disabled={currentPage <= 1}
                    params={params}
                    label="← Anterior"
                  />
                  <PageLink
                    page={currentPage + 1}
                    disabled={currentPage >= totalPages}
                    params={params}
                    label="Siguiente →"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PageLink({
  page,
  disabled,
  params,
  label,
}: {
  page: number
  disabled: boolean
  params: { career?: string; level?: string; professor?: string; status?: string }
  label: string
}) {
  const qs = new URLSearchParams()
  if (params.career) qs.set('career', params.career)
  if (params.level) qs.set('level', params.level)
  if (params.professor) qs.set('professor', params.professor)
  if (params.status) qs.set('status', params.status)
  if (page > 1) qs.set('page', String(page))
  const href = qs.toString() ? `?${qs.toString()}` : '?'

  return (
    <Link
      href={href}
      aria-disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
        disabled
          ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
    </Link>
  )
}
