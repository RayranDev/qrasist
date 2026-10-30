import ExcelJS from 'exceljs'

/**
 * Arma un .xlsx en memoria y lo devuelve como `File`, pasando por
 * write/load real de exceljs para que los valores de celda (hipervínculos,
 * fórmulas, texto enriquecido) tengan la misma forma que al subir un archivo.
 */
export async function xlsxFile(
  build: (workbook: ExcelJS.Workbook) => void,
  name = 'archivo.xlsx'
): Promise<File> {
  const workbook = new ExcelJS.Workbook()
  build(workbook)
  const buffer = await workbook.xlsx.writeBuffer()
  return new File([buffer as ArrayBuffer], name)
}

/** Hoja con encabezados en la fila 1 y una fila por objeto (en el orden de `headers`). */
export function addTable(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Record<string, ExcelJS.CellValue>[]
) {
  const sheet = workbook.addWorksheet(name)
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(headers.map((h) => row[h] ?? null))
  return sheet
}
