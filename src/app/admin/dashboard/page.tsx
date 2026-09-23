import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import PaginatedConsolidatedBoard from '@/components/admin/PaginatedConsolidatedBoard'
import GlobalAbsencePolicyModal from '@/components/admin/GlobalAbsencePolicyModal'
import PeriodReportExport from '@/components/admin/PeriodReportExport'
import AttentionArea from '@/components/admin/dashboard/AttentionArea'
import AttendanceSummary from '@/components/admin/dashboard/AttendanceSummary'
import OnboardingChecklist from '@/components/admin/dashboard/OnboardingChecklist'
import { computeAttendanceSummary } from '@/lib/utils/attendancePolicy'
import {
  buildAttentionItems,
  computeOnboardingSteps,
  isOnboardingComplete,
} from '@/lib/admin/dashboardAttention'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
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
    { count: totalProfessors },
    { count: totalStudents },
    { count: totalSubjects },
    { count: totalCareers },
    { count: totalAttendances },
    { count: totalSessions },
    { count: periodsActiveCount },
    { count: pendingJustificationsTotal },
  ] = await Promise.all([
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
    supabase.from('periods').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('absence_justifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING'),
  ])

  // Desglose por carrera
  const { data: careers } = await supabase
    .from('careers')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  const { data: periods } = await supabase
    .from('periods')
    .select('id, name')
    .order('name', { ascending: false })

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

  // Solicitudes de inscripción pendientes (institución completa) --
  // se agrupan por materia para poder llevar al admin directo a la
  // que más solicitudes acumula.
  const { data: pendingRequests } = await supabase
    .from('enrollment_requests')
    .select('subject_id')
    .eq('status', 'pending')

  const pendingRequestsBySubject = new Map<string, number>()
  for (const r of pendingRequests || []) {
    pendingRequestsBySubject.set(
      r.subject_id,
      (pendingRequestsBySubject.get(r.subject_id) || 0) + 1
    )
  }
  let topRequestSubjectId: string | null = null
  let topRequestCount = 0
  for (const [subjectId, count] of pendingRequestsBySubject) {
    if (count > topRequestCount) {
      topRequestCount = count
      topRequestSubjectId = subjectId
    }
  }
  const pendingEnrollmentRequestsTotal = pendingRequests?.length ?? 0

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
      'id, name, code, professor_id, period_id, absence_rule_type, max_absence_percentage, max_absence_count, total_planned_sessions, late_after_minutes, lates_per_absence, enrollments(student_id)'
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

  // Materias asignadas a la vez a un período y a una carrera -- paso
  // de onboarding "Crear materias", ver dashboardAttention.ts
  const assignedSubjectsCount = (allSubjects || []).filter(
    (s) => !!s.period_id && (subjectCareerLinks || []).some((l) => l.subject_id === s.id)
  ).length

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

  // Justificaciones aprobadas: descuentan la falta en computeAttendanceSummary
  const { data: allApprovedJustifications } = await supabase
    .from('absence_justifications')
    .select('student_id, subject_id')
    .eq('status', 'APPROVED')

  const studentSubjectJustifiedCounts = new Map<string, number>()
  for (const j of allApprovedJustifications || []) {
    const key = `${j.student_id}_${j.subject_id}`
    studentSubjectJustifiedCounts.set(key, (studentSubjectJustifiedCounts.get(key) || 0) + 1)
  }

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
      const studentJustifiedCount = studentSubjectJustifiedCounts.get(key) || 0
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
        studentLateCount,
        studentJustifiedCount
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

  // ==================== BLOQUE "HOY": QUÉ NECESITA ACCIÓN ====================
  const attentionItems = buildAttentionItems(
    {
      pendingEnrollmentRequests: pendingEnrollmentRequestsTotal,
      pendingJustifications: pendingJustificationsTotal ?? 0,
      atRiskStudents: studentsAtRiskCount,
      activeSessionsNow: totalSessions ?? 0,
    },
    {
      enrollmentRequestsHref: topRequestSubjectId
        ? `/professor/subjects/${topRequestSubjectId}/requests`
        : null,
      justificationsHref: '/professor/justifications',
      atRiskStudentsHref: '/admin/dashboard?tab=students#consolidado',
      activeSessionsHref: '/admin/dashboard#consolidado',
    }
  )

  // ==================== PRIMEROS PASOS (ONBOARDING) ====================
  const onboardingSteps = computeOnboardingSteps({
    hasActivePeriod: (periodsActiveCount ?? 0) > 0,
    careersCount: totalCareers ?? 0,
    assignedSubjectsCount,
    professorsCount: totalProfessors ?? 0,
    studentsCount: totalStudents ?? 0,
    enrollmentsCount: allEnrollments?.length ?? 0,
  })
  const showOnboarding = !isOnboardingComplete(onboardingSteps)

  const consolidatedInitialTab =
    params.tab === 'students' ||
    params.tab === 'subjects' ||
    params.tab === 'careers' ||
    params.tab === 'professors'
      ? params.tab
      : 'all'

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

          <AttentionArea items={attentionItems} />

          <AttendanceSummary
            attendanceRate={attendanceRate}
            totalAttendances={totalAttendances ?? 0}
            totalSessions={totalSessions ?? 0}
            hasExpectedAttendances={totalExpectedAttendances > 0 || (totalAttendances ?? 0) > 0}
          />

          {showOnboarding && <OnboardingChecklist steps={onboardingSteps} />}

          {/* ==================== HERRAMIENTAS INSTITUCIONALES ==================== */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap">
            <GlobalAbsencePolicyModal
              initialRuleType={defaultRuleType}
              initialPercentage={defaultPercentage}
              initialCount={defaultCount}
              initialPlannedSessions={defaultPlanned}
              initialLateAfterMinutes={defaultLateAfterMinutes}
              initialLatesPerAbsence={defaultLatesPerAbsence}
              totalSubjectsCount={totalSubjects ?? 0}
            />
            {periods && periods.length > 0 && <PeriodReportExport periods={periods} />}
          </div>

          {/* ==================== TABLERO CONSOLIDADO PAGINADO CON SLIDE ==================== */}
          <div id="consolidado">
            <div className="mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Consolidados Académicos en Vivo
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Navegación paginada y filtrado reactivo para {totalSubjects ?? 0} materias y cientos
                de estudiantes
              </p>
            </div>

            <PaginatedConsolidatedBoard
              careers={careerStats}
              professors={professorStats}
              subjects={subjectStats}
              students={studentStats}
              initialTab={consolidatedInitialTab}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
