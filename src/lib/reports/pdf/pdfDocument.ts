/**
 * Motor mínimo de PDF institucional para los reportes de asistencia
 * (RF31-RF33), sobre pdf-lib.
 *
 * Por qué pdf-lib: es JavaScript puro, sin dependencias nativas ni lectura
 * de archivos en tiempo de ejecución (las fuentes estándar Helvetica van
 * embebidas en el paquete y el escudo se importa como base64), así que
 * funciona igual en un route handler de Next 16 que en una función
 * serverless de Vercel sin configurar trazado de archivos. La codificación
 * WinAnsi de las fuentes estándar cubre tildes y eñes del español; lo que
 * no entra (emojis, alfabetos no latinos) se degrada con `toPdfText`.
 *
 * Qué resuelve: encabezado institucional (escudo, nombre, título, período,
 * fecha de generación en hora de Bogotá), pie con numeración, títulos de
 * sección, tarjetas de indicadores y tablas que paginan limpio repitiendo
 * el encabezado de columnas, con celdas semaforizadas (RF35).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { CREST_PNG_BASE64 } from './crest'

export const INSTITUTION_NAME = 'Corporación Universitaria Republicana'

export const PDF_COLORS = {
  /** Vinotinto cercano al escudo. */
  wine: '#813139',
  /** brand-700 de la app, para filetes y acentos. */
  brand: '#A2121C',
  ink: '#1F2937',
  muted: '#6B7280',
  line: '#D1D5DB',
  zebra: '#F9FAFB',
  white: '#FFFFFF',
} as const

export type PdfTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

/** Semáforo RF35: verde = asistió, ámbar = llegó tarde, rojo = no asistió. */
export const PDF_TONES: Record<PdfTone, { bg: string; fg: string }> = {
  success: { bg: '#DCFCE7', fg: '#166534' },
  warning: { bg: '#FEF3C7', fg: '#92400E' },
  danger: { bg: '#FEE2E2', fg: '#991B1B' },
  info: { bg: '#DBEAFE', fg: '#1E40AF' },
  neutral: { bg: '#F3F4F6', fg: '#374151' },
}

export interface PdfCell {
  text: string
  tone?: PdfTone
  bold?: boolean
  align?: 'left' | 'center' | 'right'
}

export interface PdfColumn {
  header: string
  /** Peso relativo del ancho; el total se reparte en el ancho útil. */
  width: number
  align?: 'left' | 'center' | 'right'
}

export interface PdfStat {
  label: string
  value: string
  tone?: PdfTone
}

export interface PdfReportOptions {
  title: string
  /** Líneas bajo el título (período, corte, filtros...). */
  subtitleLines: string[]
  orientation: 'landscape' | 'portrait'
  /** Fecha de generación ya formateada (hora de Bogotá). */
  generatedAt: string
  /** Texto corto que acompaña el encabezado de las páginas siguientes. */
  runningTitle?: string
}

const PAGE_SIZES = {
  landscape: { width: 841.89, height: 595.28 },
  portrait: { width: 595.28, height: 841.89 },
}

const MARGIN = 36
const FOOTER_HEIGHT = 30
const FIRST_HEADER_HEIGHT = 96
const RUNNING_HEADER_HEIGHT = 48
const CELL_PAD_X = 4
const CELL_PAD_Y = 3.5
const MAX_CELL_LINES = 14

function hex(color: string) {
  const n = parseInt(color.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/**
 * Deja el texto en lo que la fuente estándar (WinAnsi) puede dibujar: sin
 * saltos de línea ni caracteres de control, espacios raros normalizados, y
 * lo no codificable degradado (á se conserva; ć pasa a c; un emoji pasa a
 * "?"). Evita que pdf-lib lance una excepción por un nombre o un motivo con
 * caracteres exóticos.
 */
export function toPdfText(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet())
  let out = ''
  for (const char of (text ?? '').replace(/[    ]/g, ' ')) {
    const code = char.codePointAt(0) as number
    if (char === '\n' || char === '\r' || char === '\t') {
      out += ' '
    } else if (code < 32 || (code >= 0x7f && code < 0xa0) || (code >= 0x200b && code <= 0x200f)) {
      continue
    } else if (supported.has(code)) {
      out += char
    } else {
      const base = char.normalize('NFD').replace(/[̀-ͯ]/g, '')
      out +=
        base !== char && [...base].every((c) => supported.has(c.codePointAt(0) as number))
          ? base
          : '?'
    }
  }
  return out
}

/** Parte `text` en líneas que caben en `maxWidth`; las palabras más anchas que la línea se cortan. */
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const clean = toPdfText(font, text).trim()
  if (clean === '') return ['']

  const lines: string[] = []
  let current = ''
  const widthOf = (s: string) => font.widthOfTextAtSize(s, size)

  for (const word of clean.split(/ +/)) {
    const candidate = current ? `${current} ${word}` : word
    if (widthOf(candidate) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = ''
    let rest = word
    while (widthOf(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1
      while (cut > 1 && widthOf(rest.slice(0, cut)) > maxWidth) cut--
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    current = rest
  }
  if (current) lines.push(current)
  return lines
}

function toCell(cell: string | PdfCell): PdfCell {
  return typeof cell === 'string' ? { text: cell } : cell
}

export class PdfReport {
  private readonly doc: PDFDocument
  private readonly regular: PDFFont
  private readonly bold: PDFFont
  private readonly crest: PDFImage
  private readonly opts: PdfReportOptions
  private readonly pageWidth: number
  private readonly pageHeight: number
  private page!: PDFPage
  /** Distancia desde el borde superior de la página. */
  private y = 0
  private pageCount = 0

  private constructor(
    doc: PDFDocument,
    regular: PDFFont,
    bold: PDFFont,
    crest: PDFImage,
    opts: PdfReportOptions
  ) {
    this.doc = doc
    this.regular = regular
    this.bold = bold
    this.crest = crest
    this.opts = opts
    const size = PAGE_SIZES[opts.orientation]
    this.pageWidth = size.width
    this.pageHeight = size.height
  }

  static async create(opts: PdfReportOptions): Promise<PdfReport> {
    const doc = await PDFDocument.create()
    const regular = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const crestBytes = Uint8Array.from(atob(CREST_PNG_BASE64), (c) => c.charCodeAt(0))
    const crest = await doc.embedPng(crestBytes)

    doc.setTitle(toPdfText(regular, opts.title))
    doc.setAuthor('QR-Asist')
    doc.setSubject(INSTITUTION_NAME)
    doc.setProducer('QR-Asist')
    doc.setCreator('QR-Asist')

    const report = new PdfReport(doc, regular, bold, crest, opts)
    report.newPage()
    return report
  }

  /** Ancho útil entre márgenes. */
  get contentWidth(): number {
    return this.pageWidth - MARGIN * 2
  }

  private get bottomLimit(): number {
    return this.pageHeight - MARGIN - FOOTER_HEIGHT + 14
  }

  private newPage() {
    this.page = this.doc.addPage([this.pageWidth, this.pageHeight])
    this.pageCount++
    if (this.pageCount === 1) this.drawFirstHeader()
    else this.drawRunningHeader()
  }

  private text(
    value: string,
    x: number,
    top: number,
    size: number,
    opts: {
      bold?: boolean
      color?: string
      align?: 'left' | 'center' | 'right'
      width?: number
    } = {}
  ) {
    const font = opts.bold ? this.bold : this.regular
    const clean = toPdfText(font, value)
    let drawX = x
    if (opts.align && opts.width !== undefined) {
      const w = font.widthOfTextAtSize(clean, size)
      if (opts.align === 'right') drawX = x + opts.width - w
      else if (opts.align === 'center') drawX = x + (opts.width - w) / 2
    }
    this.page.drawText(clean, {
      x: drawX,
      y: this.pageHeight - top - size * 0.82,
      size,
      font,
      color: hex(opts.color ?? PDF_COLORS.ink),
    })
  }

  private rect(x: number, top: number, w: number, h: number, fill?: string, border?: string) {
    this.page.drawRectangle({
      x,
      y: this.pageHeight - top - h,
      width: w,
      height: h,
      color: fill ? hex(fill) : undefined,
      borderColor: border ? hex(border) : undefined,
      borderWidth: border ? 0.6 : 0,
    })
  }

  private hLine(top: number, color: string = PDF_COLORS.line, thickness = 0.6) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.pageHeight - top },
      end: { x: this.pageWidth - MARGIN, y: this.pageHeight - top },
      thickness,
      color: hex(color),
    })
  }

  private drawFirstHeader() {
    this.rect(0, 0, this.pageWidth, 8, PDF_COLORS.wine)
    const crestSize = 58
    this.page.drawImage(this.crest, {
      x: MARGIN,
      y: this.pageHeight - 20 - crestSize,
      width: crestSize,
      height: (crestSize * this.crest.height) / this.crest.width,
    })
    const textX = MARGIN + crestSize + 14
    this.text(INSTITUTION_NAME.toUpperCase(), textX, 22, 11, { bold: true, color: PDF_COLORS.wine })
    this.text(this.opts.title, textX, 38, 17, { bold: true })
    let top = 62
    for (const line of this.opts.subtitleLines) {
      this.text(line, textX, top, 9.5, { color: PDF_COLORS.muted })
      top += 12.5
    }
    this.text(`Generado: ${this.opts.generatedAt}`, MARGIN, 24, 8.5, {
      color: PDF_COLORS.muted,
      align: 'right',
      width: this.contentWidth,
    })
    this.hLine(FIRST_HEADER_HEIGHT - 6, PDF_COLORS.brand, 1.2)
    this.y = FIRST_HEADER_HEIGHT + 4
  }

  private drawRunningHeader() {
    this.rect(0, 0, this.pageWidth, 5, PDF_COLORS.wine)
    const crestSize = 24
    this.page.drawImage(this.crest, {
      x: MARGIN,
      y: this.pageHeight - 12 - crestSize,
      width: crestSize,
      height: (crestSize * this.crest.height) / this.crest.width,
    })
    this.text(INSTITUTION_NAME, MARGIN + crestSize + 8, 14, 9, {
      bold: true,
      color: PDF_COLORS.wine,
    })
    this.text(this.opts.runningTitle ?? this.opts.title, MARGIN + crestSize + 8, 26, 8.5, {
      color: PDF_COLORS.muted,
    })
    this.hLine(RUNNING_HEADER_HEIGHT - 6, PDF_COLORS.brand, 0.8)
    this.y = RUNNING_HEADER_HEIGHT + 4
  }

  /** Salta de página si lo que viene no cabe en el espacio restante. */
  ensureSpace(height: number) {
    if (this.y + height > this.bottomLimit) this.newPage()
  }

  spacer(height: number) {
    this.y += height
  }

  /** Salto de página explícito (ej. antes de la sección de docentes). */
  breakPage() {
    this.newPage()
  }

  /** Título de sección con filete vinotinto. */
  section(title: string) {
    this.ensureSpace(48)
    this.y += 6
    this.text(title, MARGIN, this.y, 12.5, { bold: true, color: PDF_COLORS.wine })
    this.y += 18
    this.hLine(this.y - 3, PDF_COLORS.wine, 0.8)
    this.y += 4
  }

  /** Subtítulo de bloque (ej. una materia dentro de la sección). */
  subheading(title: string, detail?: string) {
    this.ensureSpace(60)
    this.text(title, MARGIN, this.y, 10, { bold: true })
    if (detail) {
      const titleWidth = this.bold.widthOfTextAtSize(toPdfText(this.bold, title), 10)
      this.text(detail, MARGIN + titleWidth + 8, this.y + 1, 8.5, { color: PDF_COLORS.muted })
    }
    this.y += 15
  }

  /** Leyenda de colores en una sola línea (ej. el semáforo de estados). */
  legend(items: { label: string; tone: PdfTone }[]) {
    this.ensureSpace(18)
    let x = MARGIN
    for (const item of items) {
      const tone = PDF_TONES[item.tone]
      const width = this.bold.widthOfTextAtSize(toPdfText(this.bold, item.label), 8) + 14
      this.rect(x, this.y, width, 13, tone.bg, PDF_COLORS.line)
      this.text(item.label, x + 7, this.y + 2.5, 8, { bold: true, color: tone.fg })
      x += width + 6
    }
    this.y += 20
  }

  paragraph(value: string, opts: { size?: number; muted?: boolean; bold?: boolean } = {}) {
    const size = opts.size ?? 9.5
    const font = opts.bold ? this.bold : this.regular
    const lineHeight = size * 1.35
    for (const line of wrapText(font, value, size, this.contentWidth)) {
      this.ensureSpace(lineHeight)
      this.text(line, MARGIN, this.y, size, {
        bold: opts.bold,
        color: opts.muted ? PDF_COLORS.muted : PDF_COLORS.ink,
      })
      this.y += lineHeight
    }
    this.y += 3
  }

  /** Fila de tarjetas de indicadores. */
  stats(items: PdfStat[]) {
    if (items.length === 0) return
    const gap = 8
    const boxH = 46
    this.ensureSpace(boxH + 8)
    const boxW = (this.contentWidth - gap * (items.length - 1)) / items.length
    items.forEach((item, i) => {
      const x = MARGIN + i * (boxW + gap)
      const tone = item.tone ? PDF_TONES[item.tone] : PDF_TONES.neutral
      this.rect(x, this.y, boxW, boxH, tone.bg, PDF_COLORS.line)
      this.text(item.value, x + 8, this.y + 8, 16, { bold: true, color: tone.fg })
      const labelLines = wrapText(this.regular, item.label, 8, boxW - 16).slice(0, 2)
      labelLines.forEach((line, li) => {
        this.text(line, x + 8, this.y + 28 + li * 9, 8, { color: PDF_COLORS.muted })
      })
    })
    this.y += boxH + 10
  }

  /**
   * Tabla con encabezado repetido en cada página. Cada fila se mantiene
   * entera (no se parte entre páginas); las celdas largas se ajustan y, si
   * exceden un tope razonable, se cortan con puntos suspensivos.
   */
  table(
    columns: PdfColumn[],
    rows: (string | PdfCell)[][],
    opts: { fontSize?: number; emptyMessage?: string } = {}
  ) {
    const size = opts.fontSize ?? 8
    const lineHeight = size * 1.25
    const totalWeight = columns.reduce((sum, c) => sum + c.width, 0)
    const widths = columns.map((c) => (c.width / totalWeight) * this.contentWidth)

    const measure = (cells: PdfCell[], fontFor: (c: PdfCell) => PDFFont) => {
      const wrapped = cells.map((cell, i) => {
        const lines = wrapText(fontFor(cell), cell.text, size, widths[i] - CELL_PAD_X * 2)
        if (lines.length > MAX_CELL_LINES) {
          const kept = lines.slice(0, MAX_CELL_LINES)
          kept[MAX_CELL_LINES - 1] = `${kept[MAX_CELL_LINES - 1].replace(/\s*\S{0,3}$/, '')}...`
          return kept
        }
        return lines
      })
      const height = Math.max(...wrapped.map((l) => l.length)) * lineHeight + CELL_PAD_Y * 2
      return { wrapped, height }
    }

    const headerCells = columns.map<PdfCell>((c) => ({
      text: c.header,
      bold: true,
      align: c.align ?? 'left',
    }))
    const header = measure(headerCells, () => this.bold)

    const drawHeader = () => {
      let x = MARGIN
      this.rect(MARGIN, this.y, this.contentWidth, header.height, PDF_COLORS.wine)
      header.wrapped.forEach((lines, i) => {
        lines.forEach((line, li) => {
          this.text(line, x + CELL_PAD_X, this.y + CELL_PAD_Y + li * lineHeight, size, {
            bold: true,
            color: PDF_COLORS.white,
            align: columns[i].align ?? 'left',
            width: widths[i] - CELL_PAD_X * 2,
          })
        })
        x += widths[i]
      })
      this.y += header.height
    }

    if (rows.length === 0) {
      this.ensureSpace(header.height + 20)
      drawHeader()
      this.rect(MARGIN, this.y, this.contentWidth, 20, undefined, PDF_COLORS.line)
      this.text(
        opts.emptyMessage ?? 'Sin datos para mostrar.',
        MARGIN + CELL_PAD_X,
        this.y + 6,
        size,
        {
          color: PDF_COLORS.muted,
        }
      )
      this.y += 26
      return
    }

    const measuredRows = rows.map((row) => {
      const cells = row.map(toCell)
      return {
        cells,
        ...measure(cells, (c) => (c.bold || c.tone ? this.bold : this.regular)),
      }
    })

    // El encabezado nunca queda huérfano al final de una página.
    this.ensureSpace(header.height + measuredRows[0].height)
    drawHeader()

    measuredRows.forEach((row, rowIndex) => {
      if (this.y + row.height > this.bottomLimit) {
        this.newPage()
        drawHeader()
      }
      if (rowIndex % 2 === 1)
        this.rect(MARGIN, this.y, this.contentWidth, row.height, PDF_COLORS.zebra)

      let x = MARGIN
      row.cells.forEach((cell, i) => {
        const tone = cell.tone ? PDF_TONES[cell.tone] : null
        if (tone) this.rect(x, this.y, widths[i], row.height, tone.bg)
        const font = cell.bold || tone ? this.bold : this.regular
        row.wrapped[i].forEach((line, li) => {
          this.text(line, x + CELL_PAD_X, this.y + CELL_PAD_Y + li * lineHeight, size, {
            bold: font === this.bold,
            color: tone?.fg ?? PDF_COLORS.ink,
            align: cell.align ?? columns[i].align ?? 'left',
            width: widths[i] - CELL_PAD_X * 2,
          })
        })
        x += widths[i]
      })
      this.hLine(this.y + row.height, PDF_COLORS.line, 0.4)
      this.y += row.height
    })
    this.y += 10
  }

  /** Dibuja el pie con numeración en todas las páginas y serializa el PDF. */
  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages()
    pages.forEach((page, index) => {
      this.page = page
      const top = this.pageHeight - MARGIN - 4
      this.hLine(top - 6, PDF_COLORS.line, 0.5)
      this.text(`QR-Asist · ${INSTITUTION_NAME}`, MARGIN, top, 8, { color: PDF_COLORS.muted })
      this.text(`Página ${index + 1} de ${pages.length}`, MARGIN, top, 8, {
        color: PDF_COLORS.muted,
        align: 'right',
        width: this.contentWidth,
      })
    })
    return this.doc.save()
  }
}
