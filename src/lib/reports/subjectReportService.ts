/**
 * Orquestación del PDF de una materia para el profesor (RF32). Valida la
 * materia y el corte, carga los datos y arma el reporte. No decide
 * permisos: el route handler ya verificó que quien llama es ADMIN o el
 * profesor activo de esa materia (checkAdminOrSubjectProfessor).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CutInput } from '@/lib/attendance/cutsBreakdown'
import {
  buildAttendanceReport,
  buildClassList,
  resolveReportRange,
  type AttendanceReport,
  type ClassListEntry,
} from './attendanceReport'
import { loadReportData } from './attendanceReportData'
import { formatDateEs } from './pdf/format'

export type SubjectReportResult =
  | {
      ok: true
      report: AttendanceReport
      classes: ClassListEntry[]
      cuts: CutInput[]
      subject: {
        id: string
        code: string
        name: string
        professorName: string
        periodName: string
      }
      scopeLabel: string
    }
  | { ok: false; status: number; error: string }

export async function generateSubjectReport(
  supabase: SupabaseClient,
  params: { subjectId: string; cutId?: string | null }
): Promise<SubjectReportResult> {
  const data = await loadReportData(supabase, { subjectIds: [params.subjectId] })
  const subject = data.subjects[0]
  if (!subject) return { ok: false, status: 404, error: 'Materia no encontrada.' }

  const range = resolveReportRange(subject.cuts, params.cutId)
  if (!range) return { ok: false, status: 400, error: 'El corte no pertenece a esta materia.' }

  const report = buildAttendanceReport({ ...data, range })
  const classes = buildClassList(
    data.sessions,
    data.attendances,
    new Set(data.enrollments.map((e) => e.studentId)),
    range
  )

  return {
    ok: true,
    report,
    classes,
    cuts: subject.cuts,
    subject: {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      professorName: subject.professorName || 'Sin asignar',
      periodName: subject.periodName || 'Sin período',
    },
    scopeLabel: range.cutId
      ? `${range.label} (${formatDateEs(range.from as string)} - ${formatDateEs(range.to as string)})`
      : range.label,
  }
}
