import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

test('the Books package opens from the app rail', async ({ page }) => {
    await login(page)
    await navigateToPackage(page, 'books')
    await expect(page.getByText('Books', { exact: true }).first()).toBeVisible()
})
