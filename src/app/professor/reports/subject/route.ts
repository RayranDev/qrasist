import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdminOrSubjectProfessor } from '@/lib/actions/authGuards'
import { generateSubjectReport } from '@/lib/reports/subjectReportService'
import { renderProfessorReportPdf } from '@/lib/reports/pdf/professorReportPdf'
import { safeFileName } from '@/lib/reports/pdf/format'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * PDF de asistencia de una materia (RF32: los docentes descargan solo en
 * PDF): GET /professor/reports/subject?subjectId=...[&cutId=...]
 *
 * Solo el profesor activo de la materia o un ADMIN; la materia se verifica
 * contra la base de datos, no contra nada que mande el cliente.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const subjectId = params.get('subjectId')
  if (!subjectId) {
    return NextResponse.json({ error: 'subjectId es requerido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }
  if (!(await checkAdminOrSubjectProfessor(supabase, user.id, subjectId))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  let result
  try {
    result = await generateSubjectReport(supabase, { subjectId, cutId: params.get('cutId') })
  } catch (error) {
    console.error('[reports/professor] No se pudo generar el reporte', error)
    return NextResponse.json({ error: 'No se pudo generar el reporte.' }, { status: 500 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { report, classes, cuts, subject, scopeLabel } = result
  const bytes = await renderProfessorReportPdf(report, {
    subjectCode: subject.code,
    subjectName: subject.name,
    professorName: subject.professorName,
    periodName: subject.periodName,
    scopeLabel,
    cuts,
    classes,
  })

  const filename = `asistencia_${safeFileName(subject.code)}_${safeFileName(report.range.label)}.pdf`
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
