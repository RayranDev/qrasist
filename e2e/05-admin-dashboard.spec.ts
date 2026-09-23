import { test, expect } from '@playwright/test'
import { loginAs } from './utils/auth'
import { ADMIN_USER } from './seed/testUsers'

test.describe('admin', () => {
  test('dashboard shows the attention area and hides onboarding (data is complete)', async ({
    page,
  }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password)
    await expect(page).toHaveURL(/\/admin\/dashboard/)

    // AttentionArea always renders something -- either the "Hoy" list
    // or the calm "nothing pending" line (see AttentionArea.tsx).
    const attentionEmpty = page.getByText('Nada pendiente por ahora.')
    const attentionList = page.getByRole('heading', { name: 'Hoy' })
    await expect(attentionEmpty.or(attentionList)).toBeVisible()

    // The seed leaves every onboarding step done (active period,
    // career, a subject assigned to both, a professor, two students,
    // enrollments) -- OnboardingChecklist must not render at all.
    await expect(page.getByText('Primeros pasos')).toHaveCount(0)
  })

  test('audit log lists the justification approval', async ({ page }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password)
    await page.goto('/admin/audit')

    await expect(page.getByRole('heading', { name: 'Bitácora de Auditoría' })).toBeVisible()
    // Scoped to the table cell -- the same label also appears as an
    // <option> in the action filter dropdown above the table.
    await expect(page.getByRole('cell', { name: 'Aprobó una justificación' })).toBeVisible()
  })
})
