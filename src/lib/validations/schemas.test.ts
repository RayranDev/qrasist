import { describe, it, expect } from 'vitest'
import { loginSchema, signupSchema, subjectSchema, sessionConfigSchema } from './schemas'
import { generateValidStudentCode } from './studentCode'

describe('Zod Validation Schemas', () => {
  it('should validate valid institutional email for login', () => {
    const valid = loginSchema.safeParse({
      email: 'estudiante@urepublicana.edu.co',
      password: 'password123',
    })
    expect(valid.success).toBe(true)

    const invalid = loginSchema.safeParse({
      email: 'estudiante@gmail.com',
      password: 'password123',
    })
    expect(invalid.success).toBe(false)
  })

  it('should validate valid student signup with checksummed code', () => {
    const validCode = generateValidStudentCode('20261099999')
    const valid = signupSchema.safeParse({
      firstName: 'Laura',
      lastName: 'Gómez',
      studentCode: validCode,
      careerId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'lgomez@urepublicana.edu.co',
      password: 'mypassword',
    })
    expect(valid.success).toBe(true)
  })

  it('should validate subject schema defaults', () => {
    const valid = subjectSchema.safeParse({
      name: 'Estructuras de Datos',
      code: 'sis-102',
    })
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data.code).toBe('SIS-102')
      expect(valid.data.absenceRuleType).toBe('PERCENTAGE')
      expect(valid.data.maxAbsencePercentage).toBe(20)
      expect(valid.data.totalPlannedSessions).toBe(16)
    }
  })

  it('should enforce bounds on sessionConfigSchema', () => {
    expect(sessionConfigSchema.safeParse({ durationMinutes: 0, rotationSeconds: 20 }).success).toBe(
      false
    )
    expect(sessionConfigSchema.safeParse({ durationMinutes: 15, rotationSeconds: 5 }).success).toBe(
      false
    )
    expect(
      sessionConfigSchema.safeParse({ durationMinutes: 15, rotationSeconds: 20 }).success
    ).toBe(true)
  })
})
