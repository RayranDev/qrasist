/**
 * Lógica pura para el panel "Hoy" del dashboard admin (qué necesita
 * acción ahora) y el checklist de primeros pasos. Separada de
 * page.tsx para poder probarla sin Supabase y para alimentar la ruta
 * de previsualización con props fijas.
 */

export type AttentionTone = 'warning' | 'danger' | 'info'

export interface AttentionItem {
  key: string
  label: string
  count: number
  href: string | null
  tone: AttentionTone
}

export interface AttentionCounts {
  pendingEnrollmentRequests: number
  pendingJustifications: number
  atRiskStudents: number
  activeSessionsNow: number
}

export interface AttentionLinks {
  enrollmentRequestsHref: string | null
  justificationsHref: string
  atRiskStudentsHref: string
  activeSessionsHref: string
}

/**
 * Arma la lista de items de atención a partir de conteos ya
 * calculados por la página. Solo incluye items con count > 0 -- la
 * fila con count 0 no aporta nada y el llamador decide mostrar el
 * mensaje "Nada pendiente" cuando la lista queda vacía.
 */
export function buildAttentionItems(
  counts: AttentionCounts,
  links: AttentionLinks
): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      key: 'enrollment-requests',
      label:
        counts.pendingEnrollmentRequests === 1
          ? 'Solicitud de inscripción pendiente'
          : 'Solicitudes de inscripción pendientes',
      count: counts.pendingEnrollmentRequests,
      href: links.enrollmentRequestsHref,
      tone: 'warning',
    },
    {
      key: 'justifications',
      label:
        counts.pendingJustifications === 1
          ? 'Justificación de inasistencia pendiente'
          : 'Justificaciones de inasistencia pendientes',
      count: counts.pendingJustifications,
      href: links.justificationsHref,
      tone: 'warning',
    },
    {
      key: 'at-risk',
      label:
        counts.atRiskStudents === 1
          ? 'Estudiante en riesgo por inasistencias'
          : 'Estudiantes en riesgo por inasistencias',
      count: counts.atRiskStudents,
      href: links.atRiskStudentsHref,
      tone: 'danger',
    },
    {
      key: 'active-sessions',
      label: counts.activeSessionsNow === 1 ? 'Sesión activa ahora' : 'Sesiones activas ahora',
      count: counts.activeSessionsNow,
      href: links.activeSessionsHref,
      tone: 'info',
    },
  ]

  return items.filter((item) => item.count > 0)
}

export interface OnboardingCounts {
  hasActivePeriod: boolean
  careersCount: number
  assignedSubjectsCount: number
  professorsCount: number
  studentsCount: number
  enrollmentsCount: number
}

export interface OnboardingStep {
  key: string
  label: string
  done: boolean
  href: string
}

/**
 * Cada paso depende de que existan datos reales -- no hay estado de
 * "completado" persistido en la base, se deriva de conteos en vivo
 * para que nunca quede desincronizado (ej. si borran la única
 * carrera, el paso vuelve a aparecer pendiente).
 */
export function computeOnboardingSteps(counts: OnboardingCounts): OnboardingStep[] {
  return [
    {
      key: 'period',
      label: 'Crear período activo',
      done: counts.hasActivePeriod,
      href: '/admin/academic',
    },
    {
      key: 'careers',
      label: 'Crear carreras',
      done: counts.careersCount > 0,
      href: '/admin/academic',
    },
    {
      key: 'subjects',
      label: 'Crear materias (asignadas a período y carrera)',
      done: counts.assignedSubjectsCount > 0,
      href: '/admin/subjects',
    },
    {
      key: 'professors',
      label: 'Crear o importar profesores',
      done: counts.professorsCount > 0,
      href: '/admin/users?role=PROFESSOR',
    },
    {
      key: 'students',
      label: 'Crear o importar estudiantes',
      done: counts.studentsCount > 0,
      href: '/admin/users?role=STUDENT',
    },
    {
      key: 'enrollments',
      label: 'Inscribir estudiantes',
      done: counts.enrollmentsCount > 0,
      href: '/admin/subjects',
    },
  ]
}

export function isOnboardingComplete(steps: OnboardingStep[]): boolean {
  return steps.every((step) => step.done)
}
