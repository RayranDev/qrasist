import ExcelJS from 'exceljs'
import { foldText } from '@/lib/utils/normalizeText'

export interface ParseOptions {
  /** Encabezados sin los cuales el archivo no sirve. */
  required: string[]
  /** Encabezados que se reconocen si están, pero pueden faltar. */
  optional?: string[]
  /** Corta al pasar de este número de filas con datos (devuelve `truncated`). */
  maxRows?: number
}

export interface ParsedWorkbook {
  /** Filas con las claves canónicas (las de `required`/`optional`), siempre presentes. */
  rows: Record<string, string>[]
  /** Número real de cada fila en la hoja (las filas vacías intermedias no cuentan pero sí numeran). */
  rowNumbers: number[]
  /** Encabezados obligatorios que no están en la hoja elegida. */
  missingHeaders: string[]
  truncated: boolean
}

function numberToString(n: number, numFmt?: string): string {
  // toFixed(0) evita la notación exponencial de String() en enteros grandes.
  const digits = Number.isInteger(n) && Math.abs(n) < 1e21 ? n.toFixed(0) : String(n)
  // Un código tipeado como número con formato "0000000000" conserva sus ceros.
  const width = numFmt && /^0+$/.test(numFmt) ? numFmt.length : 0
  return width > digits.length && n >= 0 ? digits.padStart(width, '0') : digits
}

function unwrap(value: unknown, numFmt?: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return numberToString(value, numFmt)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value !== 'object') return ''

  const v = value as Record<string, unknown>
  // Error de Excel (#N/A, #REF!...): no es un dato.
  if ('error' in v) return ''
  // Fórmula: interesa el valor calculado, no la fórmula.
  if ('formula' in v || 'sharedFormula' in v) return unwrap(v.result, numFmt)
  if (Array.isArray(v.richText)) {
    return v.richText
      .map((part) =>
        part && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : ''
      )
      .join('')
  }
  // Hipervínculo: Excel autoenlaza los correos y exceljs entrega {text, hyperlink}.
  if ('text' in v || 'hyperlink' in v) {
    const text = unwrap(v.text)
    if (text.trim()) return text
    return typeof v.hyperlink === 'string' ? v.hyperlink.replace(/^mailto:/i, '') : ''
  }
  return ''
}

/** Convierte cualquier valor de celda de exceljs en un texto limpio y recortado. */
export function cellToString(cell: ExcelJS.Cell): string {
  return unwrap(cell.value, cell.numFmt)
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .trim()
}

function headerMap(sheet: ExcelJS.Worksheet): Map<string, { col: number; original: string }> {
  const map = new Map<string, { col: number; original: string }>()
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const original = cellToString(cell)
    const key = foldText(original)
    if (key && !map.has(key)) map.set(key, { col, original })
  })
  return map
}

/**
 * Lee un .xlsx subido (Server Action recibe un File real via
 * FormData) y devuelve las filas como objetos {encabezado: valor},
 * usando la fila 1 como encabezados. Elige la hoja visible que traiga
 * los encabezados esperados (las hojas ocultas, como la de listas de la
 * plantilla, nunca se leen como datos). Los encabezados se comparan sin
 * importar mayúsculas, tildes ni espacios. Filas totalmente vacías se
 * ignoran.
 */
export async function parseWorkbookRows(
  file: File,
  options: ParseOptions
): Promise<ParsedWorkbook> {
  const { required, optional = [], maxRows = Infinity } = options
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())

  const visible = workbook.worksheets.filter((s) => s.state === 'visible')
  let best: {
    sheet: ExcelJS.Worksheet
    headers: ReturnType<typeof headerMap>
    score: number
  } | null = null
  for (const sheet of visible) {
    const headers = headerMap(sheet)
    const score = required.filter((h) => headers.has(foldText(h))).length
    if (!best || score > best.score) best = { sheet, headers, score }
  }

  if (!best) return { rows: [], rowNumbers: [], missingHeaders: required, truncated: false }

  const missingHeaders = required.filter((h) => !best!.headers.has(foldText(h)))
  if (missingHeaders.length > 0) {
    return { rows: [], rowNumbers: [], missingHeaders, truncated: false }
  }

  // Columnas conocidas bajo su nombre canónico; las desconocidas conservan el suyo.
  const canonical = new Map([...required, ...optional].map((h) => [foldText(h), h] as const))
  const columns: { col: number; key: string }[] = []
  const known = new Set<string>()
  for (const [folded, { col, original }] of best.headers) {
    const key = canonical.get(folded) ?? original
    columns.push({ col, key })
    known.add(key)
  }
  const absent = [...canonical.values()].filter((key) => !known.has(key))

  const rows: Record<string, string>[] = []
  const rowNumbers: number[] = []
  let truncated = false
  best.sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || truncated) return
    const obj: Record<string, string> = {}
    for (const key of absent) obj[key] = ''
    let hasData = false
    for (const { col, key } of columns) {
      const str = cellToString(row.getCell(col))
      obj[key] = str
      if (str) hasData = true
    }
    if (!hasData) return
    if (rows.length >= maxRows) {
      truncated = true
      return
    }
    rows.push(obj)
    rowNumbers.push(rowNumber)
  })

  return { rows, rowNumbers, missingHeaders: [], truncated }
}
