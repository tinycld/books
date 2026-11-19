import { expect, type Page, test } from '@playwright/test'
import { VENDOR_CREDIT_URL } from './vendor-credit-helpers'
import {
    chooseFromMenu,
    createVendor,
    openVendorsList,
    searchVendors,
    uniqueName,
    vendorIdOf,
} from './vendor-form-helpers'
import {
    NEW_VENDOR_REFUND_URL,
    openBooks,
    openNewVendorRefund,
    pickRefundVendor,
    refundRow,
    vendorWithCredits,
    watchRefundWrites,
} from './vendor-refund-helpers'

// The credits list's states (spec §3.4): a vendor with no unapplied credit, a failed read
// of the vendor credits with Retry, and the picker's active vendors only. The read failure
// is forced with route.fulfill. Desktop; the test makes its own vendors and credit.

const CREDITS_URL = '**/api/collections/books_vendor_credits/records**'

// The Vendor picker's options while `term` is typed in its search.
async function vendorOptions(page: Page, term: string) {
    await page.getByTestId('vendor-refund-vendor').click()
    const search = page.getByTestId('vendor-refund-vendor-search')
    await expect(search).toBeFocused()
    await search.fill(term)
    return page
        .getByRole('menuitem')
        .and(page.locator('[data-testid^="vendor-refund-vendor-option-"]'))
}

test.describe('vendor-refund: list states', () => {
    test('shows no credit, a failed load with Retry, and only active vendors', async ({ page }) => {
        await openBooks(page)
        const prefix = uniqueName('Refund states')
        const noCredit = `${prefix} none`
        const inactive = `${prefix} gone`
        await createVendor(page, { name: inactive })
        // Save opens the new vendor's page; the list is behind it.
        await openVendorsList(page)
        await searchVendors(page, inactive)
        await chooseFromMenu(page, await vendorIdOf(page, inactive), 'toggle-inactive')
        await createVendor(page, { name: noCredit })
        await openVendorsList(page)
        await searchVendors(page, noCredit)
        const noCreditId = await vendorIdOf(page, noCredit)
        const withCredit = await vendorWithCredits(page, [{ amount: '650.00' }])
        const [credit] = withCredit.credits

        await openNewVendorRefund(page)
        const writes = watchRefundWrites(page)

        // An inactive vendor is not offered; the search did apply (the active one is).
        const options = await vendorOptions(page, prefix)
        await expect(options.filter({ hasText: noCredit })).toHaveCount(1)
        await expect(options.filter({ hasText: inactive })).toHaveCount(0)
        await page.keyboard.press('Escape')

        // A vendor with no unapplied credit: the note, no totals, no Clear refunds; Post is
        // refused under the list and nothing is saved.
        await pickRefundVendor(page, noCredit)
        await expect(page.getByTestId('vendor-refund-list-empty')).toHaveText(
            `${noCredit} has no unapplied vendor credit. Record the vendor credit first, then its refund.`
        )
        await expect(page.getByTestId('vendor-refund-totals')).toHaveCount(0)
        await expect(page.getByTestId('vendor-refund-clear')).toHaveCount(0)
        await page.getByTestId('vendor-refund-amount').fill('50.00')
        await page.getByTestId('vendor-refund-post').click()
        await expect(page.getByTestId('vendor-refund-sum-error')).toHaveText(
            '$50.00 of the refund is not on a vendor credit. Put it on a credit or lower the amount.'
        )
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)
        expect(writes).toEqual([])

        // New vendor credit opens the vendor credit form with that vendor chosen.
        await page.getByTestId('vendor-refund-new-credit').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/vendor-credits/new\\?vendor=${noCreditId}$`)
        )
        await expect(page.getByTestId('vendor-credit-form')).toBeVisible()
        await expect(page.getByTestId('form-input-vendor')).toContainText(noCredit)
        await expect(page).not.toHaveURL(VENDOR_CREDIT_URL)

        // The credit form is pushed over the refund form (spec §2): its Back returns to the
        // refund form below, with the vendor and the typed amount kept.
        await page.getByTestId('entry-back').filter({ visible: true }).click()
        await expect(page.getByTestId('vendor-credit-form')).toHaveCount(0)
        await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)
        await expect(page.getByTestId('vendor-refund-form')).toBeVisible()
        await expect(page.getByTestId('vendor-refund-vendor')).toContainText(noCredit)
        await expect(page.getByTestId('vendor-refund-amount')).toHaveValue('50.00')

        // Leave the edited refund form through Cancel and the Discard dialog, back to the list.
        await page.getByTestId('vendor-refund-cancel').click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page.getByTestId('vendor-refund-form')).toHaveCount(0)
        await expect(page.getByTestId('entries-screen')).toBeVisible()

        // The vendor credits fail to load: the banner with Retry; Retry recovers the row.
        await openNewVendorRefund(page)
        await page.route(CREDITS_URL, route =>
            route.request().method() === 'GET' ? route.fulfill({ status: 400 }) : route.fallback()
        )
        await pickRefundVendor(page, withCredit.vendor.name)
        await expect(page.getByTestId('vendor-refund-list-error')).toContainText(
            'Books could not load the vendor credits.'
        )
        const retry = page.getByTestId('vendor-refund-list-retry')
        await expect(retry).toHaveText('Retry')
        await page.unrouteAll({ behavior: 'wait' })
        await retry.click()
        await expect(refundRow(page, credit.id)).toBeVisible()
        await expect(page.getByTestId('vendor-refund-list-error')).toHaveCount(0)
    })
})
