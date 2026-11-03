import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/actions/authGuards'
import { parseRangeReportParams } from '@/lib/reports/attendanceRangeParams'
import { generateRangeReport } from '@/lib/reports/attendanceRangeService'
import { buildRangeWorkbook } from '@/lib/reports/attendanceRangeWorkbook'
import { logCaptureExport } from '@/lib/reports/captureExportAudit'

export const runtime = 'nodejs'
// Un año de clases de varias materias tarda más que el valor por defecto.
export const maxDuration = 60

/**
 * Reporte de asistencia por rango de fechas desde /admin/attendance:
 *   GET /admin/reports/attendance-range?from=YYYY-MM-DD&to=YYYY-MM-DD
 *       [&careerId=...][&subjectId=...][&format=xlsx][&includeCapture=1]
 *
 * `from` y `to` son días civiles de Bogotá, inclusivos, con un máximo de 366
 * días. Detalle por estudiante y clase (con ausencias derivadas de las
 * inscripciones) más un resumen por materia. Con `includeCapture=1` el detalle
 * suma IP y ubicación (datos personales: la descarga queda en la bitácora).
 * Solo ADMIN activo.
 */
export async function GET(request: NextRequest) {
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

  const parsed = parseRangeReportParams(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { from, to, careerId, subjectId, includeCapture } = parsed.params

  let result
  try {
    result = await generateRangeReport(supabase, { from, to, careerId, subjectId, includeCapture })
  } catch (error) {
    console.error('[reports/attendance-range] No se pudo generar el reporte', error)
    return NextResponse.json({ error: 'No se pudo generar el reporte.' }, { status: 500 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const workbook = await buildRangeWorkbook(result.report, {
    scopeLabel: result.scopeLabel,
    filtersLabel: result.filtersLabel,
  })
  const buffer = await workbook.xlsx.writeBuffer()
  // La bitácora se escribe cuando el archivo ya está armado: una descarga que
  // falla no deja un registro de datos que nunca salieron.
  if (includeCapture) {
    await logCaptureExport({
      actorId: user.id,
      report: 'attendance-range',
      filters: { from, to, careerId, subjectId },
      rows: result.report.detail.length,
      subjectId,
    })
  }
  const fileName = from === to ? `asistencia_${from}` : `asistencia_${from}_a_${to}`
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
