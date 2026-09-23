import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SessionButton from './SessionButton'
import Link from 'next/link'
import ProfileModal from './ProfileModal'
import EnrollmentCodeSection from './EnrollmentCodeSection'
import { Users, BookOpen, AlertTriangle } from 'lucide-react'
import InstitutionMark from '@/components/brand/InstitutionMark'
import { computeAttendanceSummary } from '@/lib/utils/attendancePolicy'

export default async function ProfessorSubjectsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()

  const { data: subjects } = await supabase
    .from('subjects')
    .select(
      '*, enrollments(student_id), enrollment_requests(id, status), absence_justifications(student_id, status)'
    )
    .eq('professor_id', user.id)
    .eq('is_active', true)

  const firstName = profile?.first_name || 'Profe'
  const pendingJustificationsTotal = (subjects || []).reduce(
    (total, sub) =>
      total +
      ((sub.absence_justifications as { student_id: string; status: string }[] | null)?.filter(
        (j) => j.status === 'PENDING'
      ).length ?? 0),
    0
  )

  // ==================== CONTEO DE ESTUDIANTES EN RIESGO POR MATERIA ====================
  // Dos consultas más (sesiones + asistencias), sin importar cuántos
  // estudiantes tenga cada materia -- se evita a propósito una consulta
  // por estudiante, que no escalaría con materias grandes.
  const subjectIds = (subjects || []).map((s) => s.id)

  const { data: activeSessions } =
    subjectIds.length > 0
      ? await supabase
          .from('sessions')
          .select('id, subject_id')
          .eq('is_active', true)
          .in('subject_id', subjectIds)
      : { data: [] as { id: string; subject_id: string }[] }

  const sessionsHeldBySubject = new Map<string, number>()
  const subjectIdBySessionId = new Map<string, string>()
  for (const s of activeSessions || []) {
    sessionsHeldBySubject.set(s.subject_id, (sessionsHeldBySubject.get(s.subject_id) || 0) + 1)
    subjectIdBySessionId.set(s.id, s.subject_id)
  }

  const sessionIds = (activeSessions || []).map((s) => s.id)
  const { data: attendanceRecords } =
    sessionIds.length > 0
      ? await supabase
          .from('attendances')
          .select('student_id, status, session_id')
          .in('session_id', sessionIds)
      : { data: [] as { student_id: string; status: string; session_id: string }[] }

  // key = `${studentId}_${subjectId}`
  const studentSubjectAttendances = new Map<string, number>()
  const studentSubjectLateCounts = new Map<string, number>()
  for (const att of attendanceRecords || []) {
    const subjectId = subjectIdBySessionId.get(att.session_id)
    if (!subjectId) continue
    const key = `${att.student_id}_${subjectId}`
    studentSubjectAttendances.set(key, (studentSubjectAttendances.get(key) || 0) + 1)
    if (att.status === 'LATE') {
      studentSubjectLateCounts.set(key, (studentSubjectLateCounts.get(key) || 0) + 1)
    }
  }

  const studentSubjectJustifiedCounts = new Map<string, number>()
  for (const sub of subjects || []) {
    const justs =
      (sub.absence_justifications as { student_id: string; status: string }[] | null) || []
    for (const j of justs) {
      if (j.status !== 'APPROVED') continue
      const key = `${j.student_id}_${sub.id}`
      studentSubjectJustifiedCounts.set(key, (studentSubjectJustifiedCounts.get(key) || 0) + 1)
    }
  }

  const atRiskCountBySubject = new Map<string, number>()
  for (const sub of subjects || []) {
    const sessionsHeld = sessionsHeldBySubject.get(sub.id) || 0
    if (sessionsHeld === 0) continue

    const enrolled = (sub.enrollments as { student_id: string }[] | null) || []
    let count = 0
    for (const e of enrolled) {
      const key = `${e.student_id}_${sub.id}`
      const summary = computeAttendanceSummary(
        sessionsHeld,
        studentSubjectAttendances.get(key) || 0,
        {
          ruleType: sub.absence_rule_type,
          maxPercentage: sub.max_absence_percentage,
          maxCount: sub.max_absence_count,
          totalPlannedSessions: sub.total_planned_sessions,
          latesPerAbsence: sub.lates_per_absence,
        },
        studentSubjectLateCounts.get(key) || 0,
        studentSubjectJustifiedCounts.get(key) || 0
      )
      if (summary.status === 'WARNING' || summary.status === 'FAILED_ATTENDANCE') count++
    }
    atRiskCountBySubject.set(sub.id, count)
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="mb-8 pb-6 border-b border-gray-100 border-t-4 border-t-brand-700 -mt-4 pt-4 md:-mt-8 md:pt-6 flex flex-col gap-4">
            <InstitutionMark size="sm" />
            <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
              <div>
                <p className="text-sm font-semibold text-navy-700 mb-0.5">Portal Docente</p>
                <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                  Hola, {firstName}
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  {subjects?.length === 1
                    ? '1 materia asignada'
                    : `${subjects?.length ?? 0} materias asignadas`}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <ProfileModal
                  currentFirstName={profile?.first_name || ''}
                  currentLastName={profile?.last_name || ''}
                />
                <Link
                  href="/professor/justifications"
                  className="relative px-4 py-2 text-sm font-bold text-navy-700 bg-navy-50 rounded-xl hover:bg-navy-100 transition"
                >
                  Justificaciones
                  {pendingJustificationsTotal > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-600 rounded-full">
                      {pendingJustificationsTotal}
                    </span>
                  )}
                </Link>
                <Link
                  href="/professor/history"
                  className="px-4 py-2 text-sm font-bold text-navy-700 bg-navy-50 rounded-xl hover:bg-navy-100 transition"
                >
                  Historial
                </Link>
                <form action="/auth/signout" method="post">
                  <button className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
                    Cerrar Sesión
                  </button>
                </form>
              </div>
            </div>
          </header>

          {subjects && subjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {subjects.map((sub) => {
                const studentCount =
                  (sub.enrollments as { student_id: string }[] | null)?.length ?? 0
                const pendingCount =
                  (sub.enrollment_requests as { id: string; status: string }[] | null)?.filter(
                    (r) => r.status === 'pending'
                  ).length ?? 0
                const pendingJustificationsCount =
                  (
                    sub.absence_justifications as { student_id: string; status: string }[] | null
                  )?.filter((j) => j.status === 'PENDING').length ?? 0
                const atRiskCount = atRiskCountBySubject.get(sub.id) || 0
                return (
                  <div
                    key={sub.id}
                    className="bg-white p-6 border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col gap-4"
                  >
                    <div>
                      <span className="px-3 py-1 bg-navy-50 text-navy-700 text-xs font-bold rounded-lg mb-3 inline-block">
                        {sub.code}
                      </span>
                      <h3 className="text-xl font-bold text-gray-900">{sub.name}</h3>
                      <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
                        <Users className="w-4 h-4" strokeWidth={2} />
                        <span className="font-semibold text-gray-600">{studentCount}</span>{' '}
                        estudiante{studentCount !== 1 ? 's' : ''} inscritos
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {pendingJustificationsCount > 0 && (
                          <Link
                            href="/professor/justifications"
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg hover:bg-amber-100 transition"
                          >
                            {pendingJustificationsCount} justificación
                            {pendingJustificationsCount > 1 ? 'es' : ''} pendiente
                            {pendingJustificationsCount > 1 ? 's' : ''}
                          </Link>
                        )}
                        {atRiskCount > 0 && (
                          <Link
                            href={`/professor/history?subjectId=${sub.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-1 rounded-lg hover:bg-red-100 transition"
                          >
                            <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                            {atRiskCount} en riesgo
                          </Link>
                        )}
                      </div>
                    </div>
                    <EnrollmentCodeSection
                      subjectId={sub.id}
                      code={sub.enrollment_code}
                      pendingCount={pendingCount}
                    />
                    <SessionButton subjectId={sub.id} />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-6 h-6" strokeWidth={2} />
              </div>
              <p className="text-gray-500 font-medium">Aún no tienes materias asignadas.</p>
              <p className="text-sm text-gray-400 mt-1">
                Contacta al administrador para que te asigne materias.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
