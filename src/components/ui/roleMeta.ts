export type UserRole = 'ADMIN' | 'PROFESSOR' | 'STUDENT'

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  PROFESSOR: 'Docente',
  STUDENT: 'Estudiante',
}

export function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'PROFESSOR' || value === 'STUDENT'
}

/** Human label for a role; falls back to the raw value for anything unexpected. */
export function roleLabel(role: string | null | undefined): string {
  return isUserRole(role) ? ROLE_LABEL[role] : (role ?? '')
}
