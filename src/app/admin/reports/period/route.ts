import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/actions/authGuards'
import { buildWorkbook } from '@/lib/excel/exportWorkbook'
import {
  buildPeriodAttendanceReport,
  type PeriodReportSubjectInput,
  type PeriodReportEnrollmentInput,
} from '@/lib/reports/periodAttendanceReport'
import type { AbsenceRuleType } from '@/lib/utils/attendancePolicy'

interface SubjectRow {
  id: string
  name: string
  code: string
  professor_id: string | null
  absence_rule_type: AbsenceRuleType | null
  max_absence_percentage: number | null
  max_absence_count: number | null
  total_planned_sessions: number | null
  lates_per_absence: number | null
  professor: { name: string } | null
  subject_careers: { is_active: boolean | null; career: { name: string } | null }[] | null
  enrollments:
    | {
        student_id: string
        student: { name: string; student_code: string | null } | null
      }[]
    | null
}

/**
 * Reporte de asistencia de un período académico completo, en Excel.
 * Vive en un route handler (no en un server action llamado desde el
 * cliente con los datos ya cargados) porque el período puede tener
 * cientos de estudiantes -- las consultas y el armado del .xlsx pasan
 * enteros por el servidor, y el navegador solo recibe el archivo final.
 */
export async function GET(request: NextRequest) {
  const periodId = request.nextUrl.searchParams.get('periodId')
  if (!periodId) {
    return NextResponse.json({ error: 'periodId es requerido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const isAdmin = await checkAdmin(supabase, user.id)
  if (!isAdmin) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  const { data: period } = await supabase
    .from('periods')
    .select('id, name')
    .eq('id', periodId)
    .maybeSingle()
  if (!period) {
    return NextResponse.json({ error: 'Período no encontrado.' }, { status: 404 })
  }

  // Una sola consulta trae materias + profesor + carreras + inscritos
  // (con sus datos de perfil) -- el resto (sesiones dictadas y
  // asistencias) se trae en lotes aparte porque no son relaciones
  // directas de `subjects` en el esquema.
  const { data: subjectsData } = await supabase
    .from('subjects')
    .select(
      `id, name, code, professor_id,
       absence_rule_type, max_absence_percentage, max_absence_count,
       total_planned_sessions, lates_per_absence,
       professor:profiles(name),
       subject_careers(is_active, career:careers(name)),
       enrollments(student_id, student:profiles(name, student_code))`
    )
    .eq('period_id', periodId)

  const subjects = (subjectsData || []) as unknown as SubjectRow[]

  if (subjects.length === 0) {
    return NextResponse.json(
      { error: 'Este período no tiene materias asociadas.' },
      { status: 404 }
    )
  }

  const subjectIds = subjects.map((s) => s.id)

  const { data: activeSessions } = await supabase
    .from('sessions')
    .select('id, subject_id')
    .eq('is_active', true)
    .in('subject_id', subjectIds)

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

  const { data: approvedJustifications } = await supabase
    .from('absence_justifications')
    .select('student_id, subject_id')
    .eq('status', 'APPROVED')
    .in('subject_id', subjectIds)

  // key = `${studentId}_${subjectId}`
  const attendancesByKey = new Map<string, number>()
  const lateByKey = new Map<string, number>()
  for (const att of attendanceRecords || []) {
    const subjectId = subjectIdBySessionId.get(att.session_id)
    if (!subjectId) continue
    const key = `${att.student_id}_${subjectId}`
    attendancesByKey.set(key, (attendancesByKey.get(key) || 0) + 1)
    if (att.status === 'LATE') {
      lateByKey.set(key, (lateByKey.get(key) || 0) + 1)
    }
  }

  const justifiedByKey = new Map<string, number>()
  for (const j of approvedJustifications || []) {
    const key = `${j.student_id}_${j.subject_id}`
    justifiedByKey.set(key, (justifiedByKey.get(key) || 0) + 1)
  }

  const subjectInputs: PeriodReportSubjectInput[] = subjects.map((s) => ({
    subjectId: s.id,
    subjectCode: s.code,
    subjectName: s.name,
    professorName: s.professor?.name || 'Sin asignar',
    careerNames: (s.subject_careers || [])
      .filter((sc) => sc.is_active !== false && sc.career?.name)
      .map((sc) => sc.career!.name),
    policy: {
      ruleType: s.absence_rule_type || undefined,
      maxPercentage: s.max_absence_percentage ?? undefined,
      maxCount: s.max_absence_count,
      totalPlannedSessions: s.total_planned_sessions ?? undefined,
      latesPerAbsence: s.lates_per_absence,
    },
    sessionsHeld: sessionsHeldBySubject.get(s.id) || 0,
  }))

  const enrollmentInputs: PeriodReportEnrollmentInput[] = subjects.flatMap((s) =>
    (s.enrollments || [])
      .filter((e) => e.student)
      .map((e) => {
        const key = `${e.student_id}_${s.id}`
        return {
          subjectId: s.id,
          studentId: e.student_id,
          studentCode: e.student?.student_code || 'N/A',
          studentName: e.student?.name || 'Desconocido',
          attendancesCount: attendancesByKey.get(key) || 0,
          lateCount: lateByKey.get(key) || 0,
          justifiedCount: justifiedByKey.get(key) || 0,
        }
      })
  )

  const { detailRows, summaryRows } = buildPeriodAttendanceReport(subjectInputs, enrollmentInputs)

  const workbook = await buildWorkbook([
    {
      name: 'Detalle',
      columns: [
        { header: 'Carrera', key: 'career', width: 28 },
        { header: 'Código Materia', key: 'subjectCode', width: 16 },
        { header: 'Materia', key: 'subjectName', width: 28 },
        { header: 'Profesor', key: 'professorName', width: 26 },
        { header: 'Código Estudiante', key: 'studentCode', width: 18 },
        { header: 'Estudiante', key: 'studentName', width: 28 },
        { header: 'Sesiones Dictadas', key: 'sessionsHeld', width: 16 },
        { header: 'Presentes', key: 'present', width: 12 },
        { header: 'Tardanzas', key: 'late', width: 12 },
        { header: 'Justificadas', key: 'justified', width: 14 },
        { header: 'Faltas Contadas', key: 'countedAbsences', width: 16 },
        { header: '% Inasistencia', key: 'absencePercentage', width: 16 },
        { header: 'Estado', key: 'status', width: 20 },
      ],
      rows: detailRows as unknown as Record<string, unknown>[],
    },
    {
      name: 'Resumen por Materia',
      columns: [
        { header: 'Código Materia', key: 'subjectCode', width: 16 },
        { header: 'Materia', key: 'subjectName', width: 30 },
        { header: 'Inscritos', key: 'enrolled', width: 12 },
        { header: '% Asistencia Promedio', key: 'avgAttendancePercentage', width: 22 },
        { header: 'En Riesgo', key: 'atRiskCount', width: 12 },
      ],
      rows: summaryRows as unknown as Record<string, unknown>[],
    },
  ])

  const buffer = await workbook.xlsx.writeBuffer()
  const safeName = period.name.replace(/[^a-zA-Z0-9-_]/g, '_')

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte_asistencia_${safeName}.xlsx"`,
    },
  })
}
