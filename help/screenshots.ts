import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import type { ScreenshotPlan } from '@tinycld/package-scripts/help-screenshots'
import { RECONCILIATION_REPORT_SEED } from '../tinycld/books/lib/reconciliation-report-fixture'

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
    await item.click()
    await expect(page.getByTestId('account-search')).toBeVisible()
    await expect(page.locator('[data-testid^="account-row-"]').first()).toBeVisible()
}

async function openDashboardForHelp(page: Page) {
    await navigateToPackage(page, 'books')
    await page.getByTestId('books-nav-dashboard').click()
    // Amounts draw masked until the preference loads, so wait for a real figure.
    await expect(
        page.getByTestId('dashboard-invoices-unpaid').filter({ visible: true })
    ).toHaveText(/\d\.\d{2}/)
    // The page scrolls, so the grid runs past the viewport: grow the viewport to the grid's
    // bottom edge so the shot holds every card whole.
    const grid = page.getByTestId('dashboard-grid').filter({ visible: true })
    await expect(grid.getByTestId('dashboard-sales-report')).toBeVisible()
    const box = await grid.boundingBox()
    const viewport = page.viewportSize()
    if (!box || !viewport) throw new Error('cannot measure the dashboard grid')
    const bottom = Math.ceil(box.y + box.height) + 24
    if (bottom > viewport.height) {
        await page.setViewportSize({ width: viewport.width, height: bottom })
    }
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

// The seeded AMAZON MARKETPLACE row of 1000 Business Checking fits no Books transaction,
// so its drawer opens on the Categorize way.
const AMAZON = 'AMAZON MARKETPLACE'

async function openBankCategorizeForShot(page: Page) {
    await openBankReviewForShot(page)
    await page
        .locator('[data-testid="bank-review-table-rows"] [data-testid^="bank-review-row-"]')
        .filter({ has: page.getByText(AMAZON, { exact: true }) })
        .getByText(AMAZON, { exact: true })
        .click()
    await expect(page.getByTestId('bank-cat-section')).toBeVisible()
    await expect(page.getByTestId('bank-cat-account-0')).toBeVisible()
}

// The same drawer after Split: two line cards and the totals line.
async function openBankSplitForShot(page: Page) {
    await openBankCategorizeForShot(page)
    await page.getByTestId('bank-cat-split').click()
    await expect(page.getByTestId('bank-cat-line-1')).toBeVisible()
    await expect(page.getByTestId('bank-cat-totals')).toBeVisible()
}

// The seed categorizes DROPBOX BUSINESS to 6200 Software Subscriptions, so its Reviewed
// drawer shows Added to Books.
const DROPBOX = 'DROPBOX BUSINESS'

async function openBankAddedForShot(page: Page) {
    await selectCheckingForShot(page)
    await page.getByTestId('bank-tabs-reviewed').click()
    const body = page.getByTestId('bank-tab-body-reviewed')
    await expect(body).toBeVisible()
    await body
        .locator('[data-testid^="bank-review-row-"]')
        .filter({ has: page.getByText(DROPBOX, { exact: true }) })
        .getByText(DROPBOX, { exact: true })
        .click()
    await expect(page.getByTestId('bank-added-section')).toBeVisible()
    await expect(page.getByTestId('bank-added-by')).toBeVisible()
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

// The seed reconciles two entries of 1010 Business Savings (statement of Aug 31, 2026) and
// leaves a reconciliation in progress on it (RECONCILE_SEED in lib/reconcile-fixture.ts).
const SAVINGS = '1010 Business Savings'

async function openReconcileForShot(page: Page) {
    await openSavingsRow(page)
}

async function openSavingsRow(page: Page) {
    await navigateToPackage(page, 'books')
    const item = page.getByTestId('books-nav-reconcile')
    await item.click()
    await expect(page.getByTestId('reconcile-accounts-table')).toBeVisible()
    const row = savingsRow(page)
    await expect(row).toBeVisible()
    return row
}

function savingsRow(page: Page) {
    return page
        .locator('[data-testid^="reconcile-account-"]')
        .filter({ has: page.getByText(SAVINGS, { exact: true }), visible: true })
}

// The work screen of the seeded reconciliation in progress on 1010 Business Savings.
async function openReconcileWorkForShot(page: Page) {
    const row = await openSavingsRow(page)
    await row.locator('[data-testid^="reconcile-resume-"]').click()
    await expect(page.getByTestId('reconcile-screen')).toBeVisible()
    await expect(page.getByTestId('reconcile-summary')).toBeVisible()
    await expect(page.locator('[data-testid^="reconcile-row-"]').first()).toBeVisible()
}

// The finished summary of the seeded statement of Aug 31, 2026, from its Reconciled through
// link.
async function openReconcileFinishedForShot(page: Page) {
    const row = await openSavingsRow(page)
    await row.locator('[data-testid^="reconcile-through-"]').click()
    await expect(page.getByTestId('reconcile-finished')).toBeVisible()
}

// The History tab of Reconcile at 1280, as the seeded admin.
async function openReconcileHistoryForShot(page: Page) {
    const viewport = page.viewportSize()
    await page.setViewportSize({ width: 1280, height: viewport?.height ?? 800 })
    await openSavingsRow(page)
    await page.getByTestId('reconcile-tab-history').filter({ visible: true }).click()
    await expect(page.getByTestId('reconcile-history-table')).toBeVisible()
    await expect(seededHistoryRow(page)).toBeVisible()
}

// The seeded statement of Aug 31, 2026 of 2100 Company Card, the latest of its account.
function seededHistoryRow(page: Page) {
    return page
        .getByTestId(`reconcile-history-row-${RECONCILIATION_REPORT_SEED.latest.id}`)
        .filter({ visible: true })
}

// The Reconciliation Report of that statement, from its View report link.
async function openReconciliationReportForShot(page: Page) {
    await openReconcileHistoryForShot(page)
    await page
        .getByTestId(`reconcile-history-report-${RECONCILIATION_REPORT_SEED.latest.id}`)
        .filter({ visible: true })
        .click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
}

// The undo dialog of that statement, from its finished summary's More menu.
async function openReconcileUndoForShot(page: Page) {
    await openReconcileHistoryForShot(page)
    await seededHistoryRow(page).click()
    await expect(page.getByTestId('reconcile-finished').filter({ visible: true })).toBeVisible()
    await page.getByTestId('reconcile-finished-more').filter({ visible: true }).click()
    await page.getByTestId('reconcile-menu-undo').filter({ visible: true }).click()
    await expect(page.getByTestId('reconcile-undo-text').filter({ visible: true })).toBeVisible()
}

export default {
    dashboard: [
        {
            name: 'dashboard-1',
            setup: openDashboardForHelp,
            target: '[data-testid="dashboard-grid"]',
        },
    ],
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
    'bank-categorize': [
        {
            name: 'bank-categorize-1',
            setup: openBankCategorizeForShot,
            target: '[data-testid="bank-txn-drawer"]',
        },
        {
            name: 'bank-categorize-2',
            setup: openBankSplitForShot,
            target: '[data-testid="bank-txn-drawer"]',
        },
        {
            name: 'bank-categorize-3',
            setup: openBankAddedForShot,
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
    reconcile: [
        {
            name: 'reconcile-1',
            setup: openReconcileForShot,
            target: '[data-testid="reconcile-accounts-screen"]',
        },
        {
            name: 'reconcile-2',
            setup: openReconcileWorkForShot,
            target: '[data-testid="reconcile-screen"]',
        },
        {
            name: 'reconcile-3',
            setup: openReconcileFinishedForShot,
            target: '[data-testid="reconcile-screen"]',
        },
        {
            name: 'reconcile-4',
            setup: openReconcileHistoryForShot,
            target: '[data-testid="reconcile-history-screen"]',
        },
        {
            name: 'reconcile-5',
            setup: openReconciliationReportForShot,
            target: '[data-testid="report-screen"]',
        },
        {
            name: 'reconcile-6',
            setup: openReconcileUndoForShot,
            target: '[data-testid="reconcile-undo-dialog"]',
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
