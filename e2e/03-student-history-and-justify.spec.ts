import { test, expect } from '@playwright/test'
import { loginAs } from './utils/auth'
import { STUDENT_B, TEST_SUBJECT } from './seed/testUsers'

// Runs in the "mobile" project (390x844, see playwright.config.ts) --
// this is the student-facing part of the app.
test.describe('student: history + justify a missed session', () => {
  test('history groups attendance by subject with a status line', async ({ page }) => {
    await loginAs(page, STUDENT_B.email, STUDENT_B.password)
    await page.goto('/student/history')

    await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible()
    await expect(page.getByText(TEST_SUBJECT.name)).toBeVisible()
    // Status line format: "<n> falta(s) de <n> permitidas [· ...]"
    // (see formatSubjectStatusLine in src/lib/attendance/studentSummaries.ts).
    await expect(page.getByText(/falta.*de \d+ permitidas/)).toBeVisible()
  })

  test('justifies the missed session and shows "En revisión"', async ({ page }) => {
    await loginAs(page, STUDENT_B.email, STUDENT_B.password)
    await page.goto('/student/subjects')

    // exact: true -- /student/subjects also renders a RiskBanner link
    // whose text contains the subject name as a substring.
    await expect(page.getByText(TEST_SUBJECT.name, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Justificar' }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page
      .getByLabel('Motivo (10 a 1000 caracteres)')
      .fill('Cita médica en la EPS a la misma hora de la clase, adjunto justificante después.')
    await page.getByRole('button', { name: 'Enviar' }).click()

    // JustifyModal does a window.location.reload() on success (server
    // data was already revalidated) -- the badge only shows up after
    // that full reload completes, so give it a bit more room than the
    // default assertion timeout.
    await expect(page.getByText('En revisión')).toBeVisible({ timeout: 15000 })
  })
})
