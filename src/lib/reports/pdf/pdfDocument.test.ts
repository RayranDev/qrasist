// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { PdfReport, toPdfText, wrapText } from './pdfDocument'
import { extractPages } from './reportFixtures'

describe('PDF primitives', () => {
  it('degrades characters the standard font cannot encode (c with acute, emoji) instead of throwing', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    expect(toPdfText(font, 'Peña ñandú ¿Qué?')).toBe('Peña ñandú ¿Qué?')
    expect(toPdfText(font, 'ćžš')).toBe('cžš')
    expect(toPdfText(font, 'ok 😀 fin')).toBe('ok ? fin')
    expect(toPdfText(font, 'a\nb\tc d')).toBe('a b c d')
  })

  it('wraps long text and breaks words wider than the column', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const lines = wrapText(font, 'una frase bastante larga para una columna angosta', 8, 60)
    expect(lines.length).toBeGreaterThan(2)
    for (const line of lines) expect(font.widthOfTextAtSize(line, 8)).toBeLessThanOrEqual(60)

    const broken = wrapText(font, 'A'.repeat(80), 8, 60)
    expect(broken.length).toBeGreaterThan(1)
    expect(broken.join('')).toBe('A'.repeat(80))
  })

  it('numbers pages and repeats the table header when a table spans pages', async () => {
    const pdf = await PdfReport.create({
      title: 'Prueba',
      subtitleLines: ['x'],
      orientation: 'landscape',
      generatedAt: 'hoy',
    })
    pdf.table(
      [
        { header: 'Columna A', width: 1 },
        { header: 'Columna B', width: 1 },
      ],
      Array.from({ length: 90 }, (_, i) => [`fila ${i}`, 'dato'])
    )
    const pages = await extractPages(await pdf.save())
    expect(pages.length).toBeGreaterThan(1)
    pages.forEach((text, i) => {
      expect(text).toContain('Columna A')
      expect(text).toContain(`Página ${i + 1} de ${pages.length}`)
    })
  })
})
