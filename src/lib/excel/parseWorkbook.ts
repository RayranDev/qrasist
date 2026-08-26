import ExcelJS from 'exceljs'

/**
 * Lee un .xlsx subido (Server Action recibe un File real via
 * FormData) y devuelve las filas como objetos {header: valor},
 * usando la fila 1 como encabezados. Filas totalmente vacías se
 * ignoran.
 */
export async function parseWorkbookRows(file: File): Promise<Record<string, string>[]> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(arrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const headers: string[] = []
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim()
  })

  const rows: Record<string, string>[] = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const obj: Record<string, string> = {}
    let hasData = false
    headers.forEach((header, colNumber) => {
      if (!header) return
      const value = row.getCell(colNumber).value
      const str = value === null || value === undefined ? '' : String(value).trim()
      obj[header] = str
      if (str) hasData = true
    })
    if (hasData) rows.push(obj)
  }
  return rows
}
