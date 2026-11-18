import { expect, type Page, test } from '@playwright/test'
import { DESKTOP, holdLoads, openBooks } from './customer-form-helpers'
import { uniqueMemo } from './invoice-helpers'
import { openSalesTab, salesTabUrl, searchSales } from './sales-lists-helpers'

// The Sales list's states (sales-lists checkpoint 2, spec §3 "States"): the first load's
// LoadingState, the error banner with Retry, and the no-match state with Clear filters.
// The test makes no document: it reads the seeded invoices (the e2e seed always holds
// some) and searches a unique text no document holds.
//
// The "No invoices yet" state cannot be reached on the shared database (the seed holds
// invoices); `emptyTexts` and the `DocumentListStates` props are covered by the unit test
// and gate 2 (`empty-*`).
//
// Not covered by e2e (accepted, plan checkpoint 2):
// - the 50-row window growing: it needs 50+ documents and the screen's 12 tests are used;
//   the `mergeTransactions` and `documentListWindow` unit tests cover it, and
//   tests/e2e/list-paging.spec.ts is where a seeded case can go;
// - an inactive customer in the customer picker (the e2e uses a sub-customer);
// - the reader on a phone (gate 2, `read-only-phone-*`);
// - Download PDF from a row menu (the download leaves the page; the item's presence is
//   asserted);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const INVOICES_URL = '**/api/collections/books_invoices/records**'

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^sales-row-[a-z0-9]{15}$/).filter({ visible: true })
}

function refusedResponse(page: Page, collection: string) {
    return page.waitForResponse(
        r => r.url().includes(`/api/collections/${collection}/records`) && r.status() === 400
    )
}

test.describe('sales-lists: states', () => {
    test('loading, a failed load with Retry, and no match with Clear filters', async ({ page }) => {
        await openBooks(page, DESKTOP)

        // All sales and the Invoices tab ask for the same invoice rows, so the hold starts
        // before the first press, while the store holds none of them.
        const invoices = await holdLoads(page, INVOICES_URL)
        await page.getByTestId('books-nav-sales').click()
        await expect(page).toHaveURL(salesTabUrl('all'))
        await expect.poll(() => invoices.held.length).toBeGreaterThan(0)
        await expect(visible(page, 'sales-loading')).toBeVisible()

        // The held read is refused: the banner and Retry.
        const failed = refusedResponse(page, 'books_invoices')
        await invoices.release({ status: 400 })
        await failed
        const banner = visible(page, 'sales-banner')
        await expect(banner).toContainText('Sales transactions could not load.')
        const retry = visible(page, 'sales-retry')
        await expect(retry).toBeVisible()

        // The release removed the route; Retry shows rows and no banner.
        await retry.click()
        await expect(listRows(page).first()).toBeVisible()
        await expect(visible(page, 'sales-banner')).toHaveCount(0)

        // The Invoices tab: a search no document holds shows the no-match state.
        await openSalesTab(page, 'invoices')
        await expect(listRows(page).first()).toBeVisible()
        await searchSales(page, uniqueMemo('Nothing holds'))
        const noMatch = visible(page, 'sales-no-match')
        await expect(noMatch).toContainText('No invoices match')
        await expect(listRows(page)).toHaveCount(0)

        // Clear filters empties the field and brings the rows back.
        await visible(page, 'sales-clear-filters').click()
        // The tab has rows: the "yet" state never shows while they come back.
        await expect(visible(page, 'sales-empty')).toHaveCount(0)
        await expect(visible(page, 'sales-search')).toHaveValue('')
        await expect(listRows(page).first()).toBeVisible()
        await expect(visible(page, 'sales-no-match')).toHaveCount(0)
    })
})
