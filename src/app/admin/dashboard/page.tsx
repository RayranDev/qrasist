import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import AdminHeader from '@/components/admin/AdminHeader'
import { Crown, Presentation, GraduationCap, BookOpen, CalendarDays } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'ADMIN') redirect('/login')

  // Conteos generales (solo activos)
  const [
    { count: totalAdmins },
    { count: totalProfessors },
    { count: totalStudents },
    { count: totalSubjects },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'ADMIN')
      .eq('is_active', true),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'PROFESSOR')
      .eq('is_active', true),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'STUDENT')
      .eq('is_active', true),
    supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])

  // Sesiones activas del día
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const { count: sessionsToday } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .gte('date', todayStart.toISOString())
    .lte('date', todayEnd.toISOString())

  // Docentes activos con materias activas asignadas
  const { data: professors } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'PROFESSOR')
    .eq('is_active', true)

  const { data: allSubjects } = await supabase
    .from('subjects')
    .select('id, name, code, professor_id')
    .eq('is_active', true)

  const professorStats = (professors || [])
    .map((p) => ({
      ...p,
      subjectCount: (allSubjects || []).filter((s) => s.professor_id === p.id).length,
    }))
    .sort((a, b) => b.subjectCount - a.subjectCount)

  // Materias activas con cantidad de estudiantes activos inscritos
  const { data: subjectsWithEnrollments } = await supabase
    .from('subjects')
    .select('id, name, code, enrollments(student_id)')
    .eq('is_active', true)
    .order('name')

  const subjectStats = (subjectsWithEnrollments || [])
    .map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      studentCount: (s.enrollments as { student_id: string }[] | null)?.length || 0,
    }))
    .sort((a, b) => b.studentCount - a.studentCount)

  // Estudiantes activos con cantidad de materias activas
  const { data: students } = await supabase
    .from('profiles')
    .select('id, name, student_code')
    .eq('role', 'STUDENT')
    .eq('is_active', true)
    .order('name')

  const { data: allEnrollments } = await supabase
    .from('enrollments')
    .select('student_id, subject_id')

  const studentStats = (students || [])
    .map((s) => ({
      ...s,
      subjectCount: (allEnrollments || []).filter((e) => e.student_id === s.id).length,
    }))
    .sort((a, b) => b.subjectCount - a.subjectCount)

  const statCards = [
    {
      label: 'Administradores',
      value: totalAdmins ?? 0,
      color: 'bg-purple-50 text-purple-700',
      icon: Crown,
      href: '/admin/users?role=ADMIN',
    },
    {
      label: 'Docentes',
      value: totalProfessors ?? 0,
      color: 'bg-amber-50 text-amber-700',
      icon: Presentation,
      href: '/admin/users?role=PROFESSOR',
    },
    {
      label: 'Estudiantes',
      value: totalStudents ?? 0,
      color: 'bg-emerald-50 text-emerald-700',
      icon: GraduationCap,
      href: '/admin/users?role=STUDENT',
    },
    {
      label: 'Materias',
      value: totalSubjects ?? 0,
      color: 'bg-sky-50 text-sky-700',
      icon: BookOpen,
      href: '/admin/subjects',
    },
    {
      label: 'Clases hoy',
      value: sessionsToday ?? 0,
      color: 'bg-rose-50 text-rose-700',
      icon: CalendarDays,
      href: null,
    },
  ]

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <AdminHeader
            eyebrow="Panel de Administración"
            title="Dashboard"
            description="Resumen académico en tiempo real"
            activeHref="/admin/dashboard"
          />

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {statCards.map((card) => {
              const content = (
                <>
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}
                  >
                    <card.icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <p className="text-3xl font-black text-gray-900">{card.value}</p>
                  <p className="text-xs font-bold text-gray-500 self-start">{card.label}</p>
                </>
              )
              const className =
                'bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2'
              return card.href ? (
                <Link
                  key={card.label}
                  href={card.href}
                  className={`${className} transition hover:border-gray-200 hover:shadow-md`}
                >
                  {content}
                </Link>
              ) : (
                <div key={card.label} className={className}>
                  {content}
                </div>
              )
            })}
          </div>

          {/* Consolidados */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Docentes por materias */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <h2 className="font-black text-gray-900">Docentes</h2>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                  Materias asignadas
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {professorStats.length > 0 ? (
                  professorStats.map((p) => (
                    <Link
                      key={p.id}
                      href="/admin/users?role=PROFESSOR"
                      className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 text-xs font-black flex items-center justify-center shrink-0">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-gray-800 truncate max-w-35">
                          {p.name}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-black min-w-8 text-center ${p.subjectCount > 0 ? 'text-amber-700' : 'text-gray-400'}`}
                      >
                        {p.subjectCount}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-6 py-6 text-sm text-gray-400 italic text-center">
                    Sin docentes registrados
                  </p>
                )}
              </div>
            </div>

            {/* Materias por estudiantes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <h2 className="font-black text-gray-900">Materias</h2>
                <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-1 rounded-lg">
                  Estudiantes inscritos
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {subjectStats.length > 0 ? (
                  subjectStats.map((s) => (
                    <Link
                      key={s.id}
                      href={`/admin/subjects/${s.id}/enrollments`}
                      className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                          <BookOpen className="w-4 h-4" strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{s.code}</p>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-black min-w-8 text-center ml-2 ${s.studentCount > 0 ? 'text-sky-700' : 'text-gray-400'}`}
                      >
                        {s.studentCount}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-6 py-6 text-sm text-gray-400 italic text-center">
                    Sin materias registradas
                  </p>
                )}
              </div>
            </div>

            {/* Estudiantes por materias */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <h2 className="font-black text-gray-900">Estudiantes</h2>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                  Materias inscritas
                </span>
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {studentStats.length > 0 ? (
                  studentStats.map((s) => (
                    <Link
                      key={s.id}
                      href="/admin/users?role=STUDENT"
                      className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black flex items-center justify-center shrink-0">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{s.student_code || '—'}</p>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-black min-w-8 text-center ml-2 ${s.subjectCount > 0 ? 'text-emerald-700' : 'text-gray-400'}`}
                      >
                        {s.subjectCount}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-6 py-6 text-sm text-gray-400 italic text-center">
                    Sin estudiantes registrados
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
