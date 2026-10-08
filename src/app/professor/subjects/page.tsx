import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SessionButton from './SessionButton'
import Link from 'next/link'
import ProfileModal from './ProfileModal'
import EnrollmentCodeSection from './EnrollmentCodeSection'
import { Users, BookOpen, AlertTriangle, Ban } from 'lucide-react'
import SuspendClassButton from '@/components/attendance/SuspendClassButton'
import ClassOmissionsPanel from './ClassOmissionsPanel'
import { fetchClassOmissions } from '@/lib/attendance/classOmissionsData'
import { canProfessorEditSession } from '@/lib/sessions/classWindow'
import { getBogotaDayRange } from '@/lib/utils/bogotaDay'
import { bogotaCalendarDate } from '@/lib/utils/businessDays'
import { dayOfWeekOf } from '@/lib/sessions/suspension'
import InstitutionMark from '@/components/brand/InstitutionMark'
import { computeAttendanceSummary } from '@/lib/utils/attendancePolicy'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getAppSettings } from '@/lib/settings/appSettings'

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
      '*, enrollments(student_id), enrollment_requests(id, status), absence_justifications(student_id, status), subject_schedules(day_of_week, modality)'
    )
    .eq('professor_id', user.id)
    .eq('is_active', true)

  const { registrationWindowMinutes, defaultClassMinutes } = await getAppSettings(supabase)

  const firstName = profile?.first_name || 'Profe'

  // ==================== CONTEO DE ESTUDIANTES EN RIESGO POR MATERIA ====================
  // Dos consultas más (sesiones + asistencias), sin importar cuántos
  // estudiantes tenga cada materia -- se evita a propósito una consulta
  // por estudiante, que no escalaría con materias grandes.
  const subjectIds = (subjects || []).map((s) => s.id)

  // PostgREST trunca a 1000 filas por defecto sin avisar -- con varias
  // materias grandes, sesiones o asistencias pueden superar eso, así
  // que se pagina con fetchAllRows en vez de confiar en una sola página.
  const { data: activeSessions } =
    subjectIds.length > 0
      ? await fetchAllRows<{ id: string; subject_id: string }>((from, to) =>
          supabase
            .from('sessions')
            .select('id, subject_id')
            .eq('is_active', true)
            .in('subject_id', subjectIds)
            .range(from, to)
        )
      : { data: [] as { id: string; subject_id: string }[] }

  // Clase de hoy por materia (hora de Bogotá): alimenta la acción
  // "Suspender clase" (RF20) y bloquea iniciar asistencia si ya se suspendió.
  const now = new Date()
  const { start: todayStart, end: todayEnd } = getBogotaDayRange(now)
  const todayDayOfWeek = dayOfWeekOf(bogotaCalendarDate(now))
  const { data: todaySessionRows } =
    subjectIds.length > 0
      ? await supabase
          .from('sessions')
          .select('id, subject_id, date, class_ends_at, is_active, suspended_at, suspension_reason')
          .in('subject_id', subjectIds)
          .gte('date', todayStart.toISOString())
          .lte('date', todayEnd.toISOString())
      : { data: [] }
  const todaySessionsBySubject = new Map<string, NonNullable<typeof todaySessionRows>>()
  for (const row of todaySessionRows || []) {
    todaySessionsBySubject.set(row.subject_id, [
      ...(todaySessionsBySubject.get(row.subject_id) || []),
      row,
    ])
  }

  // RF22: clases del horario sin ninguna sesión (justificadas o no), por
  // materia. Vacío si la materia no tiene período con fechas ni horario.
  const omissionItems = await fetchClassOmissions(supabase, { subjectIds, now })
  const omissionsBySubject = new Map<string, typeof omissionItems>()
  for (const item of omissionItems) {
    omissionsBySubject.set(item.subjectId, [
      ...(omissionsBySubject.get(item.subjectId) || []),
      item,
    ])
  }

  const sessionsHeldBySubject = new Map<string, number>()
  const subjectIdBySessionId = new Map<string, string>()
  for (const s of activeSessions) {
    sessionsHeldBySubject.set(s.subject_id, (sessionsHeldBySubject.get(s.subject_id) || 0) + 1)
    subjectIdBySessionId.set(s.id, s.subject_id)
  }

  const sessionIds = activeSessions.map((s) => s.id)
  const { data: attendanceRecords } =
    sessionIds.length > 0
      ? await fetchAllRows<{ student_id: string; status: string; session_id: string }>((from, to) =>
          supabase
            .from('attendances')
            .select('student_id, status, session_id')
            .in('session_id', sessionIds)
            .range(from, to)
        )
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
                  className="px-4 py-2 text-sm font-bold text-navy-700 bg-navy-50 rounded-xl hover:bg-navy-100 transition"
                >
                  Justificaciones
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

                const todaySessions = todaySessionsBySubject.get(sub.id) || []
                const suspendedToday = todaySessions.find((t) => t.suspended_at)
                const heldToday = todaySessions.find(
                  (t) => !t.suspended_at && t.is_active !== false
                )
                const hasBlockToday = (
                  (sub.subject_schedules as { day_of_week: number }[] | null) || []
                ).some((b) => b.day_of_week === todayDayOfWeek)
                // Con sesión de hoy: solo mientras la clase sigue en curso.
                // Sin sesión: solo si el horario marca hoy como día de clase.
                const canSuspendToday = suspendedToday
                  ? false
                  : heldToday
                    ? canProfessorEditSession(heldToday, defaultClassMinutes, now)
                    : hasBlockToday
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
                            className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg hover:bg-gray-100 transition"
                          >
                            {pendingJustificationsCount} justificación
                            {pendingJustificationsCount > 1 ? 'es' : ''} en revisión por
                            coordinación
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
                    <ClassOmissionsPanel
                      subjectId={sub.id}
                      omissions={(omissionsBySubject.get(sub.id) || []).map((o) => ({
                        date: o.date,
                        startTime: o.startTime,
                        endTime: o.endTime,
                        justified: o.justified,
                        reason: o.reason,
                      }))}
                    />
                    <EnrollmentCodeSection
                      subjectId={sub.id}
                      code={sub.enrollment_code}
                      pendingCount={pendingCount}
                    />
                    {suspendedToday ? (
                      <div
                        role="status"
                        className="rounded-xl border border-red-200/80 bg-red-50/60 p-3 flex gap-2.5"
                      >
                        <Ban className="w-4 h-4 text-red-600 mt-0.5 shrink-0" strokeWidth={2} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900">
                            La clase de hoy está suspendida
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5 wrap-break-word">
                            {suspendedToday.suspension_reason}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            No se toma asistencia ni se generan inasistencias. Coordinación puede
                            deshacerla si fue un error.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <SessionButton
                          subjectId={sub.id}
                          registrationWindowMinutes={registrationWindowMinutes}
                          schedules={
                            (sub.subject_schedules as
                              | { day_of_week: number; modality: 'PRESENCIAL' | 'VIRTUAL' }[]
                              | null) || []
                          }
                        />
                        {canSuspendToday && (
                          <SuspendClassButton
                            sessionId={heldToday?.id}
                            subjectId={heldToday ? undefined : sub.id}
                            label="Suspender clase de hoy"
                            variant="ghost"
                            className="w-full"
                          />
                        )}
                      </div>
                    )}
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
