/**
 * Libro Excel del reporte de asistencia por rango: hoja Detalle (una fila
 * por inscrito y clase), Resumen por materia e Información. Reusa
 * buildWorkbook (encabezado navy + neutralización de fórmulas).
 */
import type ExcelJS from 'exceljs'
import { buildWorkbook, type ExportSheet } from '@/lib/excel/exportWorkbook'
import { INSTITUTION_NAME } from '@/lib/brand'
import { formatBogotaTime } from '@/lib/utils/bogotaDay'
import { RANGE_STATUS_LABELS, type RangeReport, type RangeStatus } from './attendanceRangeReport'
import { collectCutColumns, findCut, generalHeader } from './cutColumns'
import { formatDateEs, formatGeneratedAt } from './pdf/format'

export interface RangeWorkbookMeta {
  scopeLabel: string
  filtersLabel?: string
  generatedAt?: Date
}

/** Colores de celda por estado (ARGB), alineados con el semáforo de los demás reportes. */
const STATUS_FILLS: Record<RangeStatus, { bg: string; fg: string }> = {
  PRESENT: { bg: 'FFC6EFCE', fg: 'FF006100' },
  LATE: { bg: 'FFFFEB9C', fg: 'FF9C5700' },
  ABSENT: { bg: 'FFFFC7CE', fg: 'FF9C0006' },
  JUSTIFIED: { bg: 'FFDDEBF7', fg: 'FF1F4E79' },
  SUSPENDED: { bg: 'FFEDEDED', fg: 'FF595959' },
}

export async function buildRangeWorkbook(
  report: RangeReport,
  meta: RangeWorkbookMeta
): Promise<ExcelJS.Workbook> {
  // Materias con cortes: cada corte (acotado al rango) y después el general.
  // Las materias sin cortes dejan vacías las celdas de corte (ver cutColumns.ts).
  const cutColumns = collectCutColumns(report.summary.map((s) => s.cuts))
  const hasCuts = cutColumns.length > 0
  // El rango entero es el alcance, así que el general se marca solo para no
  // confundirlo con las columnas de cada corte.
  const general = (header: string) => generalHeader(header, hasCuts, false)

  const detail: ExportSheet = {
    name: 'Detalle',
    columns: [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Hora de la Clase', key: 'classTime', width: 16 },
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      // Permite filtrar por corte en Excel; vacío si la materia no tiene cortes.
      ...(hasCuts ? [{ header: 'Corte', key: 'cutName', width: 20 }] : []),
      { header: 'Docente', key: 'professorName', width: 26 },
      { header: 'Código Estudiante', key: 'studentCode', width: 18 },
      { header: 'Estudiante', key: 'studentName', width: 30 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Hora de Registro', key: 'scannedAt', width: 16 },
    ],
    rows: report.detail.map((r) => ({
      date: formatDateEs(r.date),
      classTime: formatBogotaTime(r.sessionDate),
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      cutName: r.cutName,
      professorName: r.professorName,
      studentCode: r.studentCode,
      studentName: r.studentName,
      status: r.statusLabel,
      scannedAt: r.scannedAt ? formatBogotaTime(r.scannedAt) : '',
    })),
  }

  const summary: ExportSheet = {
    name: 'Resumen por materia',
    columns: [
      { header: 'Código Materia', key: 'subjectCode', width: 16 },
      { header: 'Materia', key: 'subjectName', width: 30 },
      { header: 'Docente', key: 'professorName', width: 26 },
      { header: 'Inscritos', key: 'enrolled', width: 11 },
      ...cutColumns.flatMap((c) => [
        { header: `${c.name} · Clases`, key: `cut:${c.key}:held`, width: 14 },
        { header: `${c.name} · Asistencias`, key: `cut:${c.key}:att`, width: 18 },
        { header: `${c.name} · % Asistencia`, key: `cut:${c.key}:pct`, width: 18 },
      ]),
      { header: general('Clases Dictadas'), key: 'sessionsHeld', width: hasCuts ? 24 : 15 },
      { header: 'Clases Suspendidas', key: 'sessionsSuspended', width: 18 },
      { header: general('Asistencias'), key: 'attendances', width: hasCuts ? 22 : 13 },
      { header: general('Tardanzas'), key: 'late', width: hasCuts ? 20 : 11 },
      { header: general('Justificadas'), key: 'justified', width: hasCuts ? 22 : 13 },
      { header: general('Ausencias'), key: 'absent', width: hasCuts ? 20 : 11 },
      { header: general('% Asistencia'), key: 'attendancePct', width: hasCuts ? 24 : 13 },
    ],
    rows: report.summary.map(({ cuts, ...s }) => ({
      ...s,
      ...Object.fromEntries(
        cutColumns.flatMap((c) => {
          const cut = findCut(cuts, c.key)
          return [
            [`cut:${c.key}:held`, cut ? cut.sessionsHeld : ''],
            [`cut:${c.key}:att`, cut ? cut.attendances : ''],
            [`cut:${c.key}:pct`, cut ? (cut.attendancePct ?? '') : ''],
          ]
        })
      ),
      attendancePct: s.attendancePct ?? '',
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
      { field: 'Rango', value: meta.scopeLabel },
      ...(meta.filtersLabel ? [{ field: 'Filtros', value: meta.filtersLabel }] : []),
      { field: 'Generado (hora de Bogotá)', value: formatGeneratedAt(meta.generatedAt) },
      {
        field: 'Nota',
        value:
          'Las ausencias se derivan de las inscripciones en las clases dictadas. Las clases suspendidas no generan ausencias y las clases en curso solo muestran a quien ya registró asistencia. El % de asistencia es asistencias / (asistencias + justificadas + ausencias).',
      },
      ...(hasCuts
        ? [
            {
              field: 'Cortes',
              value:
                'Las columnas de cada corte cuentan solo las clases del rango elegido que caen en ese corte; los cortes que no se cruzan con el rango no aparecen. Las columnas "(general)" suman todo el rango. Las clases fuera de todo corte figuran como "Sin corte asignado". Las materias sin cortes definidos solo tienen cifra general y dejan vacías las columnas de corte.',
            },
          ]
        : []),
    ],
  }

  const workbook = await buildWorkbook([detail, summary, info])

  const detailSheet = workbook.getWorksheet('Detalle')
  if (detailSheet) {
    const column = detailSheet.getColumn('status')
    const styleByLabel = new Map(
      (Object.keys(STATUS_FILLS) as RangeStatus[]).map((k) => [
        RANGE_STATUS_LABELS[k],
        STATUS_FILLS[k],
      ])
    )
    detailSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const cell = row.getCell(column.number)
      const style = styleByLabel.get(String(cell.value))
      if (!style) return
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.bg } }
      cell.font = { bold: true, color: { argb: style.fg } }
    })
  }
  const infoSheet = workbook.getWorksheet('Información')
  if (infoSheet) {
    infoSheet.getColumn('value').alignment = { wrapText: true, vertical: 'top' }
    infoSheet.getColumn('field').alignment = { vertical: 'top' }
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
