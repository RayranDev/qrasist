/**
 * Validación de los parámetros de GET /admin/reports/attendance-range.
 * Puro (sin I/O) para poder probarlo sin el route handler.
 */
import { z } from 'zod'
import { MAX_RANGE_DAYS, checkDayRange } from './dayRange'
import {
  MAX_SUPPORTED_YEAR,
  MIN_SUPPORTED_YEAR,
  isSupportedYear,
} from '@/lib/attendance/calendarGrid'

export { MAX_RANGE_DAYS, checkDayRange }

// Los ids de Supabase son uuid: formato 8-4-4-4-12 estricto, para que un id mal
// formado dé 400 en lugar de llegar a Postgres y terminar en un 500.
export const idSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'Identificador no válido.'
  )

/** Fecha 'YYYY-MM-DD' real, con año entre 2000 y 2100. */
export function dayParamSchema(message: string) {
  return z.iso
    .date({ error: message })
    .refine(
      isSupportedYear,
      `El año debe estar entre ${MIN_SUPPORTED_YEAR} y ${MAX_SUPPORTED_YEAR}.`
    )
}

const paramsSchema = z
  .object({
    from: dayParamSchema('La fecha inicial no es válida (usa AAAA-MM-DD).'),
    to: dayParamSchema('La fecha final no es válida (usa AAAA-MM-DD).'),
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
