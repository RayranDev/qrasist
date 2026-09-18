'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Layers,
  UserCheck,
  BookMarked,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  SlidersHorizontal,
} from 'lucide-react'

export interface CareerItem {
  id: string
  name: string
  code: string
  studentCount: number
  subjectCount: number
}

export interface ProfessorItem {
  id: string
  name: string
  subjectCount: number
}

export interface SubjectItem {
  id: string
  name: string
  code: string
  studentCount: number
  absenceRuleType?: string
  maxAbsencePercentage?: number
}

export interface StudentItem {
  id: string
  name: string
  student_code: string | null
  subjectCount: number
}

interface PaginatedConsolidatedBoardProps {
  careers: CareerItem[]
  professors: ProfessorItem[]
  subjects: SubjectItem[]
  students: StudentItem[]
}

const ITEMS_PER_PAGE = 6

export default function PaginatedConsolidatedBoard({
  careers,
  professors,
  subjects,
  students,
}: PaginatedConsolidatedBoardProps) {
  // Tab / Slide activo: 'all' | 'careers' | 'professors' | 'subjects' | 'students'
  const [activeSlide, setActiveSlide] = useState<
    'all' | 'careers' | 'professors' | 'subjects' | 'students'
  >('all')

  // Búsqueda independiente por entidad
  const [searchCareer, setSearchCareer] = useState('')
  const [searchProfessor, setSearchProfessor] = useState('')
  const [searchSubject, setSearchSubject] = useState('')
  const [searchStudent, setSearchStudent] = useState('')

  // Paginación independiente por entidad
  const [pageCareer, setPageCareer] = useState(1)
  const [pageProfessor, setPageProfessor] = useState(1)
  const [pageSubject, setPageSubject] = useState(1)
  const [pageStudent, setPageStudent] = useState(1)

  // Filtrado reactivo en memoria
  const filteredCareers = useMemo(() => {
    const q = searchCareer.trim().toLowerCase()
    if (!q) return careers
    return careers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    )
  }, [careers, searchCareer])

  const filteredProfessors = useMemo(() => {
    const q = searchProfessor.trim().toLowerCase()
    if (!q) return professors
    return professors.filter((p) => p.name.toLowerCase().includes(q))
  }, [professors, searchProfessor])

  const filteredSubjects = useMemo(() => {
    const q = searchSubject.trim().toLowerCase()
    if (!q) return subjects
    return subjects.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    )
  }, [subjects, searchSubject])

  const filteredStudents = useMemo(() => {
    const q = searchStudent.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (st) =>
        st.name.toLowerCase().includes(q) ||
        (st.student_code && st.student_code.toLowerCase().includes(q))
    )
  }, [students, searchStudent])

  // Paginado
  const totalCareerPages = Math.max(1, Math.ceil(filteredCareers.length / ITEMS_PER_PAGE))
  const totalProfessorPages = Math.max(1, Math.ceil(filteredProfessors.length / ITEMS_PER_PAGE))
  const totalSubjectPages = Math.max(1, Math.ceil(filteredSubjects.length / ITEMS_PER_PAGE))
  const totalStudentPages = Math.max(1, Math.ceil(filteredStudents.length / ITEMS_PER_PAGE))

  const paginatedCareers = filteredCareers.slice(
    (pageCareer - 1) * ITEMS_PER_PAGE,
    pageCareer * ITEMS_PER_PAGE
  )
  const paginatedProfessors = filteredProfessors.slice(
    (pageProfessor - 1) * ITEMS_PER_PAGE,
    pageProfessor * ITEMS_PER_PAGE
  )
  const paginatedSubjects = filteredSubjects.slice(
    (pageSubject - 1) * ITEMS_PER_PAGE,
    pageSubject * ITEMS_PER_PAGE
  )
  const paginatedStudents = filteredStudents.slice(
    (pageStudent - 1) * ITEMS_PER_PAGE,
    pageStudent * ITEMS_PER_PAGE
  )

  // Desplazamiento por pestañas (slide next/prev)
  const slideTabs: Array<'careers' | 'professors' | 'subjects' | 'students'> = [
    'careers',
    'professors',
    'subjects',
    'students',
  ]

  const nextSlide = () => {
    if (activeSlide === 'all') {
      setActiveSlide('subjects')
      return
    }
    const idx = slideTabs.indexOf(activeSlide)
    const nextIdx = (idx + 1) % slideTabs.length
    setActiveSlide(slideTabs[nextIdx])
  }

  const prevSlide = () => {
    if (activeSlide === 'all') {
      setActiveSlide('students')
      return
    }
    const idx = slideTabs.indexOf(activeSlide)
    const prevIdx = (idx - 1 + slideTabs.length) % slideTabs.length
    setActiveSlide(slideTabs[prevIdx])
  }

  return (
    <div className="space-y-4">
      {/* Barra de control: Switcher de Vista y Navegación de Slide */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-neutral-200/80 shadow-2xs">
        {/* Pestañas Segmentadas */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveSlide('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
              activeSlide === 'all'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Ver Todo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSlide('subjects')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
              activeSlide === 'subjects'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Materias</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                activeSlide === 'subjects'
                  ? 'bg-neutral-800 text-neutral-200'
                  : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {subjects.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSlide('students')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
              activeSlide === 'students'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <Users className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Estudiantes</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                activeSlide === 'students'
                  ? 'bg-neutral-800 text-neutral-200'
                  : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {students.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSlide('professors')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
              activeSlide === 'professors'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Docentes</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                activeSlide === 'professors'
                  ? 'bg-neutral-800 text-neutral-200'
                  : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {professors.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSlide('careers')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
              activeSlide === 'careers'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Carreras</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                activeSlide === 'careers'
                  ? 'bg-neutral-800 text-neutral-200'
                  : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {careers.length}
            </span>
          </button>
        </div>

        {/* Controles de Slide Anterior / Siguiente */}
        <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={prevSlide}
            aria-label="Slide anterior"
            className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-neutral-400 px-1 select-none">Slide</span>
          <button
            type="button"
            onClick={nextSlide}
            aria-label="Siguiente slide"
            className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grilla / Contenedor de Vistas */}
      <div
        className={
          activeSlide === 'all'
            ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5'
            : 'max-w-4xl mx-auto'
        }
      >
        {/* ==================== COLUMNA / SLIDE: MATERIAS ==================== */}
        {(activeSlide === 'all' || activeSlide === 'subjects') && (
          <div className="bg-white rounded-xl border border-neutral-200/80 shadow-2xs overflow-hidden flex flex-col transition-all">
            {/* Cabecera */}
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-neutral-700 stroke-[1.75]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Materias
                </h2>
                <span className="text-[11px] font-mono text-neutral-500 bg-neutral-100 px-1.5 py-0.2 rounded-md">
                  {filteredSubjects.length}
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 bg-white border border-neutral-200/60 px-1.5 py-0.5 rounded-md">
                Inscritos
              </span>
            </div>

            {/* Buscador reactivo en vivo */}
            <div className="p-2.5 border-b border-neutral-100 bg-neutral-50/20">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Filtrar materia o código..."
                  value={searchSubject}
                  onChange={(e) => {
                    setSearchSubject(e.target.value)
                    setPageSubject(1)
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-200/80 rounded-lg placeholder-neutral-400 text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            {/* Listado Paginado */}
            <div className="divide-y divide-neutral-100 min-h-[290px] flex flex-col justify-between">
              <div>
                {paginatedSubjects.length > 0 ? (
                  paginatedSubjects.map((s) => (
                    <Link
                      key={s.id}
                      href={`/admin/subjects/${s.id}/enrollments`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50/80 transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-neutral-900 truncate group-hover:text-neutral-950">
                          {s.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-neutral-400 font-mono">{s.code}</span>
                          {s.maxAbsencePercentage && (
                            <span className="text-[9px] font-mono text-neutral-500 bg-neutral-100 px-1 py-0.2 rounded">
                              {s.maxAbsencePercentage}% máx
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md shrink-0 ${
                          s.studentCount > 0
                            ? 'text-neutral-900 bg-neutral-100'
                            : 'text-neutral-400 bg-neutral-50'
                        }`}
                      >
                        {s.studentCount}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-12 text-xs text-neutral-400 italic text-center">
                    No se encontraron materias
                  </p>
                )}
              </div>

              {/* Controles de Paginación */}
              <div className="p-2.5 border-t border-neutral-100 bg-neutral-50/40 flex items-center justify-between mt-auto">
                <span className="text-[11px] font-mono text-neutral-500">
                  Pág. {pageSubject} de {totalSubjectPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPageSubject((p) => Math.max(1, p - 1))}
                    disabled={pageSubject <= 1}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-neutral-200/60 transition-colors cursor-pointer"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageSubject((p) => Math.min(totalSubjectPages, p + 1))}
                    disabled={pageSubject >= totalSubjectPages}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-neutral-200/60 transition-colors cursor-pointer"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== COLUMNA / SLIDE: ESTUDIANTES ==================== */}
        {(activeSlide === 'all' || activeSlide === 'students') && (
          <div className="bg-white rounded-xl border border-neutral-200/80 shadow-2xs overflow-hidden flex flex-col transition-all">
            {/* Cabecera */}
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-neutral-700 stroke-[1.75]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Estudiantes
                </h2>
                <span className="text-[11px] font-mono text-neutral-500 bg-neutral-100 px-1.5 py-0.2 rounded-md">
                  {filteredStudents.length}
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 bg-white border border-neutral-200/60 px-1.5 py-0.5 rounded-md">
                Materias
              </span>
            </div>

            {/* Buscador reactivo en vivo */}
            <div className="p-2.5 border-b border-neutral-100 bg-neutral-50/20">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Filtrar por nombre o código..."
                  value={searchStudent}
                  onChange={(e) => {
                    setSearchStudent(e.target.value)
                    setPageStudent(1)
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-200/80 rounded-lg placeholder-neutral-400 text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            {/* Listado Paginado */}
            <div className="divide-y divide-neutral-100 min-h-[290px] flex flex-col justify-between">
              <div>
                {paginatedStudents.length > 0 ? (
                  paginatedStudents.map((st) => (
                    <Link
                      key={st.id}
                      href="/admin/users?role=STUDENT"
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50/80 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-6 h-6 rounded-md bg-neutral-100 text-neutral-700 text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border border-neutral-200/60">
                          {st.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-neutral-900 truncate group-hover:text-neutral-950">
                            {st.name}
                          </p>
                          <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                            {st.student_code || 'Sin código'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md shrink-0 ${
                          st.subjectCount > 0
                            ? 'text-neutral-900 bg-neutral-100'
                            : 'text-neutral-400 bg-neutral-50'
                        }`}
                      >
                        {st.subjectCount}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-12 text-xs text-neutral-400 italic text-center">
                    No se encontraron estudiantes
                  </p>
                )}
              </div>

              {/* Controles de Paginación */}
              <div className="p-2.5 border-t border-neutral-100 bg-neutral-50/40 flex items-center justify-between mt-auto">
                <span className="text-[11px] font-mono text-neutral-500">
                  Pág. {pageStudent} de {totalStudentPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPageStudent((p) => Math.max(1, p - 1))}
                    disabled={pageStudent <= 1}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-neutral-200/60 transition-colors cursor-pointer"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageStudent((p) => Math.min(totalStudentPages, p + 1))}
                    disabled={pageStudent >= totalStudentPages}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-neutral-200/60 transition-colors cursor-pointer"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== COLUMNA / SLIDE: DOCENTES ==================== */}
        {(activeSlide === 'all' || activeSlide === 'professors') && (
          <div className="bg-white rounded-xl border border-neutral-200/80 shadow-2xs overflow-hidden flex flex-col transition-all">
            {/* Cabecera */}
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-neutral-700 stroke-[1.75]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Docentes
                </h2>
                <span className="text-[11px] font-mono text-neutral-500 bg-neutral-100 px-1.5 py-0.2 rounded-md">
                  {filteredProfessors.length}
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 bg-white border border-neutral-200/60 px-1.5 py-0.5 rounded-md">
                Materias
              </span>
            </div>

            {/* Buscador reactivo en vivo */}
            <div className="p-2.5 border-b border-neutral-100 bg-neutral-50/20">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Filtrar docente..."
                  value={searchProfessor}
                  onChange={(e) => {
                    setSearchProfessor(e.target.value)
                    setPageProfessor(1)
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-200/80 rounded-lg placeholder-neutral-400 text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            {/* Listado Paginado */}
            <div className="divide-y divide-neutral-100 min-h-[290px] flex flex-col justify-between">
              <div>
                {paginatedProfessors.length > 0 ? (
                  paginatedProfessors.map((p) => (
                    <Link
                      key={p.id}
                      href="/admin/users?role=PROFESSOR"
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50/80 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-6 h-6 rounded-md bg-neutral-100 text-neutral-700 text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border border-neutral-200/60">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-neutral-900 truncate group-hover:text-neutral-950">
                          {p.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md shrink-0 ${
                          p.subjectCount > 0
                            ? 'text-neutral-900 bg-neutral-100'
                            : 'text-neutral-400 bg-neutral-50'
                        }`}
                      >
                        {p.subjectCount}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-12 text-xs text-neutral-400 italic text-center">
                    No se encontraron docentes
                  </p>
                )}
              </div>

              {/* Controles de Paginación */}
              <div className="p-2.5 border-t border-neutral-100 bg-neutral-50/40 flex items-center justify-between mt-auto">
                <span className="text-[11px] font-mono text-neutral-500">
                  Pág. {pageProfessor} de {totalProfessorPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPageProfessor((p) => Math.max(1, p - 1))}
                    disabled={pageProfessor <= 1}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-neutral-200/60 transition-colors cursor-pointer"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageProfessor((p) => Math.min(totalProfessorPages, p + 1))}
                    disabled={pageProfessor >= totalProfessorPages}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-neutral-200/60 transition-colors cursor-pointer"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== COLUMNA / SLIDE: CARRERAS ==================== */}
        {(activeSlide === 'all' || activeSlide === 'careers') && (
          <div className="bg-white rounded-xl border border-neutral-200/80 shadow-2xs overflow-hidden flex flex-col transition-all">
            {/* Cabecera */}
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-neutral-700 stroke-[1.75]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Carreras
                </h2>
                <span className="text-[11px] font-mono text-neutral-500 bg-neutral-100 px-1.5 py-0.2 rounded-md">
                  {filteredCareers.length}
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 bg-white border border-neutral-200/60 px-1.5 py-0.5 rounded-md">
                Alum · Mat
              </span>
            </div>

            {/* Buscador reactivo en vivo */}
            <div className="p-2.5 border-b border-neutral-100 bg-neutral-50/20">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Filtrar carrera o código..."
                  value={searchCareer}
                  onChange={(e) => {
                    setSearchCareer(e.target.value)
                    setPageCareer(1)
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-200/80 rounded-lg placeholder-neutral-400 text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            {/* Listado Paginado */}
            <div className="divide-y divide-neutral-100 min-h-[290px] flex flex-col justify-between">
              <div>
                {paginatedCareers.length > 0 ? (
                  paginatedCareers.map((c) => (
                    <Link
                      key={c.id}
                      href={`/admin/academic/${c.id}/pensum`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50/80 transition-colors group"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-neutral-900 truncate group-hover:text-neutral-950">
                          {c.name}
                        </p>
                        <p className="text-[11px] text-neutral-400 font-mono mt-0.5">{c.code}</p>
                      </div>
                      <span className="text-xs font-mono font-semibold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded-md shrink-0">
                        {c.studentCount} · {c.subjectCount}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-12 text-xs text-neutral-400 italic text-center">
                    No se encontraron carreras
                  </p>
                )}
              </div>

              {/* Controles de Paginación */}
              <div className="p-2.5 border-t border-neutral-100 bg-neutral-50/40 flex items-center justify-between mt-auto">
                <span className="text-[11px] font-mono text-neutral-500">
                  Pág. {pageCareer} de {totalCareerPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPageCareer((p) => Math.max(1, p - 1))}
                    disabled={pageCareer <= 1}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-neutral-200/60 transition-colors cursor-pointer"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageCareer((p) => Math.min(totalCareerPages, p + 1))}
                    disabled={pageCareer >= totalCareerPages}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-neutral-200/60 transition-colors cursor-pointer"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
