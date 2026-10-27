/**
 * Validación de los parámetros de GET /admin/reports/user. Puro (sin I/O)
 * para poder probarlo sin el route handler.
 */
import { z } from 'zod'
import { checkDayRange, idSchema } from './attendanceRangeParams'

const paramsSchema = z
  .object({
    userId: idSchema,
    from: z.iso.date({ error: 'La fecha inicial no es válida (usa AAAA-MM-DD).' }).optional(),
    to: z.iso.date({ error: 'La fecha final no es válida (usa AAAA-MM-DD).' }).optional(),
    format: z.enum(['xlsx', 'pdf'], { error: 'Formato no válido.' }).default('xlsx'),
  })
  .superRefine((value, ctx) => {
    if (!!value.from !== !!value.to) {
      ctx.addIssue({
        code: 'custom',
        path: [value.from ? 'to' : 'from'],
        message: 'Indica la fecha inicial y la final, o ninguna de las dos.',
      })
      return
    }
    if (value.from && value.to) {
      const message = checkDayRange(value.from, value.to)
      if (message) ctx.addIssue({ code: 'custom', path: ['to'], message })
    }
  })

export type UserReportParams = z.infer<typeof paramsSchema>

export type ParsedUserReportParams =
  { ok: true; params: UserReportParams } | { ok: false; error: string }

export function parseUserReportParams(search: URLSearchParams): ParsedUserReportParams {
  const raw: Record<string, string> = {}
  for (const key of ['userId', 'from', 'to', 'format']) {
    const value = search.get(key)
    // Un parámetro vacío (?from=) equivale a no enviarlo.
    if (value) raw[key] = value
  }
  const result = paramsSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    // userId ausente no debe decir "no válido" de forma críptica.
    if (issue?.path[0] === 'userId' && !raw.userId) {
      return { ok: false, error: 'userId es requerido.' }
    }
    return { ok: false, error: issue?.message ?? 'Parámetros no válidos.' }
  }
  return { ok: true, params: result.data }
}
