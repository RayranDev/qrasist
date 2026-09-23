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
  fgColor: { argb: 'FF002849' }, // navy-900, color institucional primario
}

// Caracteres que Excel (y Google Sheets, LibreOffice, etc.) puede
// interpretar como el comienzo de una fórmula al abrir la celda, sin
// importar mucho el tipo declarado en el XML -- "fórmula injection"
// clásico (misma familia que "CSV injection"). Todos nuestros exports
// vuelcan datos que en algún momento pasaron por lo que escribió un
// usuario (nombre, motivo de justificación, etc.), así que cualquier
// celda de texto que empiece con uno de estos se neutraliza acá, en un
// solo lugar, para que ningún export futuro se olvide de hacerlo.
const FORMULA_INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

function sanitizeCellValue(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value
  // Antepone una comilla simple: Excel la interpreta como "forzar
  // texto" y no evalúa lo que sigue como fórmula, igual que si alguien
  // la hubiese tipeado a mano antes del "=".
  return FORMULA_INJECTION_PREFIXES.includes(value[0]) ? `'${value}` : value
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeCellValue(value)
  }
  return sanitized
}

/**
 * Arma el workbook con el estilo institucional (header navy) sin nada
 * de DOM -- exceljs corre igual en Node que en el browser, así que
 * esto lo puede llamar tanto `downloadWorkbook` (client-side) como un
 * route handler que genera el .xlsx en el servidor (ej. el reporte de
 * período, que necesita consultas que no tiene sentido mandar al
 * cliente).
 */
export async function buildWorkbook(sheets: ExportSheet[]): Promise<ExcelJS.Workbook> {
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

    sheet.addRows(sheetDef.rows.map(sanitizeRow))
  }

  return workbook
}

/**
 * Arma un workbook .xlsx y dispara la descarga en el navegador.
 * Se usa client-side, sin round-trip al servidor, cuando los datos ya
 * llegaron renderizados desde el Server Component.
 */
export async function downloadWorkbook(filename: string, sheets: ExportSheet[]) {
  const workbook = await buildWorkbook(sheets)

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
