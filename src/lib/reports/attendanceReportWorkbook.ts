/**
 * Libro Excel del reporte de asistencia por corte (RF31, solo coordinación):
 * hojas Estudiantes, Resumen por materia, Docentes, Observaciones y excusas
 * e Información, con la celda de estado semaforizada (RF35). Reusa
 * buildWorkbook (encabezado navy institucional + neutralización de
 * fórmulas) y solo agrega estilos de columna.
 */
import type ExcelJS from 'exceljs'
import { buildWorkbook, type ExportSheet } from '@/lib/excel/exportWorkbook'
import { INSTITUTION_NAME } from '@/lib/brand'
import type { AttendanceReport } from './attendanceReport'
import { COUNTED_ABSENCES_NOTE, formatDateEs, formatGeneratedAt } from './pdf/format'

export interface WorkbookMeta {
  periodName: string
  scopeLabel: string
  filtersLabel?: string
  generatedAt?: Date
}

type StatusKey = 'Normal' | 'En riesgo' | 'Perdida por fallas'

/** Colores de celda del semáforo: verde / ámbar / rojo (ARGB). */
const STATUS_FILLS: Record<StatusKey, { bg: string; fg: string }> = {
  Normal: { bg: 'FFC6EFCE', fg: 'FF006100' },
  'En riesgo': { bg: 'FFFFEB9C', fg: 'FF9C5700' },
  'Perdida por fallas': { bg: 'FFFFC7CE', fg: 'FF9C0006' },
}

function paintStatusColumn(sheet: ExcelJS.Worksheet, columnKey: string) {
  const column = sheet.getColumn(columnKey)
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const cell = row.getCell(column.number)
    const style = STATUS_FILLS[String(cell.value) as StatusKey]
    if (!style) return
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.bg } }
    cell.font = { bold: true, color: { argb: style.fg } }
  })
}

function finishSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  if (sheet.columnCount > 0 && sheet.rowCount > 1) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    }
  }
}

export async function buildAttendanceReportWorkbook(
  report: AttendanceReport,
  meta: WorkbookMeta
): Promise<ExcelJS.Workbook> {
  const students: ExportSheet = {
    name: 'Estudiantes',
    columns: [
      { header: 'Carrera', key: 'career', width: 28 },
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 28 },
      { header: 'Docente', key: 'professorName', width: 26 },
      { header: 'Código Estudiante', key: 'studentCode', width: 18 },
      { header: 'Estudiante', key: 'studentName', width: 30 },
      { header: 'Clases Dictadas', key: 'sessionsHeld', width: 15 },
      { header: 'Presentes', key: 'present', width: 11 },
      { header: 'Tardanzas', key: 'late', width: 11 },
      { header: 'Justificadas', key: 'justified', width: 13 },
      { header: 'Faltas Contadas', key: 'countedAbsences', width: 15 },
      { header: '% Asistencia', key: 'attendancePct', width: 13 },
      { header: '% Inasistencia', key: 'absencePct', width: 14 },
      { header: 'Estado', key: 'status', width: 20 },
      { header: 'Observaciones', key: 'observations', width: 50 },
      { header: 'Excusas', key: 'excuses', width: 50 },
    ],
    rows: report.rows.map((r) => ({
      career: r.career,
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      professorName: r.professorName,
      studentCode: r.studentCode,
      studentName: r.studentName,
      sessionsHeld: r.sessionsHeld,
      present: r.present,
      late: r.late,
      justified: r.justified,
      countedAbsences: r.countedAbsences,
      attendancePct: r.attendancePct ?? '',
      absencePct: r.absencePct ?? '',
      status: r.statusLabel,
      observations: r.observations
        .map(
          (o) =>
            `${formatDateEs(o.date)} (${o.status === 'LATE' ? 'tarde' : 'presente'}): ${o.reason}`
        )
        .join('; '),
      excuses: r.excuses.map((e) => `${formatDateEs(e.date)}: ${e.reason}`).join('; '),
    })),
  }

  const subjects: ExportSheet = {
    name: 'Resumen por materia',
    columns: [
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      { header: 'Carrera', key: 'career', width: 28 },
      { header: 'Docente', key: 'professorName', width: 26 },
      { header: 'Inscritos', key: 'enrolled', width: 11 },
      { header: 'Clases Dictadas', key: 'sessionsHeld', width: 15 },
      { header: 'Clases Suspendidas', key: 'sessionsSuspended', width: 18 },
      { header: 'Reposiciones', key: 'makeups', width: 14 },
      { header: '% Asistencia Promedio', key: 'avgAttendancePct', width: 21 },
      { header: 'Normal', key: 'normal', width: 10 },
      { header: 'En Riesgo', key: 'atRisk', width: 11 },
      { header: 'Perdida por Fallas', key: 'failed', width: 18 },
    ],
    rows: report.subjectSummaries.map((s) => ({
      subjectCode: s.subjectCode,
      subjectName: s.subjectName,
      career: s.career,
      professorName: s.professorName,
      enrolled: s.enrolled,
      sessionsHeld: s.sessionsHeld,
      sessionsSuspended: s.sessionsSuspended,
      makeups: s.makeups,
      avgAttendancePct: s.avgAttendancePct ?? '',
      normal: s.normal,
      atRisk: s.atRisk,
      failed: s.failed,
    })),
  }

  const professors: ExportSheet = {
    name: 'Docentes',
    columns: [
      { header: 'Docente', key: 'professorName', width: 28 },
      { header: 'Materias', key: 'subjects', width: 50 },
      { header: 'Clases Programadas', key: 'scheduled', width: 19 },
      { header: 'Clases Dictadas', key: 'held', width: 16 },
      { header: 'Clases Suspendidas', key: 'suspended', width: 18 },
      { header: 'No Registradas', key: 'notRegistered', width: 16 },
      { header: 'No Registradas Justificadas', key: 'notRegisteredJustified', width: 26 },
      { header: '% Cumplimiento', key: 'compliancePct', width: 16 },
      { header: 'Materias sin Horario', key: 'withoutSchedule', width: 19 },
    ],
    rows: report.professors.map((p) => ({
      professorName: p.professorName,
      subjects: p.subjects.join('; '),
      scheduled: p.scheduled,
      held: p.held,
      suspended: p.suspended,
      notRegistered: p.notRegistered,
      notRegisteredJustified: p.notRegisteredJustified,
      compliancePct: p.compliancePct ?? '',
      withoutSchedule: p.subjectsWithoutSchedule,
    })),
  }

  const annexRows = report.rows
    .flatMap((r) => [
      ...r.observations.map((o) => ({
        date: o.date,
        r,
        type: 'Marca manual',
        detail: `${o.status === 'LATE' ? 'Tarde' : 'Presente'}: ${o.reason}`,
      })),
      ...r.excuses.map((e) => ({ date: e.date, r, type: 'Excusa aprobada', detail: e.reason })),
    ])
    .sort((a, b) => a.date.localeCompare(b.date))
  const annex: ExportSheet = {
    name: 'Observaciones y excusas',
    columns: [
      { header: 'Fecha', key: 'date', width: 13 },
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 28 },
      { header: 'Código Estudiante', key: 'studentCode', width: 18 },
      { header: 'Estudiante', key: 'studentName', width: 30 },
      { header: 'Tipo', key: 'type', width: 17 },
      { header: 'Detalle', key: 'detail', width: 60 },
    ],
    rows: annexRows.map((a) => ({
      date: formatDateEs(a.date),
      subjectCode: a.r.subjectCode,
      subjectName: a.r.subjectName,
      studentCode: a.r.studentCode,
      studentName: a.r.studentName,
      type: a.type,
      detail: a.detail,
    })),
  }

  const info: ExportSheet = {
    name: 'Información',
    columns: [
      { header: 'Campo', key: 'field', width: 26 },
      { header: 'Valor', key: 'value', width: 60 },
    ],
    rows: [
      { field: 'Institución', value: INSTITUTION_NAME },
      { field: 'Período', value: meta.periodName },
      { field: 'Alcance', value: meta.scopeLabel },
      ...(meta.filtersLabel ? [{ field: 'Filtros', value: meta.filtersLabel }] : []),
      { field: 'Generado (hora de Bogotá)', value: formatGeneratedAt(meta.generatedAt) },
      { field: 'Faltas contadas', value: COUNTED_ABSENCES_NOTE },
      {
        field: 'Nota',
        value:
          'El estado (Normal, En riesgo, Perdida por fallas) se calcula sobre todo el semestre; los conteos y porcentajes corresponden al alcance del reporte.',
      },
    ],
  }

  const workbook = await buildWorkbook([students, subjects, professors, annex, info])
  const studentsSheet = workbook.getWorksheet('Estudiantes')
  if (studentsSheet) paintStatusColumn(studentsSheet, 'status')
  const infoSheet = workbook.getWorksheet('Información')
  if (infoSheet) {
    infoSheet.getColumn('value').alignment = { wrapText: true, vertical: 'top' }
    infoSheet.getColumn('field').alignment = { vertical: 'top' }
  }
  workbook.eachSheet((sheet) => finishSheet(sheet))
  return workbook
}
