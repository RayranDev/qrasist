import { describe, it, expect } from 'vitest'
import {
  buildAttentionItems,
  computeOnboardingSteps,
  isOnboardingComplete,
  type AttentionCounts,
  type AttentionLinks,
} from './dashboardAttention'

const links: AttentionLinks = {
  enrollmentRequestsHref: '/professor/subjects/s1/requests',
  justificationsHref: '/professor/justifications',
  atRiskStudentsHref: '/admin/dashboard#consolidado',
  activeSessionsHref: '/admin/dashboard#consolidado',
}

describe('buildAttentionItems', () => {
  it('excludes items with count 0', () => {
    const counts: AttentionCounts = {
      pendingEnrollmentRequests: 0,
      pendingJustifications: 0,
      atRiskStudents: 0,
      activeSessionsNow: 0,
    }
    expect(buildAttentionItems(counts, links)).toEqual([])
  })

  it('includes only items with count > 0, preserving order', () => {
    const counts: AttentionCounts = {
      pendingEnrollmentRequests: 2,
      pendingJustifications: 0,
      atRiskStudents: 5,
      activeSessionsNow: 1,
    }
    const items = buildAttentionItems(counts, links)
    expect(items.map((i) => i.key)).toEqual(['enrollment-requests', 'at-risk', 'active-sessions'])
  })

  it('uses singular labels for count of 1', () => {
    const counts: AttentionCounts = {
      pendingEnrollmentRequests: 1,
      pendingJustifications: 1,
      atRiskStudents: 1,
      activeSessionsNow: 1,
    }
    const items = buildAttentionItems(counts, links)
    expect(items.find((i) => i.key === 'enrollment-requests')?.label).toBe(
      'Solicitud de inscripción pendiente'
    )
    expect(items.find((i) => i.key === 'justifications')?.label).toBe(
      'Justificación de inasistencia pendiente'
    )
    expect(items.find((i) => i.key === 'at-risk')?.label).toBe(
      'Estudiante en riesgo por inasistencias'
    )
    expect(items.find((i) => i.key === 'active-sessions')?.label).toBe('Sesión activa ahora')
  })

  it('assigns danger tone to at-risk students and warning to pending actions', () => {
    const counts: AttentionCounts = {
      pendingEnrollmentRequests: 1,
      pendingJustifications: 1,
      atRiskStudents: 1,
      activeSessionsNow: 1,
    }
    const items = buildAttentionItems(counts, links)
    expect(items.find((i) => i.key === 'at-risk')?.tone).toBe('danger')
    expect(items.find((i) => i.key === 'enrollment-requests')?.tone).toBe('warning')
    expect(items.find((i) => i.key === 'justifications')?.tone).toBe('warning')
    expect(items.find((i) => i.key === 'active-sessions')?.tone).toBe('info')
  })

  it('passes through a null href when no target subject exists yet', () => {
    const counts: AttentionCounts = {
      pendingEnrollmentRequests: 3,
      pendingJustifications: 0,
      atRiskStudents: 0,
      activeSessionsNow: 0,
    }
    const items = buildAttentionItems(counts, { ...links, enrollmentRequestsHref: null })
    expect(items[0].href).toBeNull()
  })
})

describe('computeOnboardingSteps', () => {
  it('marks all steps pending on an empty institution', () => {
    const steps = computeOnboardingSteps({
      hasActivePeriod: false,
      careersCount: 0,
      assignedSubjectsCount: 0,
      professorsCount: 0,
      studentsCount: 0,
      enrollmentsCount: 0,
    })
    expect(steps.every((s) => !s.done)).toBe(true)
    expect(steps).toHaveLength(6)
  })

  it('marks a step done as soon as its count is positive', () => {
    const steps = computeOnboardingSteps({
      hasActivePeriod: true,
      careersCount: 2,
      assignedSubjectsCount: 0,
      professorsCount: 3,
      studentsCount: 0,
      enrollmentsCount: 0,
    })
    expect(steps.find((s) => s.key === 'period')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'careers')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'subjects')?.done).toBe(false)
    expect(steps.find((s) => s.key === 'professors')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'students')?.done).toBe(false)
  })
})

describe('isOnboardingComplete', () => {
  it('is false when any step is pending', () => {
    const steps = computeOnboardingSteps({
      hasActivePeriod: true,
      careersCount: 1,
      assignedSubjectsCount: 1,
      professorsCount: 1,
      studentsCount: 1,
      enrollmentsCount: 0,
    })
    expect(isOnboardingComplete(steps)).toBe(false)
  })

  it('is true when every step is done', () => {
    const steps = computeOnboardingSteps({
      hasActivePeriod: true,
      careersCount: 1,
      assignedSubjectsCount: 1,
      professorsCount: 1,
      studentsCount: 1,
      enrollmentsCount: 1,
    })
    expect(isOnboardingComplete(steps)).toBe(true)
  })
})
