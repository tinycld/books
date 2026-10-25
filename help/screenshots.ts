import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'

// Only screens that are not obvious get a picture. The navigation overview,
// settings and the setup wizard are self-explanatory or run once.

// The table scroller fills the page, so its screenshot has blank space under the
// last row. Shrink the viewport by exactly that space so the shot ends at the content.
async function fitToContent(page: Page, table: Locator, lastRow: Locator) {
    const tableBox = await table.boundingBox()
    const rowBox = await lastRow.boundingBox()
    const viewport = page.viewportSize()
    if (!tableBox || !rowBox || !viewport) throw new Error('cannot measure the table')
    const spare = tableBox.y + tableBox.height - (rowBox.y + rowBox.height)
    await page.setViewportSize({
        width: viewport.width,
        height: viewport.height - Math.floor(spare),
    })
}

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

async function openFittedChart(page: Page) {
    await openChartOfAccounts(page)
    await fitToContent(
        page,
        page.getByTestId('account-table'),
        page.locator('[data-testid^="account-row-"]').last()
    )
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
    await fitToContent(
        page,
        page.getByTestId('register-table'),
        page.getByTestId('register-opening-row')
    )
}

export default {
    'chart-of-accounts': [
        {
            name: 'chart-of-accounts-1',
            setup: openFittedChart,
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
