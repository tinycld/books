import { expect, type Locator, type Page, test } from '@playwright/test'
import { ENTRIES_SEED } from '../../tinycld/books/lib/journal-entries-fixture'
import { TRANSFER_SEED } from '../../tinycld/books/lib/transfer-fixture'
import { openRegister, revealRegisterItem } from './account-register-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'
import { DESKTOP, startTransfers, TRANSFER_LABELS } from './transfer-helpers'

// The read-view tests read the seeded transfer (`TRANSFER_SEED`). `seed.ts` posts it
// through the server's posting hook as seed data, and the specs only read it, as other
// Books specs read the ENTRIES_SEED rows; they never edit or void it. The read view
// asserts the seed's own amount, From/To pair and poster. transfer-form.spec.ts covers a
// transfer made through the form, so making one here would repeat that post path in
// every read test. The read view, its links and its states are driven through the UI.
//
// It does not cover a reader's view: the e2e book has no non-writer Books user. The
// loading state is transient. The read view's phone layout runs the same components.

const SEED_POSTER = 'Test User'
const ENTRY_ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const REGISTER_ROWS = '[data-testid^="register-row-"]'

async function idFromTestId(locator: Locator, prefix: string): Promise<string> {
    const testId = (await locator.getAttribute('data-testid')) ?? ''
    expect(testId.startsWith(prefix)).toBe(true)
    return testId.slice(prefix.length)
}

// The Journal Entries list is windowed, so the seeded row is found through the search box.
async function findEntryRow(page: Page, memo: string): Promise<Locator> {
    await openEntriesList(page)
    await searchEntries(page, memo)
    const row = page
        .locator(ENTRY_ROWS)
        .filter({ hasText: memo })
        .filter({ hasNotText: /reversal/i })
    await expect(row).toHaveCount(1)
    return row
}

// The in-app move a link with no button makes (no page load).
async function pushPath(page: Page, path: string) {
    await page.evaluate(url => {
        window.history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
}

test.describe('transfer: read view', () => {
    test('opens from the Journal Entries list and from the register, and links to its journal entry', async ({
        page,
    }) => {
        await startTransfers(page, DESKTOP)
        const row = await findEntryRow(page, TRANSFER_SEED.memo)
        const id = await idFromTestId(row, 'entries-row-')

        await expect(page.getByTestId(`entries-cell-type-${id}`)).toHaveText('Transfer')
        const numberCell = page.getByTestId(`entries-cell-number-${id}`)
        await expect(numberCell).toHaveText(/^TR-\d+$/)
        const number = (await numberCell.innerText()).trim()

        await row.click()
        await expect(page).toHaveURL(new RegExp(`/books/transfers/${id}$`))
        const view = page.getByTestId('transfer-read-only')
        await expect(view).toBeVisible()
        await expect(page.getByTestId('transfer-title')).toHaveText(/^Transfer TR-\d+$/)
        await expect(page.getByTestId('transfer-title')).toHaveText(`Transfer ${number}`)
        await expect(page.getByTestId('transfer-badge')).toHaveText('Posted')
        await expect(page.getByTestId('transfer-amount')).toHaveText('$1,500.00')
        await expect(page.getByTestId('transfer-read-from')).toHaveText(TRANSFER_LABELS.checking)
        await expect(page.getByTestId('transfer-read-to')).toHaveText(TRANSFER_LABELS.savings)
        await expect(page.getByTestId('transfer-arrow')).toBeVisible()
        await expect(page.getByTestId('transfer-detail-date')).toContainText(
            /[A-Z][a-z]{2} \d{1,2}, \d{4}/
        )
        await expect(page.getByTestId('transfer-detail-memo')).toContainText(TRANSFER_SEED.memo)
        await expect(page.getByTestId('transfer-posted-by')).toHaveText(
            new RegExp(`^Posted by ${SEED_POSTER}, [A-Z][a-z]{2} \\d{1,2}, \\d{4}, \\d{1,2}:\\d{2}`)
        )
        await expect(page.getByTestId('transfer-voided-by')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Reverse', exact: true })).toHaveCount(0)
        await expect(page.getByTestId('entry-back')).toHaveText('Journal entries')
        await expect(view.getByLabel('Open help')).toBeVisible()

        await page.getByTestId('transfer-view-entry').click()
        await expect(page).toHaveURL(new RegExp(`/books/entries/${id}$`))
        const entryView = page.getByTestId('entry-read-only')
        await expect(entryView).toBeVisible()
        await expect(entryView.getByTestId('entry-line-0')).toBeVisible()
        await expect(entryView.getByTestId('entry-line-1')).toBeVisible()
        await expect(entryView.getByTestId('entry-line-2')).toHaveCount(0)

        await openRegister(page, 'Business Savings')
        const registerRow = page.locator(REGISTER_ROWS).filter({ hasText: TRANSFER_SEED.memo })
        await revealRegisterItem(page, registerRow)
        const lineId = await idFromTestId(registerRow, 'register-row-')
        await expect(page.getByTestId(`register-cell-type-${lineId}`)).toHaveText('Transfer')

        await registerRow.click()
        await expect(
            page.getByTestId('register-drawer-field-type').getByText('Transfer', { exact: true })
        ).toBeVisible()
        await page.getByTestId('register-drawer-open-entry').click()
        await expect(page).toHaveURL(new RegExp(`/books/transfers/${id}$`))
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
    })

    test('shows one error with Retry when the transfer cannot load', async ({ page }) => {
        await startTransfers(page, DESKTOP)
        // pbtsdb reports a load error only for a 4xx other than 401/408/429.
        await page.route('**/api/collections/books_journal_lines/records*', route =>
            route.fulfill({ status: 400 })
        )
        const row = await findEntryRow(page, TRANSFER_SEED.memo)
        await row.click()

        const error = page.getByTestId('transfer-error')
        await expect(error).toContainText('Books could not load this transfer.')
        await expect(error.getByTestId('transfer-retry')).toBeVisible()
        await expect(page.getByTestId('entry-back')).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('transfer-retry').click()
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
        await expect(page.getByTestId('transfer-read-from')).toHaveText(TRANSFER_LABELS.checking)
        await expect(page.getByTestId('transfer-error')).toHaveCount(0)
    })

    test('a link that is not a transfer', async ({ page }) => {
        await startTransfers(page, DESKTOP)
        await pushPath(page, '/a/books/transfers/doesnotexist000')
        const notFound = page.getByTestId('transfer-not-found')
        await expect(notFound).toContainText('This transfer does not exist')
        await expect(notFound.getByTestId('entry-back')).toBeVisible()

        const row = await findEntryRow(page, ENTRIES_SEED.posted)
        const entryId = await idFromTestId(row, 'entries-row-')
        await pushPath(page, `/a/books/transfers/${entryId}`)
        await expect(page).toHaveURL(new RegExp(`/books/entries/${entryId}$`))
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
    })
})
