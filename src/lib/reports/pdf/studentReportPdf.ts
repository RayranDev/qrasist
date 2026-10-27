/**
 * PDF del historial de asistencia del estudiante (RF33): resumen por
 * materia con su estado semestral, desglose por corte y la lista fechada
 * de cada clase (Presente / Tarde / Justificada / Falta / Suspendida, y si
 * la marca fue manual). Vertical A4.
 */
import type { StudentSubjectHistory } from '@/lib/reports/attendanceReport'
import { cutLabel } from '@/lib/reports/cutColumns'
import { PdfReport, type PdfCell } from './pdfDocument'
import {
  HISTORY_STATE_LABELS,
  HISTORY_STATE_TONES,
  formatDateEs,
  formatGeneratedAt,
  formatPct,
  statusTone,
} from './format'
import { countOf } from '@/lib/utils/plural'

export interface StudentPdfMeta {
  studentName: string
  studentCode: string | null
  /** Alcance del reporte cuando no es todo el historial (p. ej. un rango de fechas). */
  scopeLabel?: string
  /** Texto de "sin materias" cuando lo ve alguien distinto del estudiante. */
  emptyMessage?: string
  generatedAt?: Date
}

export async function renderStudentReportPdf(
  history: StudentSubjectHistory[],
  meta: StudentPdfMeta
): Promise<Uint8Array> {
  const pdf = await PdfReport.create({
    title: 'Historial de asistencia',
    subtitleLines: [
      `Estudiante: ${meta.studentName}${meta.studentCode ? ` (${meta.studentCode})` : ''}`,
      `${countOf(history.length, 'materia inscrita', 'materias inscritas')}`,
      ...(meta.scopeLabel ? [`Alcance: ${meta.scopeLabel}`] : []),
    ],
    orientation: 'portrait',
    generatedAt: formatGeneratedAt(meta.generatedAt),
    runningTitle: `Historial de asistencia · ${meta.studentName}`,
  })

  // Con rango, conteos y porcentaje son del rango; el estado, el máximo de
  // faltas y los cortes siguen siendo semestrales. Los encabezados lo dicen
  // para que no se lean como una sola cifra. Sin rango, todo queda como siempre.
  const ranged = !!meta.scopeLabel

  pdf.section('Resumen por materia')
  pdf.table(
    [
      { header: 'Materia', width: 30 },
      { header: ranged ? 'Clases (rango)' : 'Clases', width: 7, align: 'right' },
      { header: ranged ? 'Asist. (rango)' : 'Asist.', width: 7, align: 'right' },
      { header: ranged ? 'Faltas (rango)' : 'Faltas', width: 7, align: 'right' },
      { header: ranged ? 'Máx. semestre' : 'Máx.', width: 7, align: 'right' },
      { header: ranged ? '% Asist. (rango)' : '% Asist.', width: 9, align: 'right' },
      { header: ranged ? 'Estado semestral' : 'Estado', width: 20 },
    ],
    history.map((h): (string | PdfCell)[] => [
      `${h.subjectCode} · ${h.subjectName}`,
      String(h.sessionsHeld),
      String(h.attended),
      String(h.countedAbsences),
      String(h.maxAbsencesAllowed),
      formatPct(h.attendancePct),
      { text: h.statusLabel, tone: statusTone(h.status) },
    ]),
    { emptyMessage: meta.emptyMessage ?? 'No tienes materias inscritas.' }
  )
  pdf.legend([
    { label: 'Presente / Normal', tone: 'success' },
    { label: 'Tarde / En riesgo', tone: 'warning' },
    { label: 'Falta / Perdida por fallas', tone: 'danger' },
    { label: 'Justificada', tone: 'info' },
  ])
  pdf.paragraph(
    ranged
      ? 'Clases, asistencias, faltas y porcentaje corresponden solo al rango elegido. El estado, el máximo de faltas ("Máx. semestre") y el desglose por corte se calculan sobre todo el semestre. Las clases suspendidas no cuentan como dictadas.'
      : 'El estado se calcula sobre todo el semestre. Las clases suspendidas no cuentan como dictadas. "Máx." es el máximo de faltas permitido en la materia.',
    { muted: true, size: 8.5 }
  )

  for (const h of history) {
    pdf.section(`${h.subjectCode} · ${h.subjectName}`)
    pdf.paragraph(
      `Docente: ${h.professorName} · ${ranged ? 'Estado semestral' : 'Estado'}: ${h.statusLabel} · ${ranged ? 'En el rango: ' : ''}${h.attended} de ${countOf(h.sessionsHeld, 'clase asistida', 'clases asistidas')}${h.late > 0 ? `, ${countOf(h.late, 'con tardanza', 'con tardanza')}` : ''}${h.justified > 0 ? `, ${countOf(h.justified, 'justificada')}` : ''}.`,
      { size: 9 }
    )

    if (h.cuts.length > 0) {
      pdf.table(
        [
          { header: ranged ? 'Corte (semestre)' : 'Corte', width: 28 },
          { header: 'Clases', width: 12, align: 'right' },
          { header: 'Asistidas', width: 14, align: 'right' },
          { header: 'Tardes', width: 12, align: 'right' },
          { header: 'Justificadas', width: 16, align: 'right' },
          { header: '% Asist.', width: 14, align: 'right' },
        ],
        h.cuts.map((c): (string | PdfCell)[] => [
          cutLabel(c.name),
          String(c.sessionsHeld),
          String(c.attended),
          String(c.late),
          String(c.justified),
          c.sessionsHeld === 0 ? '---' : { text: formatPct(c.percentage), bold: true },
        ])
      )
    }

    pdf.table(
      [
        { header: 'Fecha', width: 14 },
        { header: 'Estado', width: 16 },
        { header: 'Registro', width: 14 },
        { header: 'Observación', width: 56 },
      ],
      h.entries.map((e): (string | PdfCell)[] => [
        formatDateEs(e.date),
        { text: HISTORY_STATE_LABELS[e.state], tone: HISTORY_STATE_TONES[e.state] },
        e.state === 'PRESENT' || e.state === 'LATE' ? (e.manual ? 'Manual' : 'Código QR') : '---',
        e.note,
      ]),
      { emptyMessage: 'Aún no hay clases dictadas en esta materia.' }
    )
  }

  return pdf.save()
}
