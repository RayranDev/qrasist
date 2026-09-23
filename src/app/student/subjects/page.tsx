import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubjectBrowser, { SubjectItem } from './SubjectBrowser'
import JoinByCode from './JoinByCode'
import { isSessionAlreadyHeld, isWithinJustificationWindow } from '@/lib/justifications/eligibility'
import type { JustificationStatus, MissedSessionItem } from './missedSessions'
import RiskBanner from '@/components/student/RiskBanner'
import {
  computeStudentSubjectRisks,
  filterAtRiskSubjects,
  type EnrolledSubjectCounts,
} from '@/lib/attendance/studentSummaries'

export const dynamic = 'force-dynamic'

interface SubjectCareerRow {
  id: string
  level: number | null
  career: { id: string; name: string; code: string } | null
  subject: {
    id: string
    name: string
    code: string
    is_active: boolean | null
    absence_rule_type?: 'PERCENTAGE' | 'FIXED_COUNT'
    max_absence_percentage?: number
    max_absence_count?: number | null
    total_planned_sessions?: number
    late_after_minutes?: number | null
    lates_per_absence?: number | null
  } | null
}

export default async function StudentSubjectsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: studentCareers } = await supabase
    .from('student_careers')
    .select('career:careers(id, name, code)')
    .eq('student_id', user.id)
    .eq('is_active', true)

  const careers = (studentCareers || [])
    .map((r) => r.career as unknown as { id: string; name: string; code: string } | null)
    .filter((c): c is { id: string; name: string; code: string } => c !== null)

  const careerIds = careers.map((c) => c.id)

  let rows: SubjectCareerRow[] = []
  if (careerIds.length > 0) {
    const { data } = await supabase
      .from('subject_careers')
      .select(
        `
        id,
        level,
        career:careers ( id, name, code ),
        subject:subjects (
          id,
          name,
          code,
          is_active,
          absence_rule_type,
          max_absence_percentage,
          max_absence_count,
          total_planned_sessions,
          late_after_minutes,
          lates_per_absence
        )
      `
      )
      .in('career_id', careerIds)
      .eq('is_active', true)
    rows = (data || []) as unknown as SubjectCareerRow[]
  }

  const available = rows.filter((r) => r.subject && r.subject.is_active !== false)
  const availableSubjectIds = available.map((r) => r.subject!.id)

  const [
    { data: enrollments },
    { data: requests },
    { data: studentAttendances },
    { data: activeSessions },
    { data: myJustifications },
    { data: availableSubjectSessions },
  ] = await Promise.all([
    supabase.from('enrollments').select('subject_id').eq('student_id', user.id),
    supabase.from('enrollment_requests').select('subject_id, status').eq('student_id', user.id),
    supabase
      .from('attendances')
      .select('session_id, status, session:sessions(subject_id)')
      .eq('student_id', user.id),
    supabase.from('sessions').select('id, subject_id').eq('is_active', true),
    supabase
      .from('absence_justifications')
      .select('id, session_id, subject_id, status, reason, attachment_path, review_note')
      .eq('student_id', user.id),
    availableSubjectIds.length > 0
      ? supabase
          .from('sessions')
          .select('id, subject_id, date, is_active, expires_at')
          .in('subject_id', availableSubjectIds)
      : Promise.resolve({
          data: [] as {
            id: string
            subject_id: string
            date: string
            is_active: boolean
            expires_at: string | null
          }[],
        }),
  ])

  const enrolledIds = new Set((enrollments || []).map((e) => e.subject_id))
  const requestStatusBySubject = new Map(
    (requests || []).map((r) => [r.subject_id, r.status as string])
  )

  // Mapear sesiones activas por materia
  const activeSessionsCountBySubject = new Map<string, number>()
  for (const s of activeSessions || []) {
    activeSessionsCountBySubject.set(
      s.subject_id,
      (activeSessionsCountBySubject.get(s.subject_id) || 0) + 1
    )
  }

  // Mapear justificaciones aprobadas del estudiante por materia (para
  // el descuento en computeAttendanceSummary) y por sesión (para la
  // sección de "sesiones perdidas" de cada materia).
  interface MyJustificationRow {
    id: string
    session_id: string
    subject_id: string
    status: string
    reason: string
    attachment_path: string | null
    review_note: string | null
  }
  const justifiedCountBySubject = new Map<string, number>()
  const justificationBySession = new Map<string, MyJustificationRow>()
  for (const j of (myJustifications || []) as MyJustificationRow[]) {
    justificationBySession.set(j.session_id, j)
    if (j.status === 'APPROVED') {
      justifiedCountBySubject.set(
        j.subject_id,
        (justifiedCountBySubject.get(j.subject_id) || 0) + 1
      )
    }
  }

  const attendedSessionIds = new Set((studentAttendances || []).map((a) => a.session_id))

  // Mapear asistencias (y tardanzas) del estudiante por materia
  const studentAttendancesBySubject = new Map<string, number>()
  const studentLateCountBySubject = new Map<string, number>()
  for (const att of studentAttendances || []) {
    const sessionObj = att.session as unknown as { subject_id: string } | null
    if (sessionObj?.subject_id) {
      studentAttendancesBySubject.set(
        sessionObj.subject_id,
        (studentAttendancesBySubject.get(sessionObj.subject_id) || 0) + 1
      )
      if (att.status === 'LATE') {
        studentLateCountBySubject.set(
          sessionObj.subject_id,
          (studentLateCountBySubject.get(sessionObj.subject_id) || 0) + 1
        )
      }
    }
  }

  // Resumen de riesgo de las materias inscritas: se reusa la misma
  // lógica que /student/scanner (computeStudentSubjectRisks), pero
  // alimentada con los conteos que esta página ya trajo arriba -- así
  // no se dispara una segunda ronda de queries para los mismos datos.
  const enrolledCounts: EnrolledSubjectCounts[] = available
    .filter((r) => enrolledIds.has(r.subject!.id))
    .map((r) => ({
      subjectId: r.subject!.id,
      subjectCode: r.subject!.code,
      subjectName: r.subject!.name,
      policy: {
        ruleType: r.subject!.absence_rule_type,
        maxPercentage: r.subject!.max_absence_percentage,
        maxCount: r.subject!.max_absence_count,
        totalPlannedSessions: r.subject!.total_planned_sessions,
        latesPerAbsence: r.subject!.lates_per_absence,
      },
      sessionsHeld: activeSessionsCountBySubject.get(r.subject!.id) || 0,
      attendancesCount: studentAttendancesBySubject.get(r.subject!.id) || 0,
      lateCount: studentLateCountBySubject.get(r.subject!.id) || 0,
      justifiedCount: justifiedCountBySubject.get(r.subject!.id) || 0,
    }))
  const risksBySubjectId = new Map(
    computeStudentSubjectRisks(enrolledCounts).map((risk) => [risk.subjectId, risk])
  )
  const atRiskSubjects = filterAtRiskSubjects(Array.from(risksBySubjectId.values()))

  const items: SubjectItem[] = available.map((r) => {
    const isEnrolled = enrolledIds.has(r.subject!.id)

    const attendanceSummary = isEnrolled ? risksBySubjectId.get(r.subject!.id)?.summary : undefined

    const missedSessions: MissedSessionItem[] = isEnrolled
      ? (availableSubjectSessions || [])
          .filter((s) => s.subject_id === r.subject!.id)
          .filter((s) => isSessionAlreadyHeld(s))
          .filter((s) => !attendedSessionIds.has(s.id))
          .map((s) => {
            const j = justificationBySession.get(s.id)
            return {
              sessionId: s.id,
              subjectId: r.subject!.id,
              subjectName: r.subject!.name,
              subjectCode: r.subject!.code,
              date: s.date,
              withinWindow: isWithinJustificationWindow(s.date),
              justification: j
                ? {
                    id: j.id,
                    status: j.status as JustificationStatus,
                    reason: j.reason,
                    reviewNote: j.review_note,
                    attachmentPath: j.attachment_path,
                  }
                : null,
            }
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      : []

    return {
      subjectCareerId: r.id,
      level: r.level,
      career: r.career!,
      subject: {
        id: r.subject!.id,
        name: r.subject!.name,
        code: r.subject!.code,
      },
      status: isEnrolled
        ? ('enrolled' as const)
        : requestStatusBySubject.get(r.subject!.id) === 'pending'
          ? ('pending' as const)
          : requestStatusBySubject.get(r.subject!.id) === 'rejected'
            ? ('rejected' as const)
            : ('none' as const),
      attendanceSummary,
      missedSessions,
    }
  })

  return (
    <div className="pt-2 flex flex-col gap-4">
      <h1 className="text-lg font-black text-gray-900">Mis Materias</h1>

      <RiskBanner risks={atRiskSubjects} />

      {careerIds.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center border border-gray-200">
          <p className="text-sm text-gray-600 font-medium">
            Todavía no tenés una carrera asignada.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Contactá a coordinación académica para que te asignen tu carrera.
          </p>
        </div>
      ) : (
        <SubjectBrowser careers={careers} items={items} />
      )}

      <JoinByCode />
    </div>
  )
}
