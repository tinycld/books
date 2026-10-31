import { expect, test } from '@playwright/test'
import { openForm1099, visible } from './vendor-1099-helpers'
import { DESKTOP, openBooksPage } from './vendor-form-helpers'

// Settings → 1099s waits for its three queries (settings, the expense-group accounts and
// the tracked vendors) and shows one load error with Retry when any of them fails.
//
// The failure is a 400 answered through `page.route` on a fresh page (`openBooksPage`), so
// the section's own requests are caught from the first load; nothing is written. Realtime
// is aborted on that page so no realtime event from other specs refills the faked
// collections before the faked answer lands. Desktop
// only: the section's loading and error parts are the same code at every size.

const VENDORS_RECORDS = '**/api/collections/books_vendors/records**'
const ACCOUNTS_RECORDS = '**/api/collections/books_accounts/records**'
const REALTIME = '**/api/realtime*'

test.describe('vendor-1099: section load', () => {
    test('shows loading, then the load error, and Retry loads the section', async ({ page }) => {
        let openVendors = () => {}
        let openAccounts = () => {}
        const vendorsGate = new Promise<void>(resolve => {
            openVendors = resolve
        })
        const accountsGate = new Promise<void>(resolve => {
            openAccounts = resolve
        })
        const fresh = await openBooksPage(page, DESKTOP, async p => {
            await p.route(REALTIME, route => route.abort())
            await p.route(VENDORS_RECORDS, async route => {
                await vendorsGate
                await route.continue()
            })
            await p.route(ACCOUNTS_RECORDS, async route => {
                await accountsGate
                await route.fulfill({
                    status: 400,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        code: 400,
                        message: 'Books cannot list accounts right now.',
                        data: {},
                    }),
                })
            })
        })

        await openForm1099(fresh)
        await expect(visible(fresh, 'books-1099-loading')).toBeVisible()
        await expect(fresh.getByTestId('books-1099-section')).toHaveCount(0)

        const vendorsAnswered = fresh.waitForResponse(response =>
            response.url().includes('/api/collections/books_vendors/records')
        )
        openVendors()
        await vendorsAnswered
        // The vendors query is in; the section still waits for the accounts query.
        await expect(visible(fresh, 'books-1099-loading')).toBeVisible()
        await expect(fresh.getByTestId('books-1099-section')).toHaveCount(0)

        openAccounts()
        await expect(visible(fresh, 'books-1099-error')).toContainText(
            '1099 settings could not be loaded.'
        )

        await fresh.unrouteAll({ behavior: 'wait' })
        await visible(fresh, 'books-1099-retry').click()
        await expect(visible(fresh, 'books-1099-section')).toBeVisible()
        await expect(fresh.getByTestId('books-1099-error')).toHaveCount(0)
    })
})
