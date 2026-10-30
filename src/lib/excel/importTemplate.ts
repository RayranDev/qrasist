import type ExcelJS from 'exceljs'
import { buildWorkbook, type ExportSheet } from './exportWorkbook'
import {
  IMPORT_SCHEMA,
  MAX_IMPORT_ROWS,
  type ImportListSource,
  type ImportType,
} from './importSchemas'

/** Hoja oculta con los valores activos que alimentan las listas desplegables. */
export const LISTS_SHEET_NAME = 'Listas'

/** Valores por fuente; una fuente ausente o vacía no genera lista desplegable. */
export type ImportTemplateLists = Partial<Record<ImportListSource, string[]>>

const LIST_HEADERS: Record<ImportListSource, string> = {
  careers: 'Carreras',
  periods: 'Períodos',
  professors: 'Profesores',
  subjects: 'Materias',
  students: 'Estudiantes',
}

// Orden de las columnas de la hoja oculta: cada lista en la suya.
const LIST_SOURCES: ImportListSource[] = [
  'careers',
  'periods',
  'professors',
  'subjects',
  'students',
]

function columnLetter(index: number) {
  return String.fromCharCode(65 + index) // A-F alcanzan: ninguna plantilla pasa de 6 columnas
}

/**
 * Arma la plantilla .xlsx de una carga masiva en el momento de la
 * descarga, con los valores ACTIVOS de la base: toda columna que
 * referencia datos ya existentes (carrera, período, profesor, materia,
 * estudiante) lleva una lista desplegable cuyo origen es una hoja oculta,
 * una columna por lista. Se usa un rango de celdas y no una lista escrita en la regla
 * porque Excel limita esas últimas a 255 caracteres, que unas pocas
 * carreras ya superan.
 */
export async function buildImportTemplate(
  type: ImportType,
  lists: ImportTemplateLists
): Promise<ExcelJS.Workbook> {
  const schema = IMPORT_SCHEMA[type]
  const valuesOf = (source: ImportListSource) => lists[source] ?? []
  const listColumns = schema.columns.filter((c) => c.list)
  const sources = LIST_SOURCES.filter((s) => listColumns.some((c) => c.list === s))

  // La fila de ejemplo usa un valor real de la lista para no sugerir una carrera que no
  // existe. Las columnas `identity` conservan su valor fijo: así `isExampleRow` sigue
  // reconociendo la fila de ejemplo y nunca confunde una fila con datos reales con ella.
  const exampleRow = { ...schema.exampleRow }
  for (const column of listColumns) {
    if (!column.identity) exampleRow[column.key] = valuesOf(column.list!)[0] ?? ''
  }

  const sheets: ExportSheet[] = [
    { name: schema.label, columns: schema.columns, rows: [exampleRow] },
  ]
  if (sources.length > 0) {
    const length = Math.max(...sources.map((s) => valuesOf(s).length))
    sheets.push({
      name: LISTS_SHEET_NAME,
      columns: sources.map((s) => ({ header: LIST_HEADERS[s], key: s, width: 30 })),
      rows: Array.from({ length }, (_, i) =>
        Object.fromEntries(sources.map((s) => [s, valuesOf(s)[i] ?? '']))
      ),
    })
  }

  const workbook = await buildWorkbook(sheets)
  const sheet = workbook.getWorksheet(schema.label)!

  // exceljs no tipa `dataValidations`. Se registra UN rango por columna: asignar
  // `cell.dataValidation` celda por celda hace que al guardar quede una lista de
  // rangos solapados, que Excel puede rechazar como archivo dañado.
  const validations = (
    sheet as unknown as {
      dataValidations: { add(address: string, validation: ExcelJS.DataValidation): void }
    }
  ).dataValidations
  const lastRow = MAX_IMPORT_ROWS + 1

  schema.columns.forEach((column, index) => {
    const letter = columnLetter(index)
    // Texto: Excel no se come los ceros a la izquierda de códigos y contraseñas.
    if (column.text) {
      for (let row = 2; row <= lastRow; row++) sheet.getCell(`${letter}${row}`).numFmt = '@'
    }
    const values = column.list ? valuesOf(column.list) : []
    if (values.length > 0) {
      const listLetter = columnLetter(sources.indexOf(column.list!))
      // Carreras, períodos y profesores solo admiten valores de la lista. Materias y
      // estudiantes avisan pero dejan escribir el código a secas, que el importador acepta.
      const lenient = column.list === 'subjects' || column.list === 'students'
      validations.add(`${letter}2:${letter}${lastRow}`, {
        type: 'list',
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: lenient ? 'warning' : 'stop',
        errorTitle: 'Valor no válido',
        error: lenient
          ? 'Elige un valor de la lista o escribe el código exacto.'
          : 'Elige un valor de la lista desplegable.',
        formulae: [`${LISTS_SHEET_NAME}!$${listLetter}$2:$${listLetter}$${values.length + 1}`],
      })
    }
  })

  const listsSheet = workbook.getWorksheet(LISTS_SHEET_NAME)
  if (listsSheet) listsSheet.state = 'hidden'

  return workbook
}
