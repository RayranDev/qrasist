/**
 * Deterministic seed for the Playwright E2E suite.
 *
 * Runs AFTER `supabase db reset` against the LOCAL Supabase stack only
 * (never against the shared/production project in .env.local, which
 * this script never reads). Auth users can't be created reliably with
 * plain SQL (password hashing, identities, confirmation state), so
 * this uses the Admin API via the service-role key instead, exactly
 * like the rest of the app's admin-side code (see
 * src/lib/supabase/adminClient.ts).
 *
 * Idempotent-ish: safe to re-run without a reset in between (catalog
 * rows upsert, auth users are looked up if they already exist), which
 * is convenient while iterating locally. CI always runs it right
 * after a fresh `supabase db reset`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getLocalSupabaseEnv } from '../utils/supabaseLocal'
import {
  ADMIN_USER,
  PROFESSOR_USER,
  STUDENT_A,
  STUDENT_B,
  TEST_CAREER,
  TEST_PERIOD,
  TEST_SUBJECT,
} from './testUsers'

async function main() {
  const env = getLocalSupabaseEnv()

  // Guard rail: refuse to run against anything that isn't the local
  // loopback stack, in case someone points SUPABASE env vars at a
  // remote project by mistake before running this script directly.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
    throw new Error(
      `Rechazado: NEXT_PUBLIC_SUPABASE_URL (${env.NEXT_PUBLIC_SUPABASE_URL}) no apunta a localhost. ` +
        'Este script solo puede sembrar datos en el stack local de Supabase.'
    )
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`[seed] Sembrando datos de E2E en ${env.NEXT_PUBLIC_SUPABASE_URL} ...`)

  // ---- Catálogo: carrera y período ----------------------------------
  const { data: career, error: careerError } = await admin
    .from('careers')
    .upsert({ ...TEST_CAREER, is_active: true }, { onConflict: 'code' })
    .select('id')
    .single()
  if (careerError || !career) throw careerError || new Error('No se pudo crear la carrera de E2E.')

  const { data: period, error: periodError } = await admin
    .from('periods')
    .upsert(
      {
        ...TEST_PERIOD,
        start_date: '2026-01-01',
        end_date: '2026-06-30',
        is_active: true,
      },
      { onConflict: 'name' }
    )
    .select('id')
    .single()
  if (periodError || !period) throw periodError || new Error('No se pudo crear el período de E2E.')

  // ---- Usuarios -------------------------------------------------------
  const adminProfile = await getOrCreateUser(admin, ADMIN_USER)
  await admin.from('profiles').update({ role: 'ADMIN', is_active: true }).eq('id', adminProfile.id)

  const professorProfile = await getOrCreateUser(admin, PROFESSOR_USER)
  await admin
    .from('profiles')
    .update({ role: 'PROFESSOR', is_active: true })
    .eq('id', professorProfile.id)
  await admin
    .from('professor_careers')
    .upsert(
      { professor_id: professorProfile.id, career_id: career.id, is_active: true },
      { onConflict: 'professor_id,career_id' }
    )

  const studentAProfile = await getOrCreateUser(admin, STUDENT_A)
  const studentBProfile = await getOrCreateUser(admin, STUDENT_B)
  for (const student of [studentAProfile, studentBProfile]) {
    await admin
      .from('student_careers')
      .upsert(
        { student_id: student.id, career_id: career.id, is_active: true },
        { onConflict: 'student_id,career_id' }
      )
  }

  // ---- Materia asignada al profesor, en la carrera/período de arriba --
  const { data: subject, error: subjectError } = await admin
    .from('subjects')
    .upsert(
      {
        ...TEST_SUBJECT,
        professor_id: professorProfile.id,
        period_id: period.id,
        is_active: true,
      },
      { onConflict: 'code' }
    )
    .select('id')
    .single()
  if (subjectError || !subject)
    throw subjectError || new Error('No se pudo crear la materia de E2E.')

  await admin
    .from('subject_careers')
    .upsert(
      { subject_id: subject.id, career_id: career.id, level: 1, is_active: true },
      { onConflict: 'subject_id,career_id' }
    )

  for (const student of [studentAProfile, studentBProfile]) {
    await admin
      .from('enrollments')
      .upsert(
        { student_id: student.id, subject_id: subject.id },
        { onConflict: 'student_id,subject_id' }
      )
  }

  // ---- Sesión pasada (ya dictada): A asistió, B no --------------------
  // 2 días atrás: dentro de la ventana de 7 días para justificar (ver
  // JUSTIFICATION_WINDOW_DAYS en src/lib/justifications/eligibility.ts)
  // sin importar cuándo corra este script.
  //
  // is_active se deja en TRUE a propósito -- "ya dictada" la da
  // expires_at en el pasado (isSessionAlreadyHeld en eligibility.ts
  // acepta cualquiera de las dos condiciones), no is_active=false.
  // getStudentSubjectRisks (src/lib/attendance/studentSummaries.ts)
  // solo cuenta sesiones is_active=true al armar sessionsHeld para el
  // resumen de /student/history y /student/subjects: is_active=false
  // significa "archivada" (fuera de las estadísticas), no "ya pasó". Si
  // se sembrara con is_active=false, el resumen de asistencia de la
  // materia quedaría en 0 sesiones dictadas y la línea de estado del
  // historial no tendría contenido real que mostrar.
  const sessionDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  const expiresAt = new Date(sessionDate.getTime() + 15 * 60 * 1000)

  const { data: existingPastSession } = await admin
    .from('sessions')
    .select('id')
    .eq('subject_id', subject.id)
    .lt('expires_at', new Date().toISOString())
    .maybeSingle()

  const pastSessionId =
    existingPastSession?.id ??
    (
      await admin
        .from('sessions')
        .insert({
          subject_id: subject.id,
          date: sessionDate.toISOString(),
          duration_minutes: 90,
          qr_token: crypto.randomUUID(),
          expires_at: expiresAt.toISOString(),
          is_active: true,
        })
        .select('id')
        .single()
    ).data?.id

  if (!pastSessionId) throw new Error('No se pudo crear la sesión pasada de E2E.')

  const { data: existingAttendance } = await admin
    .from('attendances')
    .select('id')
    .eq('session_id', pastSessionId)
    .eq('student_id', studentAProfile.id)
    .maybeSingle()

  if (!existingAttendance) {
    const { error: attendanceError } = await admin.from('attendances').insert({
      session_id: pastSessionId,
      student_id: studentAProfile.id,
      scanned_at: new Date(sessionDate.getTime() + 5 * 60 * 1000).toISOString(),
      status: 'PRESENT',
    })
    if (attendanceError) throw attendanceError
  }
  // Student B intentionally has no attendance row for pastSessionId --
  // that's the missed session the justification spec justifies.

  console.log('[seed] Listo. Cuentas de prueba:')
  console.log(`  ADMIN      ${ADMIN_USER.email} / ${ADMIN_USER.password}`)
  console.log(`  PROFESSOR  ${PROFESSOR_USER.email} / ${PROFESSOR_USER.password}`)
  console.log(
    `  STUDENT A  ${STUDENT_A.email} / ${STUDENT_A.password} (asistió a la sesión pasada)`
  )
  console.log(`  STUDENT B  ${STUDENT_B.email} / ${STUDENT_B.password} (faltó a la sesión pasada)`)
  console.log(`  Materia    ${TEST_SUBJECT.code} (id ${subject.id})`)
}

interface SeedUser {
  email: string
  password: string
  firstName: string
  lastName: string
  studentCode?: string
}

async function getOrCreateUser(admin: SupabaseClient, user: SeedUser): Promise<{ id: string }> {
  const metadata: Record<string, string> = {
    first_name: user.firstName,
    last_name: user.lastName,
  }
  if (user.studentCode) metadata.student_code = user.studentCode

  const { data: created, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: metadata,
  })

  if (!error && created.user) {
    await waitForProfile(admin, created.user.id)
    return created.user
  }

  // Ya existe (re-run sin `db reset` de por medio): lo buscamos.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listError) throw listError
  const existing = list.users.find((u) => u.email === user.email)
  if (!existing) throw error || new Error(`No se pudo crear ni encontrar a ${user.email}`)
  return existing
}

/** El profile lo crea el trigger handle_new_user de forma asíncrona
 * respecto al INSERT en auth.users -- se espera activamente en vez de
 * asumir que ya existe, mismo patrón que signup() en
 * src/app/(auth)/login/actions.ts. */
async function waitForProfile(admin: SupabaseClient, userId: string, attempts = 10): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (data) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`El profile de ${userId} nunca apareció (trigger handle_new_user).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Falló:', err)
    process.exit(1)
  })
