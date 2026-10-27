import { requireRole } from '@/lib/auth/requireRole'
import { redirect } from 'next/navigation'
import EnrollmentManager from './EnrollmentManager'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import BackLink from '@/components/BackLink'
import { sanitizeSearchTerm } from '@/lib/utils/searchTerm'
import { pageBounds, parsePageParam, resolveTwoListRedirect } from '@/lib/utils/pagination'
import { buildEnrollmentsHref } from './enrollmentsHref'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

interface StudentRow {
  id: string
  name: string
  student_code: string | null
}

export default async function SubjectEnrollmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; page?: string; epage?: string }>
}) {
  const { id } = await params
  const query = await searchParams

  const { supabase } = await requireRole(['ADMIN'])

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

  const basePath = `/admin/subjects/${id}/enrollments`
  const searchQuery = sanitizeSearchTerm(query.q)
  const availablePage = parsePageParam(query.page)
  const enrolledPage = parsePageParam(query.epage)

  let enrolledStudents: StudentRow[] = []
  let enrolledTotal = 0
  let availableStudents: StudentRow[] = []
  let availableTotal = 0
  let eligibleExist = false
  let loadFailed = false

  if (subjectCareerIds.length > 0) {
    // Se sacan comas, parentesis y comodines: tienen significado especial en la
    // sintaxis de filtros .or() de PostgREST (ver sanitizeSearchTerm).
    const searchFilter = `name.ilike.%${searchQuery}%,student_code.ilike.%${searchQuery}%`

    // Inscritos en esta materia, paginados y filtrables por la misma busqueda.
    // Se consulta desde profiles con enrollments!inner para poder ordenar y
    // filtrar por nombre/codigo en el servidor.
    let enrolledQuery = supabase
      .from('profiles')
      .select('id, name, student_code, enrollments!inner(subject_id)', { count: 'exact' })
      .eq('enrollments.subject_id', id)
      .order('name')
      .order('id')
    if (searchQuery) enrolledQuery = enrolledQuery.or(searchFilter)

    // Disponibles: solo estudiantes activos (regla D: con una carrera activa en
    // comun con la materia) que todavia no estan inscritos. El anti-join se
    // expresa con enrollments!left filtrado por esta materia + is null, para
    // no cargar los ids de los inscritos en la URL.
    let availableQuery = supabase
      .from('profiles')
      .select(
        'id, name, student_code, student_careers!inner(career_id, is_active), enrollments!left(subject_id)',
        { count: 'exact' }
      )
      .eq('role', 'STUDENT')
      .eq('is_active', true)
      .eq('student_careers.is_active', true)
      .in('student_careers.career_id', subjectCareerIds)
      .eq('enrollments.subject_id', id)
      .is('enrollments', null)
      .order('name')
      .order('id')
    if (searchQuery) availableQuery = availableQuery.or(searchFilter)

    const enrolledBounds = pageBounds(enrolledPage, PAGE_SIZE)
    const availableBounds = pageBounds(availablePage, PAGE_SIZE)

    const [enrolledRes, availableRes] = await Promise.all([
      enrolledQuery.range(enrolledBounds.from, enrolledBounds.to),
      availableQuery.range(availableBounds.from, availableBounds.to),
    ])

    // PostgREST answers PGRST103 (416) when the requested range starts past the
    // last row; with the counts, a page past the end is clamped to the last one
    // (e.g. after removing the only row of the last page).
    const enrolledOutOfRange = enrolledRes.error?.code === 'PGRST103'
    const availableOutOfRange = availableRes.error?.code === 'PGRST103'
    const redirectTo = resolveTwoListRedirect(
      {
        available: {
          page: availablePage,
          total: availableRes.error ? null : (availableRes.count ?? 0),
          outOfRange: availableOutOfRange,
        },
        enrolled: {
          page: enrolledPage,
          total: enrolledRes.error ? null : (enrolledRes.count ?? 0),
          outOfRange: enrolledOutOfRange,
        },
      },
      PAGE_SIZE
    )
    if (redirectTo) {
      redirect(buildEnrollmentsHref(basePath, { q: searchQuery, ...redirectTo }))
    }

    if (enrolledRes.error || availableRes.error) {
      loadFailed = true
      console.error('enrollments page query failed', enrolledRes.error, availableRes.error)
    }

    enrolledStudents = (enrolledRes.data || []) as unknown as StudentRow[]
    enrolledTotal = enrolledRes.count ?? 0
    availableStudents = (availableRes.data || []) as unknown as StudentRow[]
    availableTotal = availableRes.count ?? 0

    // Empty-state wording: nobody eligible vs. everybody eligible already enrolled.
    if (availableTotal === 0 && !searchQuery) {
      const { count } = await supabase
        .from('profiles')
        .select('id, student_careers!inner(career_id)', { count: 'exact', head: true })
        .eq('role', 'STUDENT')
        .eq('is_active', true)
        .eq('student_careers.is_active', true)
        .in('student_careers.career_id', subjectCareerIds)
      eligibleExist = (count ?? 0) > 0
    }
  }

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
                <span className="px-3 py-1 bg-navy-50 text-navy-700 font-bold rounded-lg text-sm">
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
                Asígnale una carrera desde{' '}
                <a href="/admin/subjects" className="underline font-semibold">
                  Materias
                </a>{' '}
                antes de inscribir estudiantes.
              </p>
            </div>
          ) : (
            <>
              {loadFailed && (
                <div
                  role="alert"
                  className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm font-medium text-amber-800"
                >
                  No se pudo cargar la lista de estudiantes. Recarga la página e inténtalo de nuevo.
                </div>
              )}
              <EnrollmentManager
                subjectId={id}
                basePath={basePath}
                searchQuery={searchQuery}
                pageSize={PAGE_SIZE}
                enrolledStudents={enrolledStudents}
                enrolledTotal={enrolledTotal}
                enrolledPage={enrolledPage}
                availableStudents={availableStudents}
                availableTotal={availableTotal}
                availablePage={availablePage}
                eligibleExist={eligibleExist}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
