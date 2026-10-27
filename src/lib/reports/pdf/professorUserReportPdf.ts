/**
 * PDF de un docente para coordinación: resumen por materia (programadas,
 * dictadas, suspendidas, sin registrar) y lista de clases con asistentes
 * contra inscritos. Horizontal A4.
 */
import type { ProfessorUserReport } from '@/lib/reports/professorUserReport'
import { PdfReport, type PdfCell, type PdfTone } from './pdfDocument'
import { formatBogotaTime } from '@/lib/utils/bogotaDay'
import { formatDateEs, formatGeneratedAt, formatPct } from './format'

export interface ProfessorUserPdfMeta {
  professorName: string
  scopeLabel: string
  /** El reporte está acotado a un rango de fechas (los cortes siguen siendo semestrales). */
  ranged?: boolean
  generatedAt?: Date
}

const CLASS_STATE: Record<'HELD' | 'SUSPENDED' | 'ARCHIVED', { label: string; tone: PdfTone }> = {
  HELD: { label: 'Dictada', tone: 'success' },
  SUSPENDED: { label: 'Suspendida', tone: 'danger' },
  ARCHIVED: { label: 'Archivada', tone: 'neutral' },
}

export async function renderProfessorUserReportPdf(
  report: ProfessorUserReport,
  meta: ProfessorUserPdfMeta
): Promise<Uint8Array> {
  const pdf = await PdfReport.create({
    title: 'Reporte de asistencia del docente',
    subtitleLines: [`Docente: ${meta.professorName}`, `Alcance: ${meta.scopeLabel}`],
    orientation: 'landscape',
    generatedAt: formatGeneratedAt(meta.generatedAt),
    runningTitle: `Reporte del docente · ${meta.professorName}`,
  })

  pdf.section('Resumen por materia')
  pdf.table(
    [
      { header: 'Materia', width: 30 },
      { header: 'Inscritos', width: 8, align: 'right' },
      { header: 'Program.', width: 8, align: 'right' },
      { header: 'Dictadas', width: 8, align: 'right' },
      { header: 'Suspend.', width: 8, align: 'right' },
      { header: 'Sin registrar', width: 10, align: 'right' },
      { header: '% Asist. prom.', width: 11, align: 'right' },
    ],
    report.subjects.map((s): (string | PdfCell)[] => [
      `${s.subjectCode} · ${s.subjectName}`,
      String(s.enrolled),
      s.scheduled === null ? 'Sin horario' : String(s.scheduled),
      String(s.held),
      String(s.suspended),
      s.omitted === null
        ? '---'
        : s.omitted > 0
          ? { text: String(s.omitted), tone: 'warning' }
          : '0',
      formatPct(s.avgAttendancePct),
    ]),
    { emptyMessage: 'El docente no tiene materias activas.' }
  )
  pdf.paragraph(
    'Sin registrar: días de clase esperados según el horario que no tienen ninguna sesión. Las materias sin horario semanal no tienen clases programadas contra las cuales medir.',
    { muted: true, size: 8.5 }
  )

  // Materias con cortes: cada corte (semestral) y después la fila general del alcance.
  const withCuts = report.subjects.filter((s) => s.cuts.length > 0)
  if (withCuts.length > 0) {
    pdf.section('Resumen por corte')
    pdf.table(
      [
        { header: 'Materia', width: 28 },
        { header: 'Corte', width: 16 },
        { header: 'Program.', width: 8, align: 'right' },
        { header: 'Dictadas', width: 8, align: 'right' },
        { header: 'Suspend.', width: 8, align: 'right' },
        { header: 'Sin registrar', width: 10, align: 'right' },
        { header: '% Asist. prom.', width: 11, align: 'right' },
      ],
      withCuts.flatMap((s): (string | PdfCell)[][] => [
        ...s.cuts.map((c, i): (string | PdfCell)[] => [
          i === 0 ? `${s.subjectCode} · ${s.subjectName}` : '',
          c.name,
          c.scheduled === null ? 'Sin horario' : String(c.scheduled),
          String(c.held),
          String(c.suspended),
          c.omitted === null ? '---' : String(c.omitted),
          c.held === 0 ? '---' : formatPct(c.avgAttendancePct),
        ]),
        [
          '',
          { text: meta.ranged ? 'General (rango)' : 'General (período)', bold: true },
          { text: s.scheduled === null ? 'Sin horario' : String(s.scheduled), bold: true },
          { text: String(s.held), bold: true },
          { text: String(s.suspended), bold: true },
          { text: s.omitted === null ? '---' : String(s.omitted), bold: true },
          { text: formatPct(s.avgAttendancePct), bold: true },
        ],
      ])
    )
    pdf.paragraph(
      'Cada corte muestra las clases de ese corte sobre todo el semestre; la fila "General" cierra la materia con el total del alcance del reporte. Las materias sin cortes definidos solo aparecen en el resumen por materia.',
      { muted: true, size: 8.5 }
    )
  }

  pdf.section('Clases')
  pdf.table(
    [
      { header: 'Fecha', width: 10 },
      { header: 'Hora', width: 9 },
      { header: 'Materia', width: 28 },
      { header: 'Estado', width: 11 },
      { header: 'Modalidad', width: 10 },
      { header: 'Asistentes', width: 11, align: 'right' },
      { header: 'Nota', width: 31 },
    ],
    report.classes.map((c): (string | PdfCell)[] => [
      formatDateEs(c.date),
      formatBogotaTime(c.date),
      `${c.subjectCode} · ${c.subjectName}`,
      { text: CLASS_STATE[c.state].label, tone: CLASS_STATE[c.state].tone },
      c.modality === 'VIRTUAL' ? 'Virtual' : c.modality === 'PRESENCIAL' ? 'Presencial' : '---',
      c.state === 'HELD' ? `${c.attendees} de ${c.enrolled}` : '---',
      [c.isMakeup ? 'Reposición' : '', c.note].filter(Boolean).join(' · '),
    ]),
    { emptyMessage: 'No hay clases en el alcance elegido.' }
  )

  return pdf.save()
}
