import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAs } from './utils/auth'
import { getLocalSupabaseEnv } from './utils/supabaseLocal'
import { PROFESSOR_USER, STUDENT_A, TEST_SUBJECT } from './seed/testUsers'

// Self-contained on purpose: it does NOT rely on
// 03-student-history-and-justify.spec.ts having run first. Playwright
// runs each project's files to completion before moving to the next
// project (chromium, then mobile here), so a file in the "mobile"
// project (03) can end up executing AFTER chromium-only files like
// this one regardless of numeric filename order -- relying on
// cross-project ordering here would be fragile. Instead this test
// arranges its own PENDING justification directly (service role, the
// same way submitJustification() would insert it) against a
// throwaway session, then only exercises the professor's review UI.
test.describe('professor: review a justification', () => {
  test('approves it and the student sees "1 justificada"', async ({ page, browser }) => {
    const env = getLocalSupabaseEnv()
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: subject } = await admin
      .from('subjects')
      .select('id')
      .eq('code', TEST_SUBJECT.code)
      .single()
    expect(subject).toBeTruthy()

    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const studentA = users.users.find((u) => u.email === STUDENT_A.email)
    expect(studentA).toBeTruthy()

    // A dedicated throwaway "already held" session student A missed,
    // just for this test -- keeps it independent of whatever the
    // shared seeded session's justification state happens to be.
    const sessionDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    const { data: session, error: sessionError } = await admin
      .from('sessions')
      .insert({
        subject_id: subject!.id,
        date: sessionDate.toISOString(),
        duration_minutes: 90,
        qr_token: crypto.randomUUID(),
        expires_at: new Date(sessionDate.getTime() + 15 * 60 * 1000).toISOString(),
        is_active: true,
      })
      .select('id')
      .single()
    expect(sessionError).toBeNull()

    const { error: justificationError } = await admin.from('absence_justifications').insert({
      student_id: studentA!.id,
      session_id: session!.id,
      subject_id: subject!.id,
      reason: 'Cita médica en la EPS, adjunto constancia el mismo día por la tarde.',
      status: 'PENDING',
    })
    expect(justificationError).toBeNull()

    try {
      await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)
      await page.goto('/professor/justifications')

      const studentFullName = `${STUDENT_A.firstName} ${STUDENT_A.lastName}`
      await expect(page.getByText(studentFullName)).toBeVisible()

      await page.getByRole('button', { name: 'Aprobar' }).first().click()
      await expect(page.getByText('Justificación de').first()).toBeVisible() // toast confirmation

      // Verify as the student, in a separate browser context so we
      // don't mix sessions/cookies with the professor's.
      const studentContext = await browser.newContext()
      const studentPage = await studentContext.newPage()
      await loginAs(studentPage, STUDENT_A.email, STUDENT_A.password)
      await studentPage.goto('/student/subjects')

      await expect(studentPage.getByText(TEST_SUBJECT.name, { exact: true })).toBeVisible()
      await expect(studentPage.getByText('1 justificada')).toBeVisible()

      await studentContext.close()
    } finally {
      // ON DELETE CASCADE on absence_justifications.session_id takes
      // the justification row with it.
      await admin.from('sessions').delete().eq('id', session!.id)
    }
  })
})
