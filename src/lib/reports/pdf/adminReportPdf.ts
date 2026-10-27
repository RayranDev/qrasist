/**
 * PDF del reporte de asistencia por corte para coordinación (RF31):
 * resumen de portada, tabla por materia, detalle por estudiante,
 * cumplimiento docente y anexo de observaciones/excusas. Horizontal A4.
 */
import type { AttendanceReport } from '@/lib/reports/attendanceReport'
import { collectCutColumns, findCut, generalHeader } from '@/lib/reports/cutColumns'
import { PdfReport, type PdfCell, type PdfColumn } from './pdfDocument'
import {
  COUNTED_ABSENCES_NOTE,
  formatDateEs,
  formatGeneratedAt,
  formatPct,
  statusTone,
} from './format'
import { countOf } from '@/lib/utils/plural'

export interface AdminPdfMeta {
  periodName: string
  /** Rango en texto, ej. 'Corte 1 (01/02/2026 - 15/03/2026)'. */
  scopeLabel: string
  /** Descripción de filtros activos (vacía si no hay). */
  filtersLabel?: string
  generatedAt?: Date
}

const NOTE_COMPLIANCE =
  'Cumplimiento docente = (clases dictadas + suspendidas) / clases programadas en el horario semanal, con tope por materia (las clases extra de una materia no compensan las no registradas de otra). Las clases programadas sin ningún registro figuran como "no registradas".'

export async function renderAdminReportPdf(
  report: AttendanceReport,
  meta: AdminPdfMeta
): Promise<Uint8Array> {
  const subtitle = [`Período: ${meta.periodName}`, `Alcance: ${meta.scopeLabel}`]
  if (meta.filtersLabel) subtitle.push(`Filtros: ${meta.filtersLabel}`)

  const pdf = await PdfReport.create({
    title: 'Reporte de asistencia por corte',
    subtitleLines: subtitle,
    orientation: 'landscape',
    generatedAt: formatGeneratedAt(meta.generatedAt),
    runningTitle: `Reporte de asistencia · ${meta.periodName} · ${meta.scopeLabel}`,
  })

  const { totals } = report

  // ---- Portada / resumen -------------------------------------------------
  pdf.section('Resumen institucional')
  pdf.stats([
    { label: 'Asistencia promedio', value: formatPct(totals.overallAttendancePct) },
    {
      label: 'Estudiantes en riesgo',
      value: String(totals.atRiskStudents),
      tone: totals.atRiskStudents > 0 ? 'warning' : 'success',
    },
    {
      label: 'Estudiantes con pérdida por fallas',
      value: String(totals.failedStudents),
      tone: totals.failedStudents > 0 ? 'danger' : 'success',
    },
    { label: 'Cumplimiento docente', value: formatPct(totals.complianceOverallPct) },
  ])
  pdf.stats([
    { label: 'Materias', value: String(totals.subjects) },
    { label: 'Docentes', value: String(totals.professors) },
    { label: 'Estudiantes', value: String(totals.students) },
    { label: 'Clases dictadas', value: String(totals.sessionsHeld) },
    { label: 'Clases suspendidas', value: String(totals.sessionsSuspended) },
  ])
  pdf.paragraph(
    'El estado de cada estudiante (Normal, En riesgo, Perdida por fallas) se calcula sobre todo el semestre; los porcentajes y conteos corresponden al alcance del reporte.',
    { muted: true, size: 8.5 }
  )
  pdf.paragraph(COUNTED_ABSENCES_NOTE, { muted: true, size: 8.5 })
  pdf.legend([
    { label: 'Normal', tone: 'success' },
    { label: 'En riesgo', tone: 'warning' },
    { label: 'Perdida por fallas', tone: 'danger' },
  ])

  // ---- Resumen por materia ----------------------------------------------
  pdf.section('Resumen por materia')
  pdf.table(
    [
      { header: 'Código', width: 8 },
      { header: 'Materia', width: 22 },
      { header: 'Docente', width: 18 },
      { header: 'Inscritos', width: 7, align: 'right' },
      { header: 'Clases', width: 6, align: 'right' },
      { header: 'Suspend.', width: 7, align: 'right' },
      { header: '% Asist. prom.', width: 9, align: 'right' },
      { header: 'Normal', width: 6, align: 'right' },
      { header: 'En riesgo', width: 7, align: 'right' },
      { header: 'Perdida', width: 6, align: 'right' },
    ],
    report.subjectSummaries.map((s) => [
      s.subjectCode,
      s.subjectName,
      s.professorName,
      String(s.enrolled),
      String(s.sessionsHeld),
      String(s.sessionsSuspended),
      formatPct(s.avgAttendancePct),
      { text: String(s.normal), tone: s.normal > 0 ? 'success' : undefined },
      { text: String(s.atRisk), tone: s.atRisk > 0 ? 'warning' : undefined },
      { text: String(s.failed), tone: s.failed > 0 ? 'danger' : undefined },
    ]),
    { emptyMessage: 'No hay materias para este período y filtros.' }
  )

  // ---- Detalle por materia ----------------------------------------------
  pdf.section('Detalle por materia y estudiante')
  const rowsBySubject = new Map<string, typeof report.rows>()
  for (const row of report.rows) {
    rowsBySubject.set(row.subjectId, [...(rowsBySubject.get(row.subjectId) || []), row])
  }
  // Los cortes son semestrales; las demás columnas siguen el alcance del
  // reporte. Las materias sin cortes conservan su tabla de siempre.
  const ranged = report.range.from !== null || report.range.to !== null
  if (report.rows.some((r) => r.cuts.length > 0)) {
    pdf.paragraph(
      `En las materias con cortes, cada columna "% corte" muestra la asistencia de ese corte sobre todo el semestre y la columna "% Asist. ${ranged ? '(rango)' : '(general)'}" muestra el total ${ranged ? 'del alcance del reporte' : 'del período'}. Las materias sin cortes definidos solo muestran la cifra general.`,
      { muted: true, size: 8.5 }
    )
  }
  for (const summary of report.subjectSummaries) {
    const rows = [...(rowsBySubject.get(summary.subjectId) || [])].sort((a, b) =>
      a.studentName.localeCompare(b.studentName, 'es')
    )
    const cutColumns = collectCutColumns(rows.map((r) => r.cuts))
    pdf.subheading(
      `${summary.subjectCode} · ${summary.subjectName}`,
      `Docente: ${summary.professorName} · ${summary.career} · ${countOf(summary.sessionsHeld, 'clase')} en el alcance`
    )
    pdf.table(
      [
        { header: 'Código', width: 9 },
        { header: 'Estudiante', width: cutColumns.length > 0 ? 18 : 22 },
        ...cutColumns.map((c): PdfColumn => ({ header: `% ${c.name}`, width: 7, align: 'right' })),
        { header: 'Clases', width: 5.5, align: 'right' },
        { header: 'Pres.', width: 5.5, align: 'right' },
        { header: 'Tardes', width: 5.5, align: 'right' },
        { header: 'Justif.', width: 5.5, align: 'right' },
        { header: 'Faltas', width: 5.5, align: 'right' },
        {
          header: generalHeader('% Asist.', cutColumns.length > 0, ranged),
          width: cutColumns.length > 0 ? 9 : 7,
          align: 'right',
        },
        { header: '% Inasist.', width: 7.5, align: 'right' },
        { header: 'Estado', width: 11 },
        { header: 'Obs.', width: 5, align: 'right' },
        { header: 'Excusas', width: 6, align: 'right' },
      ],
      rows.map((r): (string | PdfCell)[] => [
        r.studentCode,
        r.studentName,
        ...cutColumns.map((c): string | PdfCell => {
          const cut = findCut(r.cuts, c.key)
          if (!cut) return ''
          return cut.sessionsHeld === 0 ? '---' : { text: formatPct(cut.percentage), bold: true }
        }),
        String(r.sessionsHeld),
        String(r.present),
        { text: String(r.late), tone: r.late > 0 ? 'warning' : undefined },
        String(r.justified),
        { text: String(r.countedAbsences), tone: r.countedAbsences > 0 ? 'danger' : undefined },
        formatPct(r.attendancePct),
        formatPct(r.absencePct),
        { text: r.statusLabel, tone: statusTone(r.status) },
        String(r.observations.length),
        String(r.excuses.length),
      ]),
      { emptyMessage: 'Sin estudiantes inscritos para los filtros aplicados.' }
    )
  }

  // ---- Cumplimiento docente ---------------------------------------------
  pdf.breakPage()
  pdf.section('Cumplimiento docente')
  pdf.paragraph(NOTE_COMPLIANCE, { muted: true, size: 8.5 })
  pdf.table(
    [
      { header: 'Docente', width: 18 },
      { header: 'Materias', width: 28 },
      { header: 'Programadas', width: 8, align: 'right' },
      { header: 'Dictadas', width: 7, align: 'right' },
      { header: 'Suspendidas', width: 8, align: 'right' },
      { header: 'No registradas', width: 8.5, align: 'right' },
      { header: 'No reg. justif.', width: 8.5, align: 'right' },
      { header: 'Cumplimiento', width: 9, align: 'right' },
    ],
    report.professors.map((p): (string | PdfCell)[] => [
      p.professorName,
      p.subjects.join('; ') +
        (p.subjectsWithoutSchedule > 0
          ? ` (${p.subjectsWithoutSchedule} sin horario semanal)`
          : ''),
      String(p.scheduled),
      String(p.held),
      String(p.suspended),
      {
        text: String(p.notRegistered),
        tone: p.notRegistered > p.notRegisteredJustified ? 'danger' : undefined,
      },
      String(p.notRegisteredJustified),
      { text: formatPct(p.compliancePct), bold: true },
    ]),
    { emptyMessage: 'No hay docentes para los filtros aplicados.' }
  )

  // ---- Anexo: observaciones y excusas ------------------------------------
  const annex: (string | PdfCell)[][] = []
  const annexRows = report.rows
    .flatMap((r) => [
      ...r.observations.map((o) => ({
        date: o.date,
        row: r,
        type: 'Marca manual' as const,
        detail: o.reason,
      })),
      ...r.excuses.map((e) => ({
        date: e.date,
        row: r,
        type: 'Excusa aprobada' as const,
        detail: e.reason,
      })),
    ])
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const item of annexRows) {
    annex.push([
      formatDateEs(item.date),
      `${item.row.subjectCode} ${item.row.subjectName}`,
      `${item.row.studentName} (${item.row.studentCode})`,
      { text: item.type, tone: item.type === 'Excusa aprobada' ? 'info' : 'neutral' },
      item.detail,
    ])
  }
  pdf.section('Anexo: observaciones y excusas médicas')
  pdf.table(
    [
      { header: 'Fecha', width: 8 },
      { header: 'Materia', width: 20 },
      { header: 'Estudiante', width: 20 },
      { header: 'Tipo', width: 11 },
      { header: 'Detalle / motivo', width: 41 },
    ],
    annex,
    { emptyMessage: 'No hay marcas manuales ni excusas aprobadas en el alcance del reporte.' }
  )

  return pdf.save()
}
