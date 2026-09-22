import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import PaginatedConsolidatedBoard from '@/components/admin/PaginatedConsolidatedBoard'
import GlobalAbsencePolicyModal from '@/components/admin/GlobalAbsencePolicyModal'
import { computeAttendanceSummary } from '@/lib/utils/attendancePolicy'
import {
  Layers,
  ShieldCheck,
  UserCheck,
  Users,
  BookMarked,
  Activity,
  ArrowUpRight,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Sliders,
} from 'lucide-react'

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

  // Conteos generales (solo activos) + Asistencias y Sesiones
  const [
    { count: totalAdmins },
    { count: totalProfessors },
    { count: totalStudents },
    { count: totalSubjects },
    { count: totalCareers },
    { count: totalAttendances },
    { count: totalSessions },
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
    supabase.from('careers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('attendances').select('*', { count: 'exact', head: true }),
    supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])

  // Desglose por carrera
  const { data: careers } = await supabase
    .from('careers')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  const { data: studentCareerLinks } = await supabase
    .from('student_careers')
    .select('student_id, career_id')
    .eq('is_active', true)

  const { data: subjectCareerLinks } = await supabase
    .from('subject_careers')
    .select('subject_id, career_id')
    .eq('is_active', true)

  const careerStats = (careers || [])
    .map((c) => ({
      ...c,
      studentCount: new Set(
        (studentCareerLinks || []).filter((sc) => sc.career_id === c.id).map((sc) => sc.student_id)
      ).size,
      subjectCount: (subjectCareerLinks || []).filter((sc) => sc.career_id === c.id).length,
    }))
    .sort((a, b) => b.studentCount - a.studentCount)

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

  // Docentes activos con materias
  const { data: professors } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'PROFESSOR')
    .eq('is_active', true)

  // Materias con inscripciones, reglas y docentes
  const { data: allSubjects } = await supabase
    .from('subjects')
    .select(
      'id, name, code, professor_id, absence_rule_type, max_absence_percentage, max_absence_count, total_planned_sessions, late_after_minutes, lates_per_absence, enrollments(student_id)'
    )
    .eq('is_active', true)
    .order('name')

  const professorStats = (professors || [])
    .map((p) => ({
      ...p,
      subjectCount: (allSubjects || []).filter((s) => s.professor_id === p.id).length,
    }))
    .sort((a, b) => b.subjectCount - a.subjectCount)

  // Materias con cantidad de inscritos
  const subjectStats = (allSubjects || [])
    .map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      studentCount: (s.enrollments as { student_id: string }[] | null)?.length || 0,
      absenceRuleType: s.absence_rule_type,
      maxAbsencePercentage: s.max_absence_percentage,
    }))
    .sort((a, b) => b.studentCount - a.studentCount)

  // Estudiantes con conteo de materias inscritas
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

  // ==================== CÁLCULO DE KPIS DE ASISTENCIA ====================
  // Sesiones activas con sus materias
  const { data: allActiveSessions } = await supabase
    .from('sessions')
    .select('id, subject_id')
    .eq('is_active', true)

  // Registro de asistencias para cálculo de alumnos en riesgo
  const { data: allAttendanceRecords } = await supabase
    .from('attendances')
    .select('student_id, session_id, status, session:sessions(subject_id)')

  // Mapeamos sesiones dictadas por materia
  const sessionsCountBySubject = new Map<string, number>()
  for (const sess of allActiveSessions || []) {
    sessionsCountBySubject.set(
      sess.subject_id,
      (sessionsCountBySubject.get(sess.subject_id) || 0) + 1
    )
  }

  // Mapeamos asistencias (y tardanzas) de cada alumno por materia:
  // key = `${studentId}_${subjectId}`
  const studentSubjectAttendances = new Map<string, number>()
  const studentSubjectLateCounts = new Map<string, number>()
  for (const att of allAttendanceRecords || []) {
    const subjId = (att.session as { subject_id?: string } | null)?.subject_id
    if (subjId && att.student_id) {
      const key = `${att.student_id}_${subjId}`
      studentSubjectAttendances.set(key, (studentSubjectAttendances.get(key) || 0) + 1)
      if (att.status === 'LATE') {
        studentSubjectLateCounts.set(key, (studentSubjectLateCounts.get(key) || 0) + 1)
      }
    }
  }

  // Tasa de presentismo: asistencias efectivas / asistencias esperadas
  let totalExpectedAttendances = 0
  for (const s of allSubjects || []) {
    const enrolled = (s.enrollments as { student_id: string }[] | null)?.length || 0
    const sessionsHeld = sessionsCountBySubject.get(s.id) || 0
    totalExpectedAttendances += enrolled * sessionsHeld
  }

  const attendanceRate =
    totalExpectedAttendances > 0
      ? Math.min(100, Math.round(((totalAttendances ?? 0) / totalExpectedAttendances) * 1000) / 10)
      : (totalAttendances ?? 0) > 0
        ? 100
        : 0

  // Conteo de alumnos en riesgo institucional (WARNING o FAILED_ATTENDANCE)
  const atRiskStudentIds = new Set<string>()
  for (const s of allSubjects || []) {
    const sessionsHeld = sessionsCountBySubject.get(s.id) || 0
    if (sessionsHeld === 0) continue

    const enrolled = (s.enrollments as { student_id: string }[] | null) || []
    for (const e of enrolled) {
      const key = `${e.student_id}_${s.id}`
      const studentAtt = studentSubjectAttendances.get(key) || 0
      const studentLateCount = studentSubjectLateCounts.get(key) || 0
      const summary = computeAttendanceSummary(
        sessionsHeld,
        studentAtt,
        {
          ruleType: s.absence_rule_type as 'PERCENTAGE' | 'FIXED_COUNT',
          maxPercentage: s.max_absence_percentage,
          maxCount: s.max_absence_count,
          totalPlannedSessions: s.total_planned_sessions,
          latesPerAbsence: s.lates_per_absence,
        },
        studentLateCount
      )

      if (summary.status === 'WARNING' || summary.status === 'FAILED_ATTENDANCE') {
        atRiskStudentIds.add(e.student_id)
      }
    }
  }
  const studentsAtRiskCount = atRiskStudentIds.size

  // Valores de política activa institucional
  const sampleSubject = allSubjects?.[0]
  const defaultRuleType =
    (sampleSubject?.absence_rule_type as 'PERCENTAGE' | 'FIXED_COUNT') || 'PERCENTAGE'
  const defaultPercentage = sampleSubject?.max_absence_percentage ?? 20
  const defaultCount = sampleSubject?.max_absence_count ?? 4
  const defaultPlanned = sampleSubject?.total_planned_sessions ?? 16
  const defaultLateAfterMinutes = sampleSubject?.late_after_minutes ?? 15
  const defaultLatesPerAbsence = sampleSubject?.lates_per_absence ?? null

  const policyDisplayValue =
    defaultRuleType === 'FIXED_COUNT' ? `Máx ${defaultCount} fallas` : `Máx ${defaultPercentage}%`
  const policyDisplaySub = `${defaultPlanned} sesiones planificadas`

  // Tarjetas de entidades académicas
  const entityCards = [
    {
      label: 'Carreras',
      value: totalCareers ?? 0,
      icon: Layers,
      href: '/admin/academic',
    },
    {
      label: 'Administradores',
      value: totalAdmins ?? 0,
      icon: ShieldCheck,
      href: '/admin/users?role=ADMIN',
    },
    {
      label: 'Docentes',
      value: totalProfessors ?? 0,
      icon: UserCheck,
      href: '/admin/users?role=PROFESSOR',
    },
    {
      label: 'Estudiantes',
      value: totalStudents ?? 0,
      icon: Users,
      href: '/admin/users?role=STUDENT',
    },
    {
      label: 'Materias',
      value: totalSubjects ?? 0,
      icon: BookMarked,
      href: '/admin/subjects',
    },
    {
      label: 'Sesiones hoy',
      value: sessionsToday ?? 0,
      icon: Activity,
      href: null,
    },
  ]

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-7">
          <AdminHeader
            eyebrow="Institucional"
            title="Panel de Control"
            description="Supervisión global de presentismo, políticas académicas y consolidados"
            activeHref="/admin/dashboard"
          />

          {/* ==================== BLOQUE 1: KPIS DE ASISTENCIA Y POLÍTICA ==================== */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Métricas de Asistencia y Política Institucional
              </h2>
              <GlobalAbsencePolicyModal
                initialRuleType={defaultRuleType}
                initialPercentage={defaultPercentage}
                initialCount={defaultCount}
                initialPlannedSessions={defaultPlanned}
                initialLateAfterMinutes={defaultLateAfterMinutes}
                initialLatesPerAbsence={defaultLatesPerAbsence}
                totalSubjectsCount={totalSubjects ?? 0}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Presentismo Global */}
              <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Presentismo Global
                  </span>
                  <Percent className="w-4 h-4 text-neutral-400 stroke-[1.75]" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-bold font-mono text-neutral-900 tracking-tight">
                    {attendanceRate}%
                  </span>
                  <span className="text-xs font-mono text-neutral-500">
                    {totalExpectedAttendances > 0 ? 'Institucional' : 'Sin sesiones'}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-neutral-400 font-mono">
                  {totalAttendances ?? 0} marcas registradas
                </div>
              </div>

              {/* Total Asistencias */}
              <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Total Asistencias
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-neutral-400 stroke-[1.75]" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-bold font-mono text-neutral-900 tracking-tight">
                    {totalAttendances ?? 0}
                  </span>
                  <span className="text-xs font-mono text-neutral-500">
                    {totalSessions ?? 0} clases
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-neutral-400 font-mono">
                  En {totalSubjects ?? 0} materias activas
                </div>
              </div>

              {/* Alumnos en Riesgo */}
              <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Alumnos en Riesgo
                  </span>
                  <AlertTriangle
                    className={`w-4 h-4 stroke-[1.75] ${
                      studentsAtRiskCount > 0 ? 'text-amber-500' : 'text-neutral-400'
                    }`}
                  />
                </div>
                <div className="flex items-baseline justify-between">
                  <span
                    className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${
                      studentsAtRiskCount > 0 ? 'text-amber-600' : 'text-neutral-900'
                    }`}
                  >
                    {studentsAtRiskCount}
                  </span>
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded-md ${
                      studentsAtRiskCount > 0
                        ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {studentsAtRiskCount > 0 ? 'Atención' : 'Normal'}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-neutral-400 font-mono">
                  Alerta o pérdida por inasistencias
                </div>
              </div>

              {/* Política Institucional */}
              <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                      Política Activa
                    </span>
                    <Sliders className="w-4 h-4 text-neutral-400 stroke-[1.75]" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl sm:text-2xl font-bold font-mono text-neutral-900 tracking-tight">
                      {policyDisplayValue}
                    </span>
                    <span className="text-xs font-mono text-neutral-500">
                      {defaultRuleType === 'FIXED_COUNT' ? 'Fija' : 'Porcentual'}
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-neutral-400 font-mono">
                  {policyDisplaySub}
                </div>
              </div>
            </div>
          </div>

          {/* ==================== BLOQUE 2: ENTIDADES ACADÉMICAS ==================== */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
              Estructura Institucional
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              {entityCards.map((card) => {
                const content = (
                  <div className="flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                        {card.label}
                      </span>
                      <card.icon className="w-4 h-4 text-neutral-400 stroke-[1.75]" />
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl sm:text-3xl font-bold font-mono text-neutral-900 tracking-tight">
                        {card.value}
                      </span>
                      {card.href && (
                        <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 transition-colors" />
                      )}
                    </div>
                  </div>
                )

                const cardClasses =
                  'bg-white rounded-xl border border-neutral-200/80 p-4 shadow-2xs hover:border-neutral-300 transition-all group'

                return card.href ? (
                  <Link key={card.label} href={card.href} className={cardClasses}>
                    {content}
                  </Link>
                ) : (
                  <div key={card.label} className={cardClasses}>
                    {content}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ==================== BLOQUE 3: TABLERO CONSOLIDADO PAGINADO CON SLIDE ==================== */}
          <div>
            <div className="mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Consolidados Académicos en Vivo
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Navegación paginada y filtrado reactivo para 95 materias y cientos de estudiantes
              </p>
            </div>

            <PaginatedConsolidatedBoard
              careers={careerStats}
              professors={professorStats}
              subjects={subjectStats}
              students={studentStats}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
