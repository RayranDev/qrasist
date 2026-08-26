import ExcelJS from 'exceljs'

export interface ExportColumn {
  header: string
  key: string
  width?: number
}

export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF059669' }, // emerald-600, el color de marca de la app
}

/**
 * Arma un workbook .xlsx y dispara la descarga en el navegador.
 * exceljs corre tanto en Node como en el browser -- acá se usa
 * client-side, sin round-trip al servidor, porque los datos ya
 * llegaron renderizados desde el Server Component.
 */
export async function downloadWorkbook(filename: string, sheets: ExportSheet[]) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'QR-Asist'
  workbook.created = new Date()

  for (const sheetDef of sheets) {
    const sheet = workbook.addWorksheet(sheetDef.name)
    sheet.columns = sheetDef.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 20,
    }))

    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = HEADER_FILL
    headerRow.alignment = { vertical: 'middle' }

    sheet.addRows(sheetDef.rows)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
