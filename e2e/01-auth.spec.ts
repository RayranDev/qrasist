import { test, expect } from '@playwright/test'
import { loginAs } from './utils/auth'
import { ADMIN_USER, PROFESSOR_USER, STUDENT_A } from './seed/testUsers'

test.describe('auth', () => {
  test('ADMIN logs in and lands on the admin dashboard', async ({ page }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password)
    await expect(page).toHaveURL(/\/admin\/dashboard/)
    await expect(page.getByRole('heading', { name: 'Panel de Control' })).toBeVisible()
  })

  test('PROFESSOR logs in and lands on their subjects page', async ({ page }) => {
    await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)
    await expect(page).toHaveURL(/\/professor\/subjects/)
    await expect(page.getByRole('heading', { name: /^Hola,/ })).toBeVisible()
  })

  test('STUDENT logs in and lands on the scanner', async ({ page }) => {
    await loginAs(page, STUDENT_A.email, STUDENT_A.password)
    await expect(page).toHaveURL(/\/student\/scanner/)
  })

  test('wrong password shows an error on the login form', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Correo Institucional').fill(STUDENT_A.email)
    await page.getByLabel('Contraseña').fill('la-contraseña-incorrecta')
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('Credenciales incorrectas')).toBeVisible()
  })

  test('/reset-password with no session at all redirects to login (proxy auth gate)', async ({
    page,
  }) => {
    // src/proxy.ts (the Next 16 rename of middleware.ts) gates every
    // route except /login, /auth and /forgot-password for anyone
    // without a session -- it redirects before the page's own,
    // recovery-cookie-specific logic ever runs.
    await page.goto('/reset-password')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('/reset-password without a recovery cookie redirects a logged-in user away', async ({
    page,
  }) => {
    // This is the case the page component itself guards (see
    // src/app/(auth)/reset-password/page.tsx): a real session that
    // didn't come from clicking a password-recovery email link (no
    // recovery cookie) must not be able to set a new password blind.
    await loginAs(page, STUDENT_A.email, STUDENT_A.password)
    await page.goto('/reset-password')
    await expect(page).not.toHaveURL(/\/reset-password/)
    await expect(page).toHaveURL(/\/student\/scanner/)
  })
})
