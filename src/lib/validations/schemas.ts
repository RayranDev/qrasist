import { z } from 'zod'
import { validateStudentCode } from './studentCode'

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Formato de correo electrónico inválido.')
    .refine((val) => val.endsWith('@urepublicana.edu.co'), {
      message: 'Debes usar tu correo institucional (@urepublicana.edu.co).',
    }),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
})

export const signupSchema = z.object({
  firstName: z.string().trim().min(2, 'El nombre es obligatorio (mín. 2 letras).'),
  lastName: z.string().trim().min(2, 'El apellido es obligatorio (mín. 2 letras).'),
  studentCode: z
    .string()
    .trim()
    .refine((val) => validateStudentCode(val).isValid, {
      message: 'Código estudiantil inválido (debe tener 12 dígitos y dígito de control correcto).',
    }),
  careerId: z.string().uuid('Debes seleccionar una carrera válida.'),
  email: z
    .string()
    .trim()
    .email('Formato de correo electrónico inválido.')
    .refine((val) => val.endsWith('@urepublicana.edu.co'), {
      message: 'El correo debe pertenecer al dominio institucional (@urepublicana.edu.co).',
    }),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
})

export const subjectSchema = z.object({
  name: z.string().trim().min(2, 'El nombre de la materia es obligatorio.'),
  code: z
    .string()
    .trim()
    .min(2, 'El código es obligatorio.')
    .transform((v) => v.toUpperCase()),
  periodId: z.string().uuid('Período inválido').optional().nullable(),
  absenceRuleType: z.enum(['PERCENTAGE', 'FIXED_COUNT']).default('PERCENTAGE'),
  maxAbsencePercentage: z.coerce.number().int().min(1).max(100).default(20),
  maxAbsenceCount: z.coerce.number().int().min(1).max(50).optional().nullable(),
  totalPlannedSessions: z.coerce.number().int().min(1).max(100).default(16),
})

export const sessionConfigSchema = z.object({
  durationMinutes: z.coerce
    .number()
    .int()
    .min(1, 'Mínimo 1 minuto')
    .max(180, 'Máximo 180 minutos')
    .default(15),
  rotationSeconds: z.coerce
    .number()
    .int()
    .min(10, 'Mínimo 10 segundos')
    .max(60, 'Máximo 60 segundos')
    .default(20),
})
