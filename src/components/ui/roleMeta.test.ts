import { describe, expect, it } from 'vitest'
import { ROLE_LABEL, isUserRole, roleLabel } from './roleMeta'

describe('roleMeta', () => {
  it('labels every role in neutral Spanish', () => {
    expect(ROLE_LABEL).toEqual({
      ADMIN: 'Administrador',
      PROFESSOR: 'Docente',
      STUDENT: 'Estudiante',
    })
  })

  it('recognises only the three app roles', () => {
    expect(isUserRole('ADMIN')).toBe(true)
    expect(isUserRole('PROFESSOR')).toBe(true)
    expect(isUserRole('STUDENT')).toBe(true)
    expect(isUserRole('admin')).toBe(false)
    expect(isUserRole(null)).toBe(false)
    expect(isUserRole(undefined)).toBe(false)
  })

  it('falls back to the raw value for unknown roles', () => {
    expect(roleLabel('STUDENT')).toBe('Estudiante')
    expect(roleLabel('GUEST')).toBe('GUEST')
    expect(roleLabel(null)).toBe('')
  })
})
