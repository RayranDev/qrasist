import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAs } from './utils/auth'
import { getLocalSupabaseEnv } from './utils/supabaseLocal'
import { ADMIN_USER, PROFESSOR_USER, TEST_SUBJECT } from './seed/testUsers'

// RF21 / RF25: the professor corrects attendance only while the class
// is running; once it is over only the coordinator (ADMIN) can.
//
// Self-contained: it arranges its own closed session (class ended an
// hour ago) with the service role and deletes it afterwards, so it
// never touches the seeded session the student specs depend on.
test.describe('attendance edit window', () => {
  test('professor cannot edit a finished class, admin can', async ({ page, browser }) => {
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

    const startedAt = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const { data: session, error } = await admin
      .from('sessions')
      .insert({
        subject_id: subject!.id,
        date: startedAt.toISOString(),
        duration_minutes: 5,
        qr_token: null,
        expires_at: new Date(startedAt.getTime() + 5 * 60 * 1000).toISOString(),
        class_ends_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        is_active: true,
      })
      .select('id')
      .single()
    expect(error).toBeNull()

    try {
      // --- Professor: the finished class is read-only ---------------
      await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)
      await page.goto('/professor/history')
      await page.getByText(TEST_SUBJECT.name, { exact: true }).click()
      await page.getByTestId(`session-card-${session!.id}`).click()

      await expect(
        page.getByText('Solo coordinación puede modificar asistencias de clases pasadas.')
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Marcar presente' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Marcar tarde' })).toHaveCount(0)

      // --- Admin: can correct it from /admin/attendance --------------
      const adminContext = await browser.newContext()
      const adminPage = await adminContext.newPage()
      await loginAs(adminPage, ADMIN_USER.email, ADMIN_USER.password)
      await adminPage.goto(`/admin/attendance?subjectId=${subject!.id}&sessionId=${session!.id}`)

      await expect(adminPage.getByText('0 de 2 inscritos registrados')).toBeVisible()
      await adminPage.getByRole('button', { name: 'Marcar presente' }).first().click()
      const modal = adminPage.getByRole('dialog')
      await modal.getByLabel(/Motivo/).fill('Constancia médica validada por coordinación.')
      await modal.getByRole('button', { name: 'Confirmar', exact: true }).click()

      await expect(adminPage.getByText('1 de 2 inscritos registrados')).toBeVisible()

      await adminContext.close()
    } finally {
      // ON DELETE CASCADE takes the attendance rows with the session.
      await admin.from('sessions').delete().eq('id', session!.id)
    }
  })
})
