/**
 * Validación de los parámetros de GET /admin/reports/attendance-range.
 * Puro (sin I/O) para poder probarlo sin el route handler.
 */
import { z } from 'zod'

/** Rango máximo en días civiles, ambos extremos inclusivos. */
export const MAX_RANGE_DAYS = 366

const DAY_MS = 24 * 60 * 60 * 1000

// Los ids de Supabase son uuid; se acepta cualquier forma hex con guiones para
// no depender de la variante exacta (y rechazar basura antes de consultar).
export const idSchema = z.string().regex(/^[0-9a-fA-F-]{36}$/, 'Identificador no válido.')

/** Mensaje de error si el rango de días ('YYYY-MM-DD', inclusivos) no es válido; null si lo es. */
export function checkDayRange(from: string, to: string): string | null {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  if (days < 0) return 'La fecha final no puede ser anterior a la inicial.'
  if (days + 1 > MAX_RANGE_DAYS) return `El rango no puede superar ${MAX_RANGE_DAYS} días.`
  return null
}

const paramsSchema = z
  .object({
    from: z.iso.date({ error: 'La fecha inicial no es válida (usa AAAA-MM-DD).' }),
    to: z.iso.date({ error: 'La fecha final no es válida (usa AAAA-MM-DD).' }),
    careerId: idSchema.optional(),
    subjectId: idSchema.optional(),
    // Solo Excel: el detalle por estudiante y clase no cabe en un PDF legible.
    format: z.enum(['xlsx'], { error: 'Formato no válido.' }).default('xlsx'),
  })
  .superRefine((value, ctx) => {
    const message = checkDayRange(value.from, value.to)
    if (message) ctx.addIssue({ code: 'custom', path: ['to'], message })
  })

export type RangeReportParams = z.infer<typeof paramsSchema>

export type ParsedRangeParams =
  { ok: true; params: RangeReportParams } | { ok: false; error: string }

/** Convierte los query params en parámetros tipados o en un mensaje de error en español. */
export function parseRangeReportParams(search: URLSearchParams): ParsedRangeParams {
  const raw: Record<string, string> = {}
  for (const key of ['from', 'to', 'careerId', 'subjectId', 'format']) {
    const value = search.get(key)
    // Un parámetro vacío (?careerId=) equivale a no enviarlo.
    if (value) raw[key] = value
  }
  const result = paramsSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Parámetros no válidos.' }
  }
  return { ok: true, params: result.data }
}
