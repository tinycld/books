import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

// Every data change below goes through the UI. The seed has no read-only Books
// member, so the read-only paths (no New button, no menu, no checkboxes, read-only
// panel, access message) are covered by the unit tests, not here.

// A fresh suffix per run, so a re-run against the same database finds no leftover rows.
const RUN = Date.now()
const MARKETING = `E2E Marketing ${RUN}`
const IMPORTED_PARENT = `Imported Parent ${RUN}`
const IMPORTED_CHILD = `Imported Child ${RUN}`

const IMPORT_CSV = [
    'Number,Name,Type,Detail type,Parent,Description,Inactive',
    `8300,${IMPORTED_PARENT},Expense,Office and general,,,`,
    `8310,${IMPORTED_CHILD},Expense,Office and general,${IMPORTED_PARENT},,`,
    // Already in the seed: must be Skipped, not an error for its number.
    '6100,Rent,Expense,Rent or lease,,,',
].join('\n')

function row(page: Page, name: string) {
    return page.locator('[data-testid^="account-row-"]').filter({ hasText: name })
}

async function openChartOfAccounts(page: Page) {
    const item = page.getByTestId('books-nav-accounts')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    // On desktop both are visible, so waiting on either through `.or()` is a strict-mode violation.
    await toggle.waitFor({ state: 'attached' })
    if (!(await item.isVisible())) {
        await toggle.click()
    }
    await item.click()
    await expect(page.getByText('Chart of Accounts', { exact: true }).first()).toBeVisible()
}

async function openRowMenu(page: Page, name: string) {
    await row(page, name).locator('[data-testid^="account-menu-"]').click()
}

async function createAccount(page: Page, name: string, type: string, detailType: string) {
    await page.getByTestId('account-new-toolbar').click()
    const panel = page.getByTestId('account-panel')
    await expect(panel).toBeVisible()
    await page.getByLabel('Account name').fill(name)
    await panel.getByRole('radio', { name: type, exact: true }).click()
    await panel.getByRole('radio', { name: detailType, exact: true }).click()
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row(page, name)).toBeVisible()
}

test.describe('chart-of-accounts: list, edit and import', () => {
    test('browse, edit, delete and import accounts', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await openChartOfAccounts(page)

        await expect(page.getByText('All lists', { exact: true })).toBeVisible()

        // The tree: a child sits beneath its parent, and collapsing hides it.
        const software = row(page, 'Software Subscriptions')
        const design = row(page, 'Design Tools')
        await expect(software).toBeVisible()
        await expect(design).toBeVisible()
        const parentBox = await software.boundingBox()
        const childBox = await design.boundingBox()
        expect(childBox?.y ?? 0).toBeGreaterThan(parentBox?.y ?? 0)
        await software.locator('[data-testid^="account-caret-"]').click()
        await expect(design).toHaveCount(0)
        await expect(software.getByText('incl. sub-accounts')).toBeVisible()
        await software.locator('[data-testid^="account-caret-"]').click()
        await expect(design).toBeVisible()

        // Search narrows the list to the matching rows only.
        const search = page.getByTestId('account-search')
        await search.fill('rent')
        await expect(row(page, 'Rent')).toBeVisible()
        await expect(page.locator('[data-testid^="account-row-"]')).toHaveCount(1)
        await expect(row(page, 'Business Checking')).toHaveCount(0)
        await search.fill('')
        await expect(row(page, 'Business Checking')).toBeVisible()

        // Inactive accounts are hidden until asked for.
        await expect(row(page, 'Old Petty Cash')).toHaveCount(0)
        await page.getByTestId('account-show-inactive').click()
        await expect(row(page, 'Old Petty Cash')).toBeVisible()
        await expect(row(page, 'Old Petty Cash').getByText('Inactive')).toBeVisible()
        await page.getByTestId('account-show-inactive').click()
        await expect(row(page, 'Old Petty Cash')).toHaveCount(0)

        // Opening a row shows its panel; Cancel closes it without a change.
        await row(page, 'Business Checking').click()
        const panel = page.getByTestId('account-panel')
        await expect(panel).toBeVisible()
        await expect(page.getByLabel('Account name')).toHaveValue('Business Checking')
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(panel).toHaveCount(0)

        // New account, then make it inactive: it leaves the default list.
        await createAccount(page, MARKETING, 'Expense', 'Advertising and marketing')
        await openRowMenu(page, MARKETING)
        await page.getByRole('menuitem', { name: 'Make inactive' }).click()
        await expect(row(page, MARKETING)).toHaveCount(0)

        // An account with journal activity cannot be deleted.
        await openRowMenu(page, 'Business Checking')
        await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
        const blocked = page.getByTestId('delete-account-dialog-body')
        await expect(blocked).toBeVisible()
        await expect(blocked.getByText('This account is used on journal lines')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
        await page.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(blocked).toHaveCount(0)
        await expect(row(page, 'Business Checking')).toBeVisible()

        // A new, unused account can be deleted through the dialog.
        await createAccount(page, 'E2E Disposable', 'Income', 'Service income')
        await openRowMenu(page, 'E2E Disposable')
        await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
        await page.getByRole('button', { name: 'Delete', exact: true }).click()
        await expect(row(page, 'E2E Disposable')).toHaveCount(0)

        // Import: upload, map, preview, run, summary, back to the tree.
        await page.getByTestId('account-import-link').click()
        await page.getByTestId('account-import-file').setInputFiles({
            name: 'accounts.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(IMPORT_CSV),
        })

        // Each field is auto-matched to the file column with the same header.
        const matched = {
            number: 'Number',
            name: 'Name',
            type: 'Type',
            detail_type: 'Detail type',
            parent: 'Parent',
            description: 'Description',
            inactive: 'Inactive',
        }
        for (const [field, header] of Object.entries(matched)) {
            const mapped = page.getByTestId(`account-import-map-${field}`)
            await expect(mapped).toBeVisible()
            await expect(page.getByTestId(`account-import-map-${field}-pick`)).toContainText(header)
            await expect(mapped).not.toContainText('Not mapped')
        }
        await page.getByTestId('account-import-next').click()

        await expect(page.getByText('Ready', { exact: true })).toHaveCount(2)
        await expect(page.getByText('Skipped: already exists')).toHaveCount(1)
        await page.getByTestId('account-import-run').click()

        await expect(page.getByText('2 created')).toBeVisible()
        await expect(page.getByText('1 skipped')).toBeVisible()
        await page.getByTestId('account-import-done').click()

        await expect(row(page, IMPORTED_PARENT)).toBeVisible()
        await expect(row(page, IMPORTED_CHILD)).toBeVisible()
        // Done pops back instead of pushing, so only one Chart of Accounts is mounted.
        await expect(page.getByTestId('account-search')).toHaveCount(1)
    })
})
