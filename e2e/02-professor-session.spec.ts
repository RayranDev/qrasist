import { test, expect } from '@playwright/test'
import { loginAs } from './utils/auth'
import { PROFESSOR_USER } from './seed/testUsers'

test.describe('professor: live session', () => {
  test('opens a session, sees the QR + roster, marks and removes a manual mark', async ({
    page,
  }) => {
    await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)
    await expect(page).toHaveURL(/\/professor\/subjects/)

    // The seed gives this professor exactly one subject, so the button
    // is unambiguous without scoping to a specific card.
    await page.getByRole('button', { name: 'Iniciar Sesión (Generar QR)' }).click()
    await page.waitForURL(/\/professor\/session\//)

    await expect(page.getByText('Código activo en rotación antifraude')).toBeVisible()
    await expect(page.locator('svg').first()).toBeVisible()

    // Roster: brand-new session, nobody registered yet.
    await expect(page.getByText('0 de 2 inscritos registrados')).toBeVisible()

    // Mark one of the two enrolled students as "Tarde" with a reason.
    // The confirm/cancel buttons live inside the ReasonModal dialog --
    // scoped there so "Quitar" doesn't strict-mode-clash with the
    // roster row's "Quitar asistencia" icon button (substring match).
    await page.getByRole('button', { name: 'Marcar tarde' }).first().click()
    const lateModal = page.getByRole('dialog')
    await lateModal.getByLabel(/Motivo/).fill('Llegó 20 minutos después de iniciada la clase.')
    await lateModal.getByRole('button', { name: 'Confirmar', exact: true }).click()

    await expect(page.getByText('1 de 2 inscritos registrados')).toBeVisible()
    await expect(page.getByText('Tarde').first()).toBeVisible()
    await expect(page.getByText('Manual').first()).toBeVisible()

    // Remove the manual mark: roster goes back to 0/2.
    await page.getByRole('button', { name: 'Quitar asistencia' }).first().click()
    const removeModal = page.getByRole('dialog')
    await removeModal.getByLabel(/Motivo/).fill('Se marcó por error, el estudiante nunca llegó.')
    await removeModal.getByRole('button', { name: 'Quitar', exact: true }).click()

    await expect(page.getByText('0 de 2 inscritos registrados')).toBeVisible()
  })
})
