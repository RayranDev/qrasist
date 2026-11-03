/**
 * Bitácora de las descargas de reportes con IP y ubicación: son datos
 * personales, así que cada descarga deja quién la hizo, qué reporte y con qué
 * filtros. Solo se llama cuando la opción está activa y el reporte ya se armó.
 */
import { logAudit } from '@/lib/audit/auditLog'

export type CaptureExportReport = 'attendance-range' | 'user-student'

export async function logCaptureExport(input: {
  actorId: string
  report: CaptureExportReport
  filters: Record<string, string | null | undefined>
  rows: number
  subjectId?: string | null
}): Promise<void> {
  const filters = Object.fromEntries(Object.entries(input.filters).filter(([, value]) => !!value))
  await logAudit({
    actorId: input.actorId,
    action: 'report.export_capture_data',
    entityType: 'report',
    entityId: input.report,
    subjectId: input.subjectId ?? null,
    details: { report: input.report, format: 'xlsx', filters, rows: input.rows },
  })
}
