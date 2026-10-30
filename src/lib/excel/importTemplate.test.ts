import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildImportTemplate, LISTS_SHEET_NAME } from './importTemplate'
import { MAX_IMPORT_ROWS } from './importSchemas'
import { parseWorkbookRows } from './parseWorkbook'

const LISTS = {
  careers: ['Derecho', 'Ingeniería de Sistemas'],
  periods: ['2026-2', '2026-1'],
}

/** Lo escribe y lo vuelve a leer, como lo recibiría Excel al descargarlo. */
async function roundTrip(type: Parameters<typeof buildImportTemplate>[0]) {
  const workbook = await buildImportTemplate(type, LISTS)
  const buffer = await workbook.xlsx.writeBuffer()
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(buffer)
  return { loaded, buffer }
}

describe('buildImportTemplate', () => {
  it('adds a career dropdown to the student template that points at the hidden sheet range', async () => {
    const { loaded } = await roundTrip('STUDENT')
    const sheet = loaded.getWorksheet('Estudiantes')!

    // Carrera es la 6.ª columna (F), de la fila 2 a la última fila permitida.
    for (const address of ['F2', `F${MAX_IMPORT_ROWS + 1}`]) {
      expect(sheet.getCell(address).dataValidation).toMatchObject({
        type: 'list',
        allowBlank: true,
        formulae: [`${LISTS_SHEET_NAME}!$A$2:$A$3`],
      })
    }
    expect(sheet.getCell('E2').dataValidation?.type).toBeUndefined()
  })

  it('keeps the careers on a hidden sheet instead of an inline comma list', async () => {
    const { loaded } = await roundTrip('PROFESSOR')
    const lists = loaded.getWorksheet(LISTS_SHEET_NAME)!

    expect(lists.state).toBe('hidden')
    expect(lists.getColumn(1).values).toEqual([
      undefined,
      'Carreras',
      'Derecho',
      'Ingeniería de Sistemas',
    ])
    expect(loaded.getWorksheet('Docentes')!.state).toBe('visible')
  })

  it('gives the subject template dropdowns for both career and period', async () => {
    const { loaded } = await roundTrip('SUBJECT')
    const sheet = loaded.getWorksheet('Materias')!
    const lists = loaded.getWorksheet(LISTS_SHEET_NAME)!

    expect(sheet.getCell('C2').dataValidation.formulae).toEqual([`${LISTS_SHEET_NAME}!$A$2:$A$3`])
    expect(sheet.getCell('F2').dataValidation.formulae).toEqual([`${LISTS_SHEET_NAME}!$B$2:$B$3`])
    expect(lists.getColumn(2).values).toEqual([undefined, 'Períodos', '2026-2', '2026-1'])
    expect(lists.state).toBe('hidden')
  })

  it('formats code and password columns as text so leading zeros survive', async () => {
    const { loaded } = await roundTrip('STUDENT')
    const sheet = loaded.getWorksheet('Estudiantes')!

    expect(sheet.getCell('D5').numFmt).toBe('@')
    expect(sheet.getCell('E5').numFmt).toBe('@')
    expect(sheet.getCell('A5').numFmt).not.toBe('@')
  })

  it('uses a real career as the example row value', async () => {
    const { loaded } = await roundTrip('STUDENT')
    expect(loaded.getWorksheet('Estudiantes')!.getCell('F2').value).toBe('Derecho')
  })

  it('has no lists sheet nor dropdowns when the template needs none', async () => {
    const { loaded } = await roundTrip('ENROLLMENT')
    expect(loaded.getWorksheet(LISTS_SHEET_NAME)).toBeUndefined()
    expect(loaded.getWorksheet('Inscripciones')!.getCell('A2').dataValidation?.type).toBeUndefined()
  })

  it('skips the dropdown when there are no active careers', async () => {
    const workbook = await buildImportTemplate('STUDENT', { careers: [], periods: [] })
    expect(workbook.getWorksheet('Estudiantes')!.getCell('F2').dataValidation?.type).toBeUndefined()
  })

  it('produces a file the importer accepts, ignoring the hidden lists sheet', async () => {
    const { buffer } = await roundTrip('STUDENT')
    const file = new File([buffer as ArrayBuffer], 'plantilla.xlsx')

    const parsed = await parseWorkbookRows(file, {
      required: ['Nombres', 'Apellidos', 'Correo', 'Contraseña', 'Código'],
      optional: ['Carrera'],
    })

    expect(parsed.missingHeaders).toEqual([])
    expect(parsed.rows).toHaveLength(1) // solo la fila de ejemplo, nunca las filas de Listas
    expect(parsed.rows[0]['Carrera']).toBe('Derecho')
  })
})
