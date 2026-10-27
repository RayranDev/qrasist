// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
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

  it('normalizes exotic spaces and drops the BOM and zero-width characters', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const exotic = [' ', ' ', ' ', ' ', ' ', ' ', ' ']
    for (const space of exotic) {
      expect(toPdfText(font, `a${space}b`)).toBe('a b')
    }
    expect(toPdfText(font, '﻿Hola​ mundo')).toBe('Hola mundo')
  })

  it('builds the supported character set once per font', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const spy = vi.spyOn(font, 'getCharacterSet')
    for (let i = 0; i < 25; i++) toPdfText(font, 'texto con tildes: áéíóú')
    expect(spy).toHaveBeenCalledTimes(1)
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

  it('wraps a very long unspaced string in linear time without losing characters', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const long = 'abcdefghij'.repeat(500)
    const started = performance.now()
    const lines = wrapText(font, long, 8, 120)
    const elapsed = performance.now() - started

    expect(lines.join('')).toBe(long)
    for (const line of lines) expect(font.widthOfTextAtSize(line, 8)).toBeLessThanOrEqual(120)
    // The previous implementation took ~23 s for 3000 characters.
    expect(elapsed).toBeLessThan(1000)
  })

  it('breaks words exactly where the previous word-splitting did for normal text', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    // Reference: the previous (slow) per-character search.
    const reference = (word: string, size: number, maxWidth: number) => {
      const widthOf = (s: string) => font.widthOfTextAtSize(s, size)
      const out: string[] = []
      let rest = word
      while (widthOf(rest) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1
        while (cut > 1 && widthOf(rest.slice(0, cut)) > maxWidth) cut--
        out.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      out.push(rest)
      return out
    }
    for (const word of ['A'.repeat(80), 'iiiiiillllll'.repeat(12), 'WWmm.,;:'.repeat(15)]) {
      expect(wrapText(font, word, 8, 60)).toEqual(reference(word, 8, 60))
    }
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
