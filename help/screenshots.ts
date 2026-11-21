import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import type { ScreenshotPlan } from '@tinycld/package-scripts/help-screenshots'

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

// The seeded 1000 Business Checking connection holds the seeded statement files.
async function selectCheckingForShot(page: Page) {
    await navigateToPackage(page, 'books')
    await page.getByTestId('books-nav-banking').click()
    const checking = page
        .getByTestId('bank-strip')
        .locator('[data-testid^="bank-card-"]')
        .filter({ has: page.getByText('1000 Business Checking', { exact: true }) })
    await checking.click()
    await expect(checking).toHaveAttribute('aria-selected', 'true')
}

// The seeded checking-2026-10.ofx left nine transactions for review on 1000 Business
// Checking (fifteen lines, four excluded, one matched and one categorized by the seed); the
// page opens on For review.
async function openBankReviewForShot(page: Page) {
    await selectCheckingForShot(page)
    await expect(page.getByTestId('bank-tab-body-review')).toBeVisible()
    await expect(
        page.locator('[data-testid="bank-review-table-rows"] [data-testid^="bank-review-row-"]')
    ).toHaveCount(9)
}

// The seeded PACIFIC POWER AUTOPAY row of 1000 Business Checking has one suggestion
// (seed.ts REVIEW_SEED_ENTRIES), so the For review row shows its check and suggestion.
const PACIFIC_POWER = 'PACIFIC POWER AUTOPAY'

function pacificPowerRow(page: Page) {
    return page
        .locator('[data-testid="bank-review-table-rows"] [data-testid^="bank-review-row-"]')
        .filter({ has: page.getByText(PACIFIC_POWER, { exact: true }) })
}

// A viewport tall enough for the nine rows, then fitted to the last one, so the shot holds
// the PACIFIC POWER AUTOPAY row with its mark.
async function openBankMatchListForShot(page: Page) {
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('no viewport')
    await page.setViewportSize({ width: viewport.width, height: 1300 })
    await openBankReviewForShot(page)
    const row = pacificPowerRow(page)
    await expect(row.locator('[data-testid^="bank-review-suggestion-"]')).toBeVisible()
    await fitToContent(
        page,
        page.getByTestId('bank-review-table'),
        page
            .locator('[data-testid="bank-review-table-rows"] [data-testid^="bank-review-row-"]')
            .last()
    )
}

// The row's drawer, with the Match section and its one suggestion checked.
async function openBankMatchDrawerForShot(page: Page) {
    await openBankMatchListForShot(page)
    await pacificPowerRow(page).getByText(PACIFIC_POWER, { exact: true }).click()
    await expect(page.getByTestId('bank-match-section')).toBeVisible()
    await expect(page.locator('[data-testid^="bank-match-option-"]')).toHaveCount(1)
    await expect(page.getByTestId('bank-match-submit')).toBeEnabled()
}

async function openBankingForShot(page: Page) {
    await selectCheckingForShot(page)
    // The upload area and the file list live in the panel's Files tab.
    await page.getByTestId('bank-tabs-files').click()
    await expect(page.getByTestId('bank-tab-body-files')).toBeVisible()
    await expect(page.getByTestId('bank-files')).toBeVisible()
}

// The seeded checking-2026-09.csv waits to import on 1000 Business Checking: its import
// opens on Map columns. Nothing is imported.
async function openBankImportForShot(page: Page) {
    await openBankingForShot(page)
    const row = page
        .locator('[data-testid^="bank-file-"]')
        .filter({ has: page.getByText('checking-2026-09.csv', { exact: true }) })
        .first()
    await row.locator('[data-testid^="bank-file-import-"]').click()
    await expect(page.getByTestId('bank-import-map')).toBeVisible()
}

// The seeded Harborview Kitchen holds the two seeded statements (seed.ts): its page on the
// Statements tab, with both rows shown.
async function openStatementsTabForShot(page: Page) {
    await navigateToPackage(page, 'books')
    await page.getByTestId('books-nav-lists').click()
    await page.getByTestId('books-list-card-customers').filter({ visible: true }).click()
    const list = page.getByTestId('customers-list').filter({ visible: true })
    await expect(list).toBeVisible()
    const search = page.getByTestId('customers-search').filter({ visible: true })
    await search.fill('Harborview Kitchen')
    await expect(list).not.toHaveAttribute('aria-busy', 'true')
    await list
        .locator('[data-testid^="customer-row-"]')
        .filter({ has: page.getByText('Harborview Kitchen', { exact: true }) })
        .click()
    await page.getByTestId('customer-tab-statements').click()
    const tab = page.getByTestId('customer-statements')
    await expect(tab).toBeVisible()
    await expect(tab.locator('[data-testid^="statement-row-menu-"]')).toHaveCount(2)
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
    banking: [
        {
            name: 'banking-1',
            setup: openBankingForShot,
            target: '[data-testid="banking-screen"]',
        },
    ],
    'bank-review': [
        {
            name: 'bank-review-1',
            setup: openBankReviewForShot,
            target: '[data-testid="banking-screen"]',
        },
    ],
    'bank-match': [
        {
            name: 'bank-match-1',
            setup: openBankMatchListForShot,
            target: '[data-testid="banking-screen"]',
        },
        {
            name: 'bank-match-2',
            setup: openBankMatchDrawerForShot,
            target: '[data-testid="bank-txn-drawer"]',
        },
    ],
    'bank-import': [
        {
            name: 'bank-import-1',
            setup: openBankImportForShot,
            target: '[data-testid="bank-import-screen"]',
        },
    ],
    statements: [
        {
            name: 'statements-1',
            setup: openStatementsTabForShot,
            target: '[data-testid="customer-statements"]',
        },
    ],
} satisfies ScreenshotPlan
