import { describe, it, expect } from 'vitest'
import {
  buildRoleChangeWarning,
  emptyRoleChangeImpact,
  hasRoleChangeImpact,
  resolveRoleChangeScope,
  type RoleChangeImpact,
} from './roleChangeImpact'

const subject = (n: number) => ({ code: `MAT${n}`, name: `Materia ${n}` })

function impact(overrides: Partial<RoleChangeImpact> = {}): RoleChangeImpact {
  return { ...emptyRoleChangeImpact('STUDENT'), ...overrides }
}

describe('resolveRoleChangeScope', () => {
  it('flags a student leaving the student role', () => {
    expect(resolveRoleChangeScope('STUDENT', 'PROFESSOR')).toEqual({
      leavesStudent: true,
      leavesProfessor: false,
    })
    expect(resolveRoleChangeScope('STUDENT', 'ADMIN').leavesStudent).toBe(true)
  })

  it('flags a professor leaving the professor role', () => {
    expect(resolveRoleChangeScope('PROFESSOR', 'STUDENT')).toEqual({
      leavesStudent: false,
      leavesProfessor: true,
    })
    expect(resolveRoleChangeScope('PROFESSOR', 'ADMIN').leavesProfessor).toBe(true)
  })

  it('has no impact for same-role changes, admins and unknown roles', () => {
    expect(resolveRoleChangeScope('STUDENT', 'STUDENT')).toEqual({
      leavesStudent: false,
      leavesProfessor: false,
    })
    expect(resolveRoleChangeScope('ADMIN', 'PROFESSOR')).toEqual({
      leavesStudent: false,
      leavesProfessor: false,
    })
    expect(resolveRoleChangeScope(null, 'STUDENT')).toEqual({
      leavesStudent: false,
      leavesProfessor: false,
    })
  })
})

describe('hasRoleChangeImpact', () => {
  it('is false for an empty impact', () => {
    expect(hasRoleChangeImpact(emptyRoleChangeImpact('STUDENT'))).toBe(false)
  })

  it('is true for enrollments, pending requests or taught subjects', () => {
    expect(hasRoleChangeImpact(impact({ enrollments: { total: 1, subjects: [subject(1)] } }))).toBe(
      true
    )
    expect(hasRoleChangeImpact(impact({ pendingRequests: 2 }))).toBe(true)
    expect(
      hasRoleChangeImpact(
        impact({ currentRole: 'PROFESSOR', taughtSubjects: { total: 1, subjects: [subject(2)] } })
      )
    ).toBe(true)
  })
})

describe('buildRoleChangeWarning', () => {
  it('returns nothing when there is no impact', () => {
    expect(
      buildRoleChangeWarning({
        userName: 'Ana',
        newRole: 'PROFESSOR',
        impact: emptyRoleChangeImpact('STUDENT'),
      })
    ).toEqual([])
  })

  it('explains the un-enrollment with the subject list', () => {
    const [text] = buildRoleChangeWarning({
      userName: 'Ana Pérez',
      newRole: 'PROFESSOR',
      impact: impact({ enrollments: { total: 2, subjects: [subject(1), subject(2)] } }),
    })
    expect(text).toBe(
      'Al pasar a Docente, Ana Pérez dejará de ser estudiante y se desmatriculará de 2 materias: MAT1 Materia 1, MAT2 Materia 2.'
    )
  })

  it('uses the singular for one subject', () => {
    const [text] = buildRoleChangeWarning({
      userName: 'Ana',
      newRole: 'ADMIN',
      impact: impact({ enrollments: { total: 1, subjects: [subject(1)] } }),
    })
    expect(text).toContain('Al pasar a Administrador')
    expect(text).toContain('de 1 materia: MAT1 Materia 1.')
  })

  it('says how many subjects are not listed when the list is capped', () => {
    const [text] = buildRoleChangeWarning({
      userName: 'Ana',
      newRole: 'PROFESSOR',
      impact: impact({ enrollments: { total: 13, subjects: [subject(1), subject(2)] } }),
    })
    expect(text).toContain('de 13 materias: MAT1 Materia 1, MAT2 Materia 2 y 11 más.')
  })

  it('mentions cancelled pending requests, alone or together with enrollments', () => {
    const alone = buildRoleChangeWarning({
      userName: 'Ana',
      newRole: 'PROFESSOR',
      impact: impact({ pendingRequests: 1 }),
    })
    expect(alone).toEqual([
      'Al pasar a Docente, Ana dejará de ser estudiante y se cancelarán 1 solicitud de inscripción pendiente.',
    ])

    const both = buildRoleChangeWarning({
      userName: 'Ana',
      newRole: 'PROFESSOR',
      impact: impact({
        enrollments: { total: 1, subjects: [subject(1)] },
        pendingRequests: 3,
      }),
    })
    expect(both).toHaveLength(2)
    expect(both[1]).toBe('Además, se cancelarán 3 solicitudes de inscripción pendientes.')
  })

  it('warns that the user still appears as professor of the taught subjects', () => {
    const [text] = buildRoleChangeWarning({
      userName: 'Luis',
      newRole: 'STUDENT',
      impact: impact({
        currentRole: 'PROFESSOR',
        taughtSubjects: { total: 2, subjects: [subject(5), subject(6)] },
      }),
    })
    expect(text).toContain('Al pasar a Estudiante, Luis dejará de ser docente')
    expect(text).toContain(
      'seguirá apareciendo como docente de 2 materias (MAT5 Materia 5, MAT6 Materia 6)'
    )
    expect(text).toContain('hasta que las reasignes desde Materias')
    expect(text).not.toMatch(/gestionar/)
  })
})
