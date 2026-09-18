import { describe, it, expect } from 'vitest'
import {
  validateStudentCode,
  calculateStudentCodeChecksum,
  generateValidStudentCode,
} from './studentCode'

describe('studentCode validator', () => {
  it('should generate a valid 12-digit student code with correct checksum', () => {
    const code = generateValidStudentCode('20261000001')
    expect(code).toHaveLength(12)
    const result = validateStudentCode(code)
    expect(result.isValid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should reject codes with invalid length', () => {
    expect(validateStudentCode('12345').isValid).toBe(false)
    expect(validateStudentCode('1234567890123').isValid).toBe(false)
  })

  it('should reject codes with non-numeric characters', () => {
    expect(validateStudentCode('20261000001A').isValid).toBe(false)
  })

  it('should reject codes with tampered checksum', () => {
    const validCode = generateValidStudentCode('20261000001')
    const lastDigit = parseInt(validCode.slice(11), 10)
    const tamperedLastDigit = (lastDigit + 1) % 10
    const tamperedCode = `${validCode.slice(0, 11)}${tamperedLastDigit}`

    const result = validateStudentCode(tamperedCode)
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('dígito de control')
  })
})
