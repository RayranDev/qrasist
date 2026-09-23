import { expect, type Page } from '@playwright/test'

/**
 * Logs in through the real /login form (role-based selectors, no
 * shortcuts through the API) and waits for the post-login redirect
 * away from /login, which /dashboard resolves per-role.
 */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Correo Institucional').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

export async function expectLoginError(page: Page, message: string) {
  await expect(page.getByText(message)).toBeVisible()
}
