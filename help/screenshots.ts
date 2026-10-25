import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'

// Only screens that are not obvious get a picture. The navigation overview,
// settings and the setup wizard are self-explanatory or run once.

async function openChartOfAccounts(page: Page) {
    await navigateToPackage(page, 'books')
    const item = page.getByTestId('books-nav-accounts')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    // Both are visible on desktop, so waiting on either through `.or()` would be a strict-mode violation.
    await toggle.waitFor({ state: 'attached' })
    if (!(await item.isVisible())) await toggle.click()
    await item.click()
    await expect(page.getByTestId('account-search')).toBeVisible()
    await expect(page.locator('[data-testid^="account-row-"]').first()).toBeVisible()
}

async function openBusinessCheckingRegister(page: Page) {
    await openChartOfAccounts(page)
    const row = page
        .locator('[data-testid^="account-row-"]')
        .filter({ hasText: 'Business Checking' })
    await row.locator('[data-testid^="account-menu-"]').click()
    await page.getByRole('menuitem', { name: 'View register', exact: true }).click()
    await expect(page.getByTestId('register-table')).toBeVisible()
    await expect(page.getByTestId('register-loading')).toHaveCount(0)
}

export default {
    'chart-of-accounts': [
        {
            name: 'chart-of-accounts-1',
            setup: openChartOfAccounts,
            target: '[data-testid="account-table"]',
        },
    ],
    'account-register': [
        {
            name: 'account-register-1',
            setup: openBusinessCheckingRegister,
            target: '[data-testid="register-table"]',
        },
    ],
}
