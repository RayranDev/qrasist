/**
 * PDF de una materia para el profesor (RF32: los docentes descargan
 * reportes solo en PDF): estudiantes con porcentaje por corte y estado,
 * lista de clases (modalidad, reposición, suspensión) y anexo de
 * observaciones y excusas. Horizontal A4.
 */
import type { CutInput } from '@/lib/attendance/cutsBreakdown'
import type {
  AttendanceReport,
  ClassListEntry,
  StudentSubjectRow,
} from '@/lib/reports/attendanceReport'
import { PdfReport, type PdfCell, type PdfColumn } from './pdfDocument'
import {
  COUNTED_ABSENCES_NOTE,
  formatDateEs,
  formatGeneratedAt,
  formatPct,
  statusTone,
} from './format'

export interface ProfessorPdfMeta {
  subjectCode: string
  subjectName: string
  professorName: string
  periodName: string
  scopeLabel: string
  /** Cortes del período, para las columnas de porcentaje por corte. */
  cuts: CutInput[]
  classes: ClassListEntry[]
  generatedAt?: Date
}

const CLASS_STATE_LABELS = {
  HELD: 'Dictada',
  SUSPENDED: 'Suspendida',
  ARCHIVED: 'Archivada',
} as const

function cutPct(row: StudentSubjectRow, cutId: string): string {
  const cut = row.cuts.find((c) => c.cutId === cutId)
  return !cut || cut.sessionsHeld === 0 ? '---' : formatPct(cut.percentage)
}

export async function renderProfessorReportPdf(
  report: AttendanceReport,
  meta: ProfessorPdfMeta
): Promise<Uint8Array> {
  const pdf = await PdfReport.create({
    title: 'Reporte de asistencia de la materia',
    subtitleLines: [
      `${meta.subjectCode} · ${meta.subjectName}`,
      `Docente: ${meta.professorName} · Período: ${meta.periodName} · Alcance: ${meta.scopeLabel}`,
    ],
    orientation: 'landscape',
    generatedAt: formatGeneratedAt(meta.generatedAt),
    runningTitle: `${meta.subjectCode} ${meta.subjectName} · ${meta.scopeLabel}`,
  })

  const summary = report.subjectSummaries[0]
  const rows = [...report.rows].sort((a, b) => a.studentName.localeCompare(b.studentName, 'es'))

  pdf.section('Resumen')
  pdf.stats([
    { label: 'Estudiantes inscritos', value: String(summary?.enrolled ?? 0) },
    { label: 'Clases dictadas en el alcance', value: String(summary?.sessionsHeld ?? 0) },
    { label: 'Asistencia promedio', value: formatPct(summary?.avgAttendancePct ?? null) },
    {
      label: 'En riesgo',
      value: String(summary?.atRisk ?? 0),
      tone: summary?.atRisk ? 'warning' : 'success',
    },
    {
      label: 'Perdida por fallas',
      value: String(summary?.failed ?? 0),
      tone: summary?.failed ? 'danger' : 'success',
    },
  ])
  pdf.paragraph(
    'El estado se calcula sobre todo el semestre; los conteos y el porcentaje del alcance corresponden a las clases dictadas dentro del rango elegido. Las clases suspendidas o archivadas no cuentan.',
    { muted: true, size: 8.5 }
  )
  pdf.paragraph(COUNTED_ABSENCES_NOTE, { muted: true, size: 8.5 })
  pdf.legend([
    { label: 'Normal', tone: 'success' },
    { label: 'En riesgo', tone: 'warning' },
    { label: 'Perdida por fallas', tone: 'danger' },
  ])

  // ---- Estudiantes --------------------------------------------------------
  pdf.section('Estudiantes')
  const sortedCuts = [...meta.cuts].sort((a, b) => a.sequence - b.sequence)
  const columns: PdfColumn[] = [
    { header: 'Código', width: 9 },
    { header: 'Estudiante', width: 22 },
    { header: 'Clases', width: 5.5, align: 'right' },
    { header: 'Pres.', width: 5.5, align: 'right' },
    { header: 'Tardes', width: 5.5, align: 'right' },
    { header: 'Justif.', width: 5.5, align: 'right' },
    { header: 'Faltas', width: 5.5, align: 'right' },
    { header: '% Asist.', width: 7, align: 'right' },
    ...sortedCuts.map<PdfColumn>((c) => ({ header: `% ${c.name}`, width: 7.5, align: 'right' })),
    { header: 'Estado', width: 11 },
    { header: 'Obs.', width: 5, align: 'right' },
  ]
  pdf.table(
    columns,
    rows.map((r): (string | PdfCell)[] => [
      r.studentCode,
      r.studentName,
      String(r.sessionsHeld),
      String(r.present),
      { text: String(r.late), tone: r.late > 0 ? 'warning' : undefined },
      String(r.justified),
      { text: String(r.countedAbsences), tone: r.countedAbsences > 0 ? 'danger' : undefined },
      formatPct(r.attendancePct),
      ...sortedCuts.map((c) => cutPct(r, c.id)),
      { text: r.statusLabel, tone: statusTone(r.status) },
      String(r.observations.length),
    ]),
    { emptyMessage: 'No hay estudiantes inscritos en esta materia.' }
  )

  // ---- Clases -------------------------------------------------------------
  pdf.section('Clases del alcance')
  pdf.table(
    [
      { header: 'Fecha', width: 9 },
      { header: 'Estado', width: 11 },
      { header: 'Modalidad', width: 11 },
      { header: 'Tipo', width: 11 },
      { header: 'Asistentes', width: 9, align: 'right' },
      { header: 'Detalle', width: 49 },
    ],
    meta.classes.map((c): (string | PdfCell)[] => [
      formatDateEs(c.date),
      {
        text: CLASS_STATE_LABELS[c.state],
        tone: c.state === 'HELD' ? 'success' : c.state === 'SUSPENDED' ? 'danger' : 'neutral',
      },
      c.modality === 'VIRTUAL' ? 'Virtual' : c.modality === 'PRESENCIAL' ? 'Presencial' : '---',
      c.isMakeup ? { text: 'Reposición', tone: 'info' } : 'Regular',
      c.state === 'HELD' ? String(c.attendees) : '---',
      c.state === 'SUSPENDED'
        ? `Suspensión: ${c.suspensionReason ?? 'sin motivo registrado'}`
        : c.isMakeup
          ? `Reposición: ${c.makeupReason ?? 'sin motivo registrado'}`
          : '',
    ]),
    { emptyMessage: 'No hay clases registradas en el alcance elegido.' }
  )

  // ---- Observaciones y excusas -------------------------------------------
  const annexRows = rows
    .flatMap((r) => [
      ...r.observations.map((o) => ({
        date: o.date,
        student: `${r.studentName} (${r.studentCode})`,
        type: 'Marca manual',
        detail: `${o.status === 'LATE' ? 'Tarde' : 'Presente'}: ${o.reason}`,
      })),
      ...r.excuses.map((e) => ({
        date: e.date,
        student: `${r.studentName} (${r.studentCode})`,
        type: 'Excusa aprobada',
        detail: e.reason,
      })),
    ])
    .sort((a, b) => a.date.localeCompare(b.date))

  pdf.section('Observaciones y excusas médicas')
  pdf.table(
    [
      { header: 'Fecha', width: 9 },
      { header: 'Estudiante', width: 24 },
      { header: 'Tipo', width: 13 },
      { header: 'Detalle / motivo', width: 54 },
    ],
    annexRows.map((a): (string | PdfCell)[] => [
      formatDateEs(a.date),
      a.student,
      { text: a.type, tone: a.type === 'Excusa aprobada' ? 'info' : 'neutral' },
      a.detail,
    ]),
    { emptyMessage: 'No hay marcas manuales ni excusas aprobadas en el alcance elegido.' }
  )

  return pdf.save()
}
