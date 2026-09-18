import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubjectBrowser, { SubjectItem } from './SubjectBrowser'
import JoinByCode from './JoinByCode'
import { computeAttendanceSummary } from '@/lib/utils/attendancePolicy'

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
          total_planned_sessions
        )
      `
      )
      .in('career_id', careerIds)
      .eq('is_active', true)
    rows = (data || []) as unknown as SubjectCareerRow[]
  }

  const available = rows.filter((r) => r.subject && r.subject.is_active !== false)

  const [
    { data: enrollments },
    { data: requests },
    { data: studentAttendances },
    { data: activeSessions },
  ] = await Promise.all([
    supabase.from('enrollments').select('subject_id').eq('student_id', user.id),
    supabase.from('enrollment_requests').select('subject_id, status').eq('student_id', user.id),
    supabase
      .from('attendances')
      .select('session_id, session:sessions(subject_id)')
      .eq('student_id', user.id),
    supabase.from('sessions').select('id, subject_id').eq('is_active', true),
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

  // Mapear asistencias del estudiante por materia
  const studentAttendancesBySubject = new Map<string, number>()
  for (const att of studentAttendances || []) {
    const sessionObj = att.session as unknown as { subject_id: string } | null
    if (sessionObj?.subject_id) {
      studentAttendancesBySubject.set(
        sessionObj.subject_id,
        (studentAttendancesBySubject.get(sessionObj.subject_id) || 0) + 1
      )
    }
  }

  const items: SubjectItem[] = available.map((r) => {
    const isEnrolled = enrolledIds.has(r.subject!.id)
    const sessionsHeld = activeSessionsCountBySubject.get(r.subject!.id) || 0
    const attended = studentAttendancesBySubject.get(r.subject!.id) || 0

    const attendanceSummary = isEnrolled
      ? computeAttendanceSummary(sessionsHeld, attended, {
          ruleType: r.subject!.absence_rule_type,
          maxPercentage: r.subject!.max_absence_percentage,
          maxCount: r.subject!.max_absence_count,
          totalPlannedSessions: r.subject!.total_planned_sessions,
        })
      : undefined

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
    }
  })

  return (
    <div className="pt-2 flex flex-col gap-4">
      <h1 className="text-lg font-black text-gray-900">Mis Materias</h1>

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
