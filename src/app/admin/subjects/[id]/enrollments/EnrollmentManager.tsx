'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { addEnrollment, removeEnrollment } from '@/lib/actions/enrollments'
import { useToast } from '@/components/toast/ToastProvider'
import ConfirmModal from '@/components/ConfirmModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { Users, UserCheck, Search } from 'lucide-react'
import { totalPagesFor } from '@/lib/utils/pagination'
import { countOf } from '@/lib/utils/plural'
import { buildEnrollmentsHref } from './enrollmentsHref'

interface Student {
  id: string
  name: string
  student_code: string | null
}

export default function EnrollmentManager({
  subjectId,
  basePath,
  searchQuery,
  pageSize,
  enrolledStudents,
  enrolledTotal,
  enrolledPage,
  availableStudents,
  availableTotal,
  availablePage,
  eligibleExist,
}: {
  subjectId: string
  basePath: string
  searchQuery: string
  pageSize: number
  enrolledStudents: Student[]
  enrolledTotal: number
  enrolledPage: number
  availableStudents: Student[]
  availableTotal: number
  availablePage: number
  /** Only meaningful when there is no search and no available student. */
  eligibleExist: boolean
}) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null)
  const [search, setSearch] = useState(searchQuery)
  const pendingSearch = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useToast()

  // Debounce: wait for the admin to stop typing instead of querying per keystroke.
  // The pushed URL never carries page/epage, so every new search starts at page 1.
  useEffect(() => {
    if (search.trim() === searchQuery) return
    pendingSearch.current = setTimeout(
      () => router.push(buildEnrollmentsHref(basePath, { q: search })),
      400
    )
    return () => {
      if (pendingSearch.current) clearTimeout(pendingSearch.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const hasSearch = searchQuery.length > 0

  const handleAdd = async (studentId: string, studentName: string) => {
    setLoadingId(studentId)
    const res = await addEnrollment(subjectId, studentId)
    if (res.success) {
      showToast(`${studentName} inscrito correctamente.`, 'success')
    } else {
      showToast(res.error || 'No se pudo inscribir al estudiante.', 'error')
    }
    setLoadingId(null)
  }

  const handleRemove = async () => {
    if (!pendingRemove) return
    const { id: studentId, name: studentName } = pendingRemove
    setLoadingId(studentId)
    const res = await removeEnrollment(subjectId, studentId)
    if (res.success) {
      showToast(`${studentName} fue removido de la materia.`, 'success')
    } else {
      showToast(res.error || 'No se pudo quitar al estudiante.', 'error')
    }
    setLoadingId(null)
    setPendingRemove(null)
  }

  const enrolledPages = totalPagesFor(enrolledTotal, pageSize)
  const availablePages = totalPagesFor(availableTotal, pageSize)

  return (
    <div>
      <div className="relative mb-6 max-w-md">
        <Search
          className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="text"
          aria-label="Buscar estudiante por código o nombre"
          placeholder="Código o nombre…"
          autoComplete="off"
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-100 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {pendingRemove && (
          <ConfirmModal
            title="Quitar estudiante"
            message={`¿Quitar a ${pendingRemove.name} de esta materia?`}
            confirmLabel="Quitar"
            loadingLabel="Quitando..."
            loading={loadingId === pendingRemove.id}
            onConfirm={handleRemove}
            onCancel={() => setPendingRemove(null)}
          />
        )}
        {/* Estudiantes Inscritos */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="min-w-8 h-8 px-2 rounded-full bg-navy-50 text-navy-700 flex items-center justify-center text-sm">
              {enrolledTotal}
            </span>
            Estudiantes Inscritos
          </h3>

          <div className="space-y-3">
            {enrolledStudents.length > 0 ? (
              enrolledStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex justify-between items-center gap-3 p-3 hover:bg-gray-50 rounded-xl border border-gray-100 transition"
                >
                  <div className="flex items-center gap-2 min-w-0 font-bold text-gray-900 text-sm">
                    <RoleBadge role="STUDENT" variant="compact" />
                    <span className="truncate">{student.name}</span>
                    {student.student_code && (
                      <span className="shrink-0 px-2 py-0.5 text-xs font-mono font-medium bg-neutral-100 text-neutral-700 border border-neutral-200/60 rounded-md">
                        {student.student_code}
                      </span>
                    )}
                  </div>
                  <button
                    disabled={loadingId === student.id}
                    onClick={() => setPendingRemove({ id: student.id, name: student.name })}
                    className="shrink-0 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                  >
                    {loadingId === student.id ? '...' : 'Quitar'}
                  </button>
                </div>
              ))
            ) : (
              <div className="p-4 bg-gray-50 rounded-xl">
                <EmptyState
                  icon={<UserCheck className="w-5 h-5" />}
                  title={
                    hasSearch
                      ? 'Ningún estudiante inscrito coincide con tu búsqueda'
                      : 'No hay estudiantes inscritos en esta materia'
                  }
                  description={
                    hasSearch ? undefined : 'Agrégalos desde la lista de estudiantes disponibles.'
                  }
                />
              </div>
            )}
          </div>

          <Pagination
            label="inscrito"
            page={enrolledPage}
            totalPages={enrolledPages}
            totalCount={enrolledTotal}
            prevHref={buildEnrollmentsHref(basePath, {
              q: searchQuery,
              page: availablePage,
              epage: enrolledPage - 1,
            })}
            nextHref={buildEnrollmentsHref(basePath, {
              q: searchQuery,
              page: availablePage,
              epage: enrolledPage + 1,
            })}
          />
        </div>

        {/* Estudiantes Disponibles */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Estudiantes Disponibles</h3>

          <div className="space-y-3">
            {availableStudents.length > 0 ? (
              availableStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex justify-between items-center gap-3 p-3 hover:bg-gray-50 rounded-xl border border-gray-100 transition"
                >
                  <div className="flex items-center gap-2 min-w-0 font-medium text-gray-700 text-sm">
                    <RoleBadge role="STUDENT" variant="compact" />
                    <span className="truncate">{student.name}</span>
                    {student.student_code && (
                      <span className="shrink-0 px-2 py-0.5 text-xs font-mono font-medium bg-neutral-100 text-neutral-700 border border-neutral-200/60 rounded-md">
                        {student.student_code}
                      </span>
                    )}
                  </div>
                  <button
                    disabled={loadingId === student.id}
                    onClick={() => handleAdd(student.id, student.name)}
                    className="shrink-0 px-3 py-1.5 text-xs font-bold text-navy-700 bg-navy-50 hover:bg-navy-100 rounded-lg transition disabled:opacity-50"
                  >
                    {loadingId === student.id ? '...' : '+ Añadir'}
                  </button>
                </div>
              ))
            ) : (
              <div className="p-4 bg-gray-50 rounded-xl">
                <EmptyState
                  icon={<Users className="w-5 h-5" />}
                  title={
                    hasSearch
                      ? 'Ningún estudiante disponible coincide con tu búsqueda'
                      : eligibleExist
                        ? 'Todos los estudiantes de esta carrera ya están inscritos'
                        : 'Ningún estudiante activo pertenece a la carrera de esta materia'
                  }
                  description={
                    hasSearch
                      ? 'Prueba con otro código o nombre. Solo aparecen estudiantes activos de la carrera de esta materia que aún no están inscritos.'
                      : eligibleExist
                        ? undefined
                        : 'Asigna estudiantes a la carrera correspondiente antes de inscribirlos aquí.'
                  }
                />
              </div>
            )}
          </div>

          <Pagination
            label="disponible"
            page={availablePage}
            totalPages={availablePages}
            totalCount={availableTotal}
            prevHref={buildEnrollmentsHref(basePath, {
              q: searchQuery,
              page: availablePage - 1,
              epage: enrolledPage,
            })}
            nextHref={buildEnrollmentsHref(basePath, {
              q: searchQuery,
              page: availablePage + 1,
              epage: enrolledPage,
            })}
          />
        </div>
      </div>
    </div>
  )
}

function Pagination({
  label,
  page,
  totalPages,
  totalCount,
  prevHref,
  nextHref,
}: {
  label: string
  page: number
  totalPages: number
  totalCount: number
  prevHref: string
  nextHref: string
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-6 gap-3 flex-wrap">
      <p className="text-xs text-gray-600 font-medium">
        Página {page} de {totalPages} · {countOf(totalCount, label)}
      </p>
      <div className="flex gap-2">
        <PageLink href={prevHref} disabled={page <= 1} label="← Anterior" />
        <PageLink href={nextHref} disabled={page >= totalPages} label="Siguiente →" />
      </div>
    </div>
  )
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
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
