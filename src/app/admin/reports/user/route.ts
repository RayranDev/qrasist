import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/actions/authGuards'
import { parseUserReportParams } from '@/lib/reports/userReportParams'
import { generateUserReport } from '@/lib/reports/userReportService'
import {
  buildProfessorUserWorkbook,
  buildStudentUserWorkbook,
} from '@/lib/reports/userReportWorkbook'
import { renderStudentReportPdf } from '@/lib/reports/pdf/studentReportPdf'
import { renderProfessorUserReportPdf } from '@/lib/reports/pdf/professorUserReportPdf'
import { safeFileName } from '@/lib/reports/pdf/format'
import { logCaptureExport } from '@/lib/reports/captureExportAudit'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Reporte de asistencia de un estudiante o un docente, pedido por coordinación:
 *   GET /admin/reports/user?userId=...&format=xlsx|pdf[&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *       [&includeCapture=1]
 *
 * `from` y `to` (días civiles de Bogotá, inclusivos, máximo 366 días) van
 * juntos o ninguno. El usuario debe existir, estar activo y no ser ADMIN.
 * `includeCapture=1` (solo Excel y solo estudiantes) suma IP y ubicación al
 * detalle; son datos personales y la descarga queda en la bitácora.
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

  const parsed = parseUserReportParams(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { userId, from, to, format, includeCapture } = parsed.params

  let result
  try {
    result = await generateUserReport(supabase, {
      userId,
      range: from && to ? { from, to } : null,
      includeCapture,
    })
  } catch (error) {
    console.error('[reports/user] No se pudo generar el reporte', error)
    return NextResponse.json({ error: 'No se pudo generar el reporte.' }, { status: 500 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const prefix = result.kind === 'student' ? 'asistencia_estudiante' : 'asistencia_docente'
  const baseName = `${prefix}_${safeFileName(result.name)}${from && to ? `_${from}_a_${to}` : ''}`

  if (format === 'pdf') {
    const bytes =
      result.kind === 'student'
        ? await renderStudentReportPdf(result.history, {
            studentName: result.name,
            studentCode: result.code,
            scopeLabel: from && to ? result.scopeLabel : undefined,
            emptyMessage: 'El estudiante no tiene materias inscritas.',
          })
        : await renderProfessorUserReportPdf(result.report, {
            professorName: result.name,
            scopeLabel: result.scopeLabel,
            ranged: !!(from && to),
          })
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  if (includeCapture && result.kind === 'student') {
    await logCaptureExport({
      actorId: user.id,
      report: 'user-student',
      filters: { userId, from, to },
      rows: result.history.reduce((sum, h) => sum + h.entries.length, 0),
    })
  }

  const workbook =
    result.kind === 'student'
      ? await buildStudentUserWorkbook(result.history, {
          studentName: result.name,
          studentCode: result.code,
          scopeLabel: result.scopeLabel,
          ranged: !!(from && to),
          includeCapture,
        })
      : await buildProfessorUserWorkbook(result.report, {
          professorName: result.name,
          scopeLabel: result.scopeLabel,
          ranged: !!(from && to),
        })
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
