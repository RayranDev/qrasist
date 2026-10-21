import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/actions/authGuards'
import { generateAdminReport } from '@/lib/reports/adminReportService'
import { buildAttendanceReportWorkbook } from '@/lib/reports/attendanceReportWorkbook'
import { renderAdminReportPdf } from '@/lib/reports/pdf/adminReportPdf'
import { safeFileName } from '@/lib/reports/pdf/format'

export const runtime = 'nodejs'
// Un período grande (cientos de estudiantes, miles de asistencias) tarda más
// que el valor por defecto en consultarse y renderizarse.
export const maxDuration = 60

const FORMATS = ['xlsx', 'pdf', 'summary'] as const
type Format = (typeof FORMATS)[number]

/**
 * Reporte de asistencia por corte para coordinación (RF30, RF31):
 *   GET /admin/reports/attendance?periodId=...&format=xlsx|pdf|summary
 *       [&cutId=...][&subjectId=...][&professorId=...][&status=NORMAL|WARNING|FAILED_ATTENDANCE]
 *
 * Sin `cutId` el alcance es todo el período. `summary` devuelve los
 * indicadores en JSON para el tablero. Solo ADMIN activo.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const periodId = params.get('periodId')
  const format = (params.get('format') || 'xlsx') as Format
  if (!periodId) {
    return NextResponse.json({ error: 'periodId es requerido.' }, { status: 400 })
  }
  if (!FORMATS.includes(format)) {
    return NextResponse.json({ error: 'Formato no válido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }
  if (!(await checkAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  let result
  try {
    result = await generateAdminReport(supabase, {
      periodId,
      cutId: params.get('cutId'),
      subjectId: params.get('subjectId'),
      professorId: params.get('professorId'),
      status: params.get('status'),
    })
  } catch (error) {
    console.error('[reports/admin] No se pudo generar el reporte', error)
    return NextResponse.json({ error: 'No se pudo generar el reporte.' }, { status: 500 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { report, period, scopeLabel, filtersLabel } = result

  if (format === 'summary') {
    return NextResponse.json(
      {
        period,
        scopeLabel,
        totals: report.totals,
        subjects: report.subjectSummaries,
        professors: report.professors.map((p) => ({
          professorName: p.professorName,
          scheduled: p.scheduled,
          held: p.held,
          suspended: p.suspended,
          notRegistered: p.notRegistered,
          compliancePct: p.compliancePct,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const baseName = `reporte_asistencia_${safeFileName(period.name)}_${safeFileName(report.range.label)}`
  const meta = { periodName: period.name, scopeLabel, filtersLabel }

  if (format === 'pdf') {
    const bytes = await renderAdminReportPdf(report, meta)
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const workbook = await buildAttendanceReportWorkbook(report, meta)
  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${baseName}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
