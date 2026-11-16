import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { historyEvents, openHistoryFromMore, openMoreMenu } from './audit-log-helpers'
import {
    billPaymentIdFromUrl,
    CHECKING,
    DESKTOP,
    filterToVendor,
    localDay,
    openPayBills,
    PAY_BILLS_URL,
    pickSelect,
    postedNumber,
    searchToBillPayment,
    vendorWithBills,
} from './pay-bills-helpers'

// The audit log knows bill payments (cp 4 item D2, audit-log spec §3 "Entry points"): a
// bill payment's read view has Audit history as the last More row, as every other
// document's has, and the history lists the payment's Added event and its line's. The
// test makes its own vendor and bill and pays it through Pay Bills.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

test.describe('pay-bills: audit history of a bill payment', () => {
    test('a paid bill payment’s More opens its history with the payment and its line', async ({
        page,
    }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '275.00', due: await localDay(page, 10) }],
        })
        const [bill] = bills

        await openPayBills(page)
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await filterToVendor(page, vendor)
        await page.getByTestId(`pay-bills-row-tick-${bill.id}`).click()
        await page.getByTestId('pay-bills-pay').click()
        const number = await postedNumber(page)
        await expect(page).not.toHaveURL(PAY_BILLS_URL)

        await searchToBillPayment(page, vendor.name, `Bill payment ${number} · ${vendor.name}`)
        const id = billPaymentIdFromUrl(page)

        // At 1280 the actions are buttons, so More holds Audit history alone, last.
        const items = await openMoreMenu(page, 'bill-payment-read-more')
        await expect(items.last()).toHaveText('Audit history')
        await openHistoryFromMore(page, 'bill-payment-read-history', {
            collection: 'books_bill_payments',
            id,
            title: `Bill payment ${number}`,
        })

        // An event ends with its body, "Added <label>"; the line's label is "<payment>: Bill
        // <m>", so the payment's own event is the one whose text ends at its number.
        const events = historyEvents(page)
        await expect(
            events.filter({ hasText: new RegExp(`Added Bill payment ${number}$`) })
        ).toHaveCount(1)
        const lineEvent = events.filter({ hasText: /^Line 1 — Added/ })
        await expect(lineEvent).toHaveCount(1)
        await expect(lineEvent).toContainText(`Added Bill payment ${number}: Bill ${bill.number}`)
    })
})
