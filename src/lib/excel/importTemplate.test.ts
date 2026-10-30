import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildImportTemplate, LISTS_SHEET_NAME } from './importTemplate'
import { isExampleRow, MAX_IMPORT_ROWS } from './importSchemas'
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

  it('points each enrollment column at its own Listas column', async () => {
    const workbook = await buildImportTemplate('ENROLLMENT', {
      subjects: ['ALG-201 — Álgebra Lineal', 'FIS-101 — Física I'],
      students: ['202500000001 — Ana Torres'],
    })
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
    const sheet = loaded.getWorksheet('Inscripciones')!
    const lists = loaded.getWorksheet(LISTS_SHEET_NAME)!

    expect(sheet.getCell('A2').dataValidation.formulae).toEqual([`${LISTS_SHEET_NAME}!$A$2:$A$3`])
    expect(sheet.getCell('B2').dataValidation.formulae).toEqual([`${LISTS_SHEET_NAME}!$B$2:$B$2`])
    expect(sheet.getCell(`B${MAX_IMPORT_ROWS + 1}`).dataValidation.type).toBe('list')
    expect(lists.getCell('A1').value).toBe('Materias')
    expect(lists.getCell('B1').value).toBe('Estudiantes')
    expect(lists.getCell('A2').value).toBe('ALG-201 — Álgebra Lineal')
    expect(lists.state).toBe('hidden')
  })

  it('points the professor email column of the subject template at the professors list', async () => {
    const workbook = await buildImportTemplate('SUBJECT', {
      ...LISTS,
      professors: ['a@urepublicana.edu.co', 'b@urepublicana.edu.co', 'c@urepublicana.edu.co'],
    })
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
    const sheet = loaded.getWorksheet('Materias')!

    // Columnas de Listas: A carreras, B períodos, C profesores.
    expect(sheet.getCell('E2').dataValidation.formulae).toEqual([`${LISTS_SHEET_NAME}!$C$2:$C$4`])
    expect(loaded.getWorksheet(LISTS_SHEET_NAME)!.getCell('C1').value).toBe('Profesores')
  })

  it('skips the validation of a column whose list is empty, keeping the others', async () => {
    const workbook = await buildImportTemplate('SUBJECT', { ...LISTS, professors: [] })
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
    const sheet = loaded.getWorksheet('Materias')!

    expect(sheet.getCell('E2').dataValidation).toBeUndefined()
    expect(sheet.getCell('C2').dataValidation.type).toBe('list')
  })

  it('keeps the enrollment example row on fixed placeholders that isExampleRow detects', async () => {
    const workbook = await buildImportTemplate('ENROLLMENT', {
      subjects: ['ALG-201 — Álgebra Lineal'],
      students: ['202500000001 — Ana Torres'],
    })
    const sheet = workbook.getWorksheet('Inscripciones')!
    const row = {
      'Código Materia': String(sheet.getCell('A2').value),
      'Código Estudiante': String(sheet.getCell('B2').value),
    }

    expect(row).toEqual({ 'Código Materia': 'CALC-101', 'Código Estudiante': '202512345678' })
    expect(isExampleRow('ENROLLMENT', row)).toBe(true)
    // Una fila real elegida de las listas nunca se confunde con la de ejemplo.
    expect(
      isExampleRow('ENROLLMENT', {
        'Código Materia': 'ALG-201 — Álgebra Lineal',
        'Código Estudiante': '202500000001 — Ana Torres',
      })
    ).toBe(false)
  })

  it('skips the dropdown when there are no active careers, but not when there are', async () => {
    const roundTripWith = async (careers: string[]) => {
      const workbook = await buildImportTemplate('STUDENT', { careers, periods: [] })
      const loaded = new ExcelJS.Workbook()
      await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
      return loaded
    }

    const empty = await roundTripWith([])
    expect(empty.getWorksheet('Estudiantes')!.getCell('F2').dataValidation).toBeUndefined()

    const filled = await roundTripWith(['Derecho'])
    const validation = filled.getWorksheet('Estudiantes')!.getCell('F2').dataValidation
    expect(validation.type).toBe('list')
    expect(validation.formulae).toEqual([`${LISTS_SHEET_NAME}!$A$2:$A$2`])
    expect(filled.getWorksheet(LISTS_SHEET_NAME)!.state).toBe('hidden')
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
