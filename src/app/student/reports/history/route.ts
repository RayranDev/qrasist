import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStudentReport } from '@/lib/reports/studentReportService'
import { renderStudentReportPdf } from '@/lib/reports/pdf/studentReportPdf'
import { safeFileName } from '@/lib/reports/pdf/format'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * PDF del historial de asistencia del propio estudiante (RF33):
 * GET /student/reports/history. No recibe ningún id: el estudiante sale de
 * la sesión, así que nadie puede pedir el historial de otra persona.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  let result
  try {
    result = await generateStudentReport(supabase, user.id)
  } catch (error) {
    console.error('[reports/student] No se pudo generar el reporte', error)
    return NextResponse.json({ error: 'No se pudo generar el reporte.' }, { status: 500 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { studentName, studentCode, history } = result.report
  const bytes = await renderStudentReportPdf(history, { studentName, studentCode })

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="historial_asistencia_${safeFileName(studentCode || studentName)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
