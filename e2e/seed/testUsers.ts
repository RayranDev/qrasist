/**
 * Single source of truth for the deterministic accounts the E2E seed
 * script creates and the specs log in with. Keeping this in one file
 * means a spec and the seed script can never drift on an email or
 * password.
 */

export const TEST_CAREER = {
  code: 'SIS-E2E',
  name: 'Ingeniería de Sistemas (E2E)',
}

export const TEST_PERIOD = {
  name: '2026-1-E2E',
}

export const TEST_SUBJECT = {
  code: 'ALG-E2E',
  name: 'Algoritmos (E2E)',
}

// chk_email_domain (see supabase/migrations/005_setup_inicial.sql)
// only exempts role = 'ADMIN' from the institutional domain -- but
// handle_new_user always inserts the profile as STUDENT first (the
// role gets promoted afterwards by a separate UPDATE, same as
// createUserAccount() in src/lib/actions/admin.ts does), so at the
// moment the trigger's INSERT runs there's no ADMIN row yet and a
// non-institutional email would violate the constraint. Using an
// institutional email here sidesteps that regardless of role.
export const ADMIN_USER = {
  email: 'admin.e2e@urepublicana.edu.co',
  password: 'AdminE2E123!',
  firstName: 'Admin',
  lastName: 'E2E',
}

export const PROFESSOR_USER = {
  email: 'profesor.e2e@urepublicana.edu.co',
  password: 'ProfesorE2E123!',
  firstName: 'Profesor',
  lastName: 'E2E',
}

// Student A: attended the seeded past session.
export const STUDENT_A = {
  email: 'estudiante.a.e2e@urepublicana.edu.co',
  password: 'StudentE2E123!',
  firstName: 'EstudianteA',
  lastName: 'E2E',
  studentCode: '202601000013',
}

// Student B: missed the seeded past session (used by the justification spec).
export const STUDENT_B = {
  email: 'estudiante.b.e2e@urepublicana.edu.co',
  password: 'StudentE2E123!',
  firstName: 'EstudianteB',
  lastName: 'E2E',
  studentCode: '202602000012',
}
