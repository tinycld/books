import { expect, type Page, test } from '@playwright/test'
import { purchaseRow, purchaseTabUrl, searchPurchases } from './purchase-lists-helpers'
import { DESKTOP, holdLoads, openBooks } from './record-form-helpers'

// The Expenses list's states (purchase-lists checkpoint 3, spec §3 "States"): the first
// load's LoadingState, the error banner with Retry, and the kept rows with `aria-busy`
// while a filter change loads. The test makes no document: it reads the seeded bill 1057
// (PURCHASE_LIST_SEED), found by its memo.
//
// Not covered by e2e (accepted, plan checkpoint 3):
// - the 50-row window growing (the hook test of checkpoint 1 covers it with 120 rows);
// - the "No bills yet" state (the shared e2e database always holds bills; `emptyTexts` is
//   unit-tested and gate 2 compares the `empty-*` shots);
// - the chip matrix beyond Draft and Overdue, the row menu of a void row, of an expense
//   and of a vendor refund, and the vendor refund's Void text (unit case tables);
// - the pending state of a confirm dialog (the shared dialog, proven by
//   tests/e2e/sales-lists-actions.spec.ts);
// - the vendor picker's load error with Retry (`SearchPicker`'s own state, proven for the
//   same component by tests/e2e/sales-lists-filters.spec.ts);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const BILLS_URL = '**/api/collections/books_bills/records**'
const BILL_1057 = 'plbill000001057'

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function refusedResponse(page: Page, collection: string) {
    return page.waitForResponse(
        r => r.url().includes(`/api/collections/${collection}/records`) && r.status() === 400
    )
}

test.describe('purchase-lists: states', () => {
    test('shows the loading state, the load error with Retry, then the rows', async ({ page }) => {
        await openBooks(page, DESKTOP)

        // (a) All purchases and the Bills tab ask for bill rows, so the hold starts before
        // the area opens, while the store holds none of the Bills tab's rows.
        const bills = await holdLoads(page, BILLS_URL)
        await page.getByTestId('books-nav-expenses').click()
        await expect(page).toHaveURL(purchaseTabUrl('all'))
        await visible(page, 'purchases-tab-bills').click()
        await expect(page).toHaveURL(purchaseTabUrl('bills'))
        await expect.poll(() => bills.held.length).toBeGreaterThan(0)
        await expect(visible(page, 'purchases-loading')).toBeVisible()

        // (b) The held read is refused: the purchase banner and Retry.
        const failed = refusedResponse(page, 'books_bills')
        await bills.release({ status: 400 })
        await failed
        await expect(visible(page, 'purchases-banner')).toContainText(
            'Purchase transactions could not load.'
        )
        const retry = visible(page, 'purchases-retry')
        await expect(retry).toBeVisible()

        // (c) The release removed the route; Retry restarts the read.
        await retry.click()
        await searchPurchases(page, 'Hosted phone plan')
        await expect(purchaseRow(page, BILL_1057)).toBeVisible()
        await expect(visible(page, 'purchases-banner')).toHaveCount(0)

        // (d) A chip change with the next read held keeps the last rows, marked busy.
        const next = await holdLoads(page, BILLS_URL)
        await visible(page, 'purchases-chip-draft').click()
        await expect.poll(() => next.held.length).toBeGreaterThan(0)
        await expect(purchaseRow(page, BILL_1057)).toBeVisible()
        await expect(visible(page, 'purchases-list')).toHaveAttribute('aria-busy', 'true')
        await next.release()
        await expect(purchaseRow(page, BILL_1057)).toHaveCount(0)
        await expect(visible(page, 'purchases-list')).not.toHaveAttribute('aria-busy', 'true')
    })
})
