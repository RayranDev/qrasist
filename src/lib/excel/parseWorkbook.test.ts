import { describe, it, expect } from 'vitest'
import { parseWorkbookRows } from './parseWorkbook'
import { addTable, xlsxFile } from './workbookTestUtils'

const HEADERS = ['Nombres', 'Correo', 'Código']
const OPTIONS = { required: HEADERS }

describe('parseWorkbookRows — cell values', () => {
  it('unwraps an auto-hyperlinked email instead of returning "[object Object]"', async () => {
    const file = await xlsxFile((wb) => {
      const sheet = addTable(wb, 'Datos', HEADERS, [{ Nombres: 'Ana' }])
      sheet.getCell('B2').value = {
        text: 'ana@urepublicana.edu.co',
        hyperlink: 'mailto:ana@urepublicana.edu.co',
      }
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows[0]['Correo']).toBe('ana@urepublicana.edu.co')
  })

  it('uses the calculated result of a formula cell', async () => {
    const file = await xlsxFile((wb) => {
      const sheet = addTable(wb, 'Datos', HEADERS, [{ Nombres: 'Ana' }])
      sheet.getCell('B2').value = { formula: 'LOWER("ANA@X.CO")', result: 'ana@x.co' }
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows[0]['Correo']).toBe('ana@x.co')
  })

  it('concatenates rich text runs', async () => {
    const file = await xlsxFile((wb) => {
      const sheet = addTable(wb, 'Datos', HEADERS, [{ Código: '1' }])
      sheet.getCell('A2').value = {
        richText: [{ text: 'Juan ' }, { text: 'Pérez', font: { bold: true } }],
      }
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows[0]['Nombres']).toBe('Juan Pérez')
  })

  it('turns a numeric code into a plain digit string', async () => {
    const file = await xlsxFile((wb) => {
      addTable(wb, 'Datos', HEADERS, [{ Nombres: 'Ana', Código: 202512345678 }])
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows[0]['Código']).toBe('202512345678')
  })

  it('restores leading zeros of a numeric cell using its zero-padded number format', async () => {
    const file = await xlsxFile((wb) => {
      const sheet = addTable(wb, 'Datos', HEADERS, [{ Nombres: 'Ana', Código: 123456789 }])
      sheet.getCell('C2').numFmt = '0000000000'
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows[0]['Código']).toBe('0123456789')
  })

  it('keeps leading zeros of a text cell', async () => {
    const file = await xlsxFile((wb) => {
      addTable(wb, 'Datos', HEADERS, [{ Nombres: 'Ana', Código: '0012' }])
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows[0]['Código']).toBe('0012')
  })

  it('trims whitespace, including non-breaking spaces', async () => {
    const file = await xlsxFile((wb) => {
      addTable(wb, 'Datos', HEADERS, [{ Nombres: '  Ana  ', Código: '1' }])
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows[0]['Nombres']).toBe('Ana')
  })

  it('treats an Excel error value as empty', async () => {
    const file = await xlsxFile((wb) => {
      const sheet = addTable(wb, 'Datos', HEADERS, [{ Nombres: 'Ana', Código: '1' }])
      sheet.getCell('B2').value = { error: '#N/A' }
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows[0]['Correo']).toBe('')
  })
})

describe('parseWorkbookRows — headers and sheets', () => {
  it('matches headers ignoring case, accents and surrounding spaces, returning canonical keys', async () => {
    const file = await xlsxFile((wb) => {
      addTable(
        wb,
        'Datos',
        [' NOMBRES ', 'correo', 'CODIGO'],
        [{ ' NOMBRES ': 'Ana', correo: 'a@x.co', CODIGO: '7' }]
      )
    })
    const parsed = await parseWorkbookRows(file, OPTIONS)
    expect(parsed.missingHeaders).toEqual([])
    expect(parsed.rows).toEqual([{ Nombres: 'Ana', Correo: 'a@x.co', Código: '7' }])
  })

  it('never parses a hidden sheet, even if it comes first and has matching headers', async () => {
    const file = await xlsxFile((wb) => {
      const hidden = addTable(wb, 'Listas', HEADERS, [
        { Nombres: 'FANTASMA', Correo: 'x@x.co', Código: '0' },
      ])
      hidden.state = 'hidden'
      addTable(wb, 'Estudiantes', HEADERS, [{ Nombres: 'Real', Correo: 'r@x.co', Código: '1' }])
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows.map((r) => r['Nombres'])).toEqual(['Real'])
  })

  it('reports every required header as missing when the only matching sheet is hidden', async () => {
    const file = await xlsxFile((wb) => {
      const hidden = addTable(wb, 'Listas', HEADERS, [{ Nombres: 'x', Correo: 'x', Código: '0' }])
      hidden.state = 'veryHidden'
      addTable(wb, 'Vacía', ['Otra'], [])
    })
    const parsed = await parseWorkbookRows(file, OPTIONS)
    expect(parsed.rows).toEqual([])
    expect(parsed.missingHeaders).toEqual(HEADERS)
  })

  it('picks the sheet that carries the expected headers, not blindly the first one', async () => {
    const file = await xlsxFile((wb) => {
      addTable(wb, 'Instrucciones', ['Paso', 'Detalle'], [{ Paso: '1', Detalle: 'Llena' }])
      addTable(wb, 'Datos', HEADERS, [{ Nombres: 'Ana', Correo: 'a@x.co', Código: '1' }])
    })
    const { rows } = await parseWorkbookRows(file, OPTIONS)
    expect(rows).toHaveLength(1)
    expect(rows[0]['Nombres']).toBe('Ana')
  })

  it('lists the missing required headers and returns no rows', async () => {
    const file = await xlsxFile((wb) => {
      addTable(wb, 'Datos', ['Nombres', 'Correo'], [{ Nombres: 'Ana', Correo: 'a@x.co' }])
    })
    const parsed = await parseWorkbookRows(file, OPTIONS)
    expect(parsed.missingHeaders).toEqual(['Código'])
    expect(parsed.rows).toEqual([])
  })

  it('fills absent optional columns with an empty string', async () => {
    const file = await xlsxFile((wb) => {
      addTable(wb, 'Datos', HEADERS, [{ Nombres: 'Ana', Correo: 'a@x.co', Código: '1' }])
    })
    const { rows } = await parseWorkbookRows(file, { ...OPTIONS, optional: ['Carrera'] })
    expect(rows[0]['Carrera']).toBe('')
  })
})

describe('parseWorkbookRows — rows', () => {
  it('skips empty rows but reports the real sheet row number of the rest', async () => {
    const file = await xlsxFile((wb) => {
      addTable(wb, 'Datos', HEADERS, [
        { Nombres: 'Ana', Correo: 'a@x.co', Código: '1' },
        {},
        { Nombres: 'Luis', Correo: 'l@x.co', Código: '2' },
      ])
    })
    const parsed = await parseWorkbookRows(file, OPTIONS)
    expect(parsed.rows.map((r) => r['Nombres'])).toEqual(['Ana', 'Luis'])
    expect(parsed.rowNumbers).toEqual([2, 4])
  })

  it('stops and flags truncation when there are more rows than maxRows', async () => {
    const file = await xlsxFile((wb) => {
      addTable(
        wb,
        'Datos',
        HEADERS,
        Array.from({ length: 4 }, (_, i) => ({
          Nombres: `N${i}`,
          Correo: 'a@x.co',
          Código: `${i}`,
        }))
      )
    })
    const exact = await parseWorkbookRows(file, { ...OPTIONS, maxRows: 4 })
    expect(exact.truncated).toBe(false)
    expect(exact.rows).toHaveLength(4)

    const over = await parseWorkbookRows(file, { ...OPTIONS, maxRows: 3 })
    expect(over.truncated).toBe(true)
    expect(over.rows).toHaveLength(3)
  })
})
