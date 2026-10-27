/**
 * Libros Excel del reporte de un usuario (estudiante o docente) para
 * coordinación. Reusan buildWorkbook (encabezado navy + neutralización de
 * fórmulas).
 */
import type ExcelJS from 'exceljs'
import { buildWorkbook, type ExportSheet } from '@/lib/excel/exportWorkbook'
import { INSTITUTION_NAME } from '@/lib/brand'
import { formatBogotaTime } from '@/lib/utils/bogotaDay'
import { cutPercentCell } from './cutColumns'
import type { StudentSubjectHistory } from './attendanceReport'
import type { ProfessorUserReport } from './professorUserReport'
import {
  COUNTED_ABSENCES_NOTE,
  HISTORY_STATE_LABELS,
  formatDateEs,
  formatGeneratedAt,
} from './pdf/format'

export const CLASS_STATE_LABELS = {
  HELD: 'Dictada',
  SUSPENDED: 'Suspendida',
  ARCHIVED: 'Archivada',
} as const

function infoSheet(rows: { field: string; value: string }[]): ExportSheet {
  return {
    name: 'Información',
    columns: [
      { header: 'Campo', key: 'field', width: 26 },
      { header: 'Valor', key: 'value', width: 60 },
    ],
    rows,
  }
}

function finish(workbook: ExcelJS.Workbook) {
  const info = workbook.getWorksheet('Información')
  if (info) {
    info.getColumn('value').alignment = { wrapText: true, vertical: 'top' }
    info.getColumn('field').alignment = { vertical: 'top' }
  }
  workbook.eachSheet((sheet) => {
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    if (sheet.columnCount > 0 && sheet.rowCount > 1) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columnCount },
      }
    }
  })
  return workbook
}

export interface StudentWorkbookMeta {
  studentName: string
  studentCode: string | null
  scopeLabel: string
  /** El reporte está acotado a un rango de fechas (los cortes siguen siendo semestrales). */
  ranged?: boolean
  generatedAt?: Date
}

/** Etiqueta de la fila general que cierra el desglose por corte de una materia. */
function generalRowLabel(ranged: boolean | undefined): string {
  return ranged ? 'General (rango)' : 'General (período)'
}

/** Historial del estudiante: resumen por materia (con ausencias y %) y detalle por clase. */
export async function buildStudentUserWorkbook(
  history: StudentSubjectHistory[],
  meta: StudentWorkbookMeta
): Promise<ExcelJS.Workbook> {
  const summary: ExportSheet = {
    name: 'Resumen por materia',
    columns: [
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      { header: 'Docente', key: 'professorName', width: 26 },
      { header: 'Clases Dictadas', key: 'sessionsHeld', width: 15 },
      { header: 'Presentes', key: 'present', width: 11 },
      { header: 'Tardanzas', key: 'late', width: 11 },
      { header: 'Justificadas', key: 'justified', width: 13 },
      { header: 'Faltas Contadas', key: 'countedAbsences', width: 15 },
      { header: 'Máx. Faltas', key: 'maxAbsencesAllowed', width: 13 },
      { header: '% Asistencia', key: 'attendancePct', width: 13 },
      { header: 'Estado (semestral)', key: 'status', width: 20 },
    ],
    rows: history.map((h) => ({
      subjectCode: h.subjectCode,
      subjectName: h.subjectName,
      professorName: h.professorName,
      sessionsHeld: h.sessionsHeld,
      present: h.attended - h.late,
      late: h.late,
      justified: h.justified,
      countedAbsences: h.countedAbsences,
      maxAbsencesAllowed: h.maxAbsencesAllowed,
      attendancePct: h.attendancePct ?? '',
      status: h.statusLabel,
    })),
  }

  // Solo las materias con cortes: cada corte y después la fila general.
  const withCuts = history.filter((h) => h.cuts.length > 0)
  const byCut: ExportSheet = {
    name: 'Resumen por corte',
    columns: [
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      { header: 'Corte', key: 'cut', width: 22 },
      { header: 'Clases', key: 'sessionsHeld', width: 11 },
      { header: 'Asistidas', key: 'attended', width: 12 },
      { header: 'Tardanzas', key: 'late', width: 11 },
      { header: 'Justificadas', key: 'justified', width: 13 },
      { header: '% Asistencia', key: 'attendancePct', width: 13 },
    ],
    rows: withCuts.flatMap((h) => [
      ...h.cuts.map((c) => ({
        subjectCode: h.subjectCode,
        subjectName: h.subjectName,
        cut: c.name,
        sessionsHeld: c.sessionsHeld,
        attended: c.attended,
        late: c.late,
        justified: c.justified,
        attendancePct: cutPercentCell(c),
      })),
      {
        subjectCode: h.subjectCode,
        subjectName: h.subjectName,
        cut: generalRowLabel(meta.ranged),
        sessionsHeld: h.sessionsHeld,
        attended: h.attended,
        late: h.late,
        justified: h.justified,
        attendancePct: h.attendancePct ?? '',
      },
    ]),
  }

  const detail: ExportSheet = {
    name: 'Detalle',
    columns: [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      { header: 'Estado', key: 'state', width: 16 },
      { header: 'Registro', key: 'source', width: 12 },
      { header: 'Observación', key: 'note', width: 50 },
    ],
    rows: history.flatMap((h) =>
      h.entries.map((e) => ({
        date: formatDateEs(e.date),
        subjectCode: h.subjectCode,
        subjectName: h.subjectName,
        state: HISTORY_STATE_LABELS[e.state],
        source:
          e.state === 'PRESENT' || e.state === 'LATE' ? (e.manual ? 'Manual' : 'Código QR') : '',
        note: e.note,
      }))
    ),
  }

  const info = infoSheet([
    { field: 'Institución', value: INSTITUTION_NAME },
    {
      field: 'Estudiante',
      value: `${meta.studentName}${meta.studentCode ? ` (${meta.studentCode})` : ''}`,
    },
    { field: 'Alcance', value: meta.scopeLabel },
    { field: 'Generado (hora de Bogotá)', value: formatGeneratedAt(meta.generatedAt) },
    { field: 'Faltas contadas', value: COUNTED_ABSENCES_NOTE },
    {
      field: 'Nota',
      value:
        'El estado se calcula sobre todo el semestre; los conteos y el porcentaje corresponden al alcance del reporte. Las clases suspendidas no cuentan como dictadas.',
    },
    ...(withCuts.length > 0
      ? [
          {
            field: 'Cortes',
            value:
              'En "Resumen por corte", cada corte muestra la asistencia de ese corte sobre todo el semestre y la fila "General" cierra la materia con el total del alcance del reporte. Las materias sin cortes definidos solo aparecen en "Resumen por materia".',
          },
        ]
      : []),
  ])
  return finish(
    await buildWorkbook(
      withCuts.length > 0 ? [summary, byCut, detail, info] : [summary, detail, info]
    )
  )
}

export interface ProfessorWorkbookMeta {
  professorName: string
  scopeLabel: string
  /** El reporte está acotado a un rango de fechas (los cortes siguen siendo semestrales). */
  ranged?: boolean
  generatedAt?: Date
}

/** Docente: resumen por materia (dictadas / suspendidas / sin registrar) y asistentes por clase. */
export async function buildProfessorUserWorkbook(
  report: ProfessorUserReport,
  meta: ProfessorWorkbookMeta
): Promise<ExcelJS.Workbook> {
  const summary: ExportSheet = {
    name: 'Resumen por materia',
    columns: [
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      { header: 'Período', key: 'periodName', width: 14 },
      { header: 'Inscritos', key: 'enrolled', width: 11 },
      { header: 'Clases Programadas', key: 'scheduled', width: 19 },
      { header: 'Clases Dictadas', key: 'held', width: 15 },
      { header: 'Clases Suspendidas', key: 'suspended', width: 18 },
      { header: 'No Registradas', key: 'omitted', width: 16 },
      { header: 'No Registradas Justificadas', key: 'omittedJustified', width: 26 },
      { header: '% Asistencia Promedio', key: 'avgAttendancePct', width: 21 },
    ],
    rows: report.subjects.map((s) => ({
      ...s,
      scheduled: s.scheduled ?? 'Sin horario',
      omitted: s.omitted ?? '',
      omittedJustified: s.omittedJustified ?? '',
      avgAttendancePct: s.avgAttendancePct ?? '',
    })),
  }

  // Solo las materias con cortes: cada corte y después la fila general.
  const withCuts = report.subjects.filter((s) => s.cuts.length > 0)
  const byCut: ExportSheet = {
    name: 'Resumen por corte',
    columns: [
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      { header: 'Corte', key: 'cut', width: 22 },
      { header: 'Clases Programadas', key: 'scheduled', width: 19 },
      { header: 'Clases Dictadas', key: 'held', width: 15 },
      { header: 'Clases Suspendidas', key: 'suspended', width: 18 },
      { header: 'No Registradas', key: 'omitted', width: 16 },
      { header: 'No Registradas Justificadas', key: 'omittedJustified', width: 26 },
      { header: '% Asistencia Promedio', key: 'avgAttendancePct', width: 21 },
    ],
    rows: withCuts.flatMap((s) => [
      ...s.cuts.map((c) => ({
        subjectCode: s.subjectCode,
        subjectName: s.subjectName,
        cut: c.name,
        scheduled: c.scheduled ?? 'Sin horario',
        held: c.held,
        suspended: c.suspended,
        omitted: c.omitted ?? '',
        omittedJustified: c.omittedJustified ?? '',
        avgAttendancePct: c.avgAttendancePct ?? '',
      })),
      {
        subjectCode: s.subjectCode,
        subjectName: s.subjectName,
        cut: generalRowLabel(meta.ranged),
        scheduled: s.scheduled ?? 'Sin horario',
        held: s.held,
        suspended: s.suspended,
        omitted: s.omitted ?? '',
        omittedJustified: s.omittedJustified ?? '',
        avgAttendancePct: s.avgAttendancePct ?? '',
      },
    ]),
  }

  const classes: ExportSheet = {
    name: 'Clases',
    columns: [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Hora', key: 'time', width: 12 },
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      { header: 'Estado', key: 'state', width: 14 },
      { header: 'Modalidad', key: 'modality', width: 13 },
      { header: 'Reposición', key: 'isMakeup', width: 12 },
      { header: 'Asistentes', key: 'attendees', width: 12 },
      { header: 'Inscritos', key: 'enrolled', width: 11 },
      { header: 'Nota', key: 'note', width: 40 },
    ],
    rows: report.classes.map((c) => ({
      date: formatDateEs(c.date),
      time: formatBogotaTime(c.date),
      subjectCode: c.subjectCode,
      subjectName: c.subjectName,
      state: CLASS_STATE_LABELS[c.state],
      modality:
        c.modality === 'VIRTUAL' ? 'Virtual' : c.modality === 'PRESENCIAL' ? 'Presencial' : '',
      isMakeup: c.isMakeup ? 'Sí' : 'No',
      attendees: c.state === 'HELD' ? c.attendees : '',
      enrolled: c.enrolled,
      note: c.note,
    })),
  }

  const info = infoSheet([
    { field: 'Institución', value: INSTITUTION_NAME },
    { field: 'Docente', value: meta.professorName },
    { field: 'Alcance', value: meta.scopeLabel },
    { field: 'Generado (hora de Bogotá)', value: formatGeneratedAt(meta.generatedAt) },
    {
      field: 'Nota',
      value:
        'Las clases no registradas son días de clase esperados según el horario sin ninguna sesión. Los asistentes cuentan solo a los estudiantes inscritos actualmente.',
    },
    ...(withCuts.length > 0
      ? [
          {
            field: 'Cortes',
            value:
              'En "Resumen por corte", cada corte muestra las clases de ese corte sobre todo el semestre y la fila "General" cierra la materia con el total del alcance del reporte. Las materias sin cortes definidos solo aparecen en "Resumen por materia".',
          },
        ]
      : []),
  ])
  return finish(
    await buildWorkbook(
      withCuts.length > 0 ? [summary, byCut, classes, info] : [summary, classes, info]
    )
  )
}
