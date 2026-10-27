/**
 * Pure decision logic and copy for the "change a user's role" confirmation.
 * Kept out of the 'use server' module (only async exports are allowed there) and
 * shared by the server action and the client dialog.
 */
import { ROLE_LABEL, type UserRole } from '@/components/ui/roleMeta'
import { pluralize } from '@/lib/utils/plural'

/** Max subjects listed by name in the warning; the total count is always returned. */
export const IMPACT_LIST_CAP = 10

export interface SubjectRef {
  code: string
  name: string
}

export interface SubjectImpact {
  total: number
  subjects: SubjectRef[]
}

export interface RoleChangeImpact {
  currentRole: UserRole | null
  /** Active enrollments that disappear when a student stops being a student. */
  enrollments: SubjectImpact
  /** Pending enrollment requests that are cancelled for the same reason. */
  pendingRequests: number
  /** Subjects currently assigned to the user as professor; they are unlinked (professor_id cleared). */
  taughtSubjects: SubjectImpact
}

export interface RoleChangeScope {
  /** STUDENT -> anything else: enrollments and pending requests are removed. */
  leavesStudent: boolean
  /** PROFESSOR -> anything else: taught subjects are unlinked and left without a professor. */
  leavesProfessor: boolean
}

export function resolveRoleChangeScope(from: UserRole | null, to: UserRole): RoleChangeScope {
  return {
    leavesStudent: from === 'STUDENT' && to !== 'STUDENT',
    leavesProfessor: from === 'PROFESSOR' && to !== 'PROFESSOR',
  }
}

/** Optional follow-up dialog after a successful role change, by the NEW role. */
export type PostRoleChangeStep = 'assign-subjects' | 'enroll-subjects'

/**
 * PROFESSOR: pick the subjects they will teach. STUDENT: pick the subjects they
 * will be enrolled in. ADMIN: nothing is linked to subjects, so no second step.
 */
export function resolvePostRoleChangeStep(newRole: UserRole): PostRoleChangeStep | null {
  if (newRole === 'PROFESSOR') return 'assign-subjects'
  if (newRole === 'STUDENT') return 'enroll-subjects'
  return null
}

export function emptyRoleChangeImpact(currentRole: UserRole | null): RoleChangeImpact {
  return {
    currentRole,
    enrollments: { total: 0, subjects: [] },
    pendingRequests: 0,
    taughtSubjects: { total: 0, subjects: [] },
  }
}

export function hasRoleChangeImpact(impact: RoleChangeImpact): boolean {
  return (
    impact.enrollments.total > 0 || impact.pendingRequests > 0 || impact.taughtSubjects.total > 0
  )
}

function describeSubjects({ total, subjects }: SubjectImpact): string {
  const listed = subjects.map((s) => `${s.code} ${s.name}`).join(', ')
  const hidden = total - subjects.length
  return hidden > 0 ? `${listed} y ${hidden} más` : listed
}

/**
 * Warning paragraphs for the confirmation dialog, one per consequence. Empty when
 * the change has no impact (the caller then applies it without asking).
 */
export function buildRoleChangeWarning(input: {
  userName: string
  newRole: UserRole
  impact: RoleChangeImpact
}): string[] {
  const { userName, newRole, impact } = input
  const intro = `Al pasar a ${ROLE_LABEL[newRole]}, ${userName}`
  const paragraphs: string[] = []

  const { enrollments, pendingRequests, taughtSubjects } = impact

  if (enrollments.total > 0) {
    const n = enrollments.total
    paragraphs.push(
      `${intro} dejará de ser estudiante y se desmatriculará de ${n} ${pluralize(n, 'materia')}: ${describeSubjects(enrollments)}.`
    )
  }

  if (pendingRequests > 0) {
    const lead =
      enrollments.total > 0
        ? 'Además, se cancelarán'
        : `${intro} dejará de ser estudiante y se cancelarán`
    paragraphs.push(
      `${lead} ${pendingRequests} ${pluralize(pendingRequests, 'solicitud de inscripción pendiente', 'solicitudes de inscripción pendientes')}.`
    )
  }

  if (taughtSubjects.total > 0) {
    const n = taughtSubjects.total
    const one = n === 1
    paragraphs.push(
      `${intro} dejará de ser docente y se desvinculará de ${n} ${pluralize(n, 'materia')}: ${describeSubjects(taughtSubjects)}. ${one ? 'Quedará' : 'Quedarán'} sin docente hasta que asignes uno.`
    )
  }

  return paragraphs
}
