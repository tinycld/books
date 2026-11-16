import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { openMoreMenu } from './audit-log-helpers'
import {
    billPaymentIdFromUrl,
    CHECKING,
    DESKTOP,
    filterToVendor,
    localDay,
    openPayBills,
    PAY_BILLS_URL,
    PHONE,
    payBillsRow,
    pickSelect,
    postedNumber,
    searchToBillPayment,
    shown,
    uniqueCheckNo,
    vendorWithBills,
} from './pay-bills-helpers'

// The bill payment read view (spec §3.8, §3.11): its details and Bills paid, the load error
// with Retry, View journal entry (J), Void (V) and its effect on the bills, and the phone
// layout (Bills paid as cards, the actions in the phone bar). The test makes its own vendor
// and bills and pays them through Pay Bills; no seeded bill or bill payment is read.

const VOID_TEXT =
    'A reversing entry is posted in the original period. The number is kept. The bills it paid are open again.'

// The read view's payment read (pbtsdb), and only it: the lines are another collection.
const PAYMENT_READ = '**/api/collections/books_bill_payments/records**'

const MONEY = /^\$[\d,]+\.\d{2}$/

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

test.describe('pay-bills: read view, void and journal', () => {
    test('a bill payment reads, opens its entry, and voided opens its bills again', async ({
        page,
    }) => {
        await openBooks(page)
        const today = await localDay(page, 0)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [
                { amount: '300.00', due: await localDay(page, 10), billNo: 'RV-4410' },
                { amount: '200.00', due: await localDay(page, 20) },
            ],
        })
        const [first, second] = bills
        const checkNo = uniqueCheckNo()

        // Pay both bills by check from 1000 Business Checking.
        await openPayBills(page)
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await expect(page.getByTestId('pay-bills-method')).toContainText('Check')
        await page.getByTestId('pay-bills-check-no').fill(checkNo)
        await filterToVendor(page, vendor)
        await page.getByTestId(`pay-bills-row-tick-${first.id}`).click()
        await page.getByTestId(`pay-bills-row-tick-${second.id}`).click()
        await page.getByTestId('pay-bills-pay').click()
        const number = await postedNumber(page)
        await expect(page).not.toHaveURL(PAY_BILLS_URL)

        // Opened by search while its read fails: the load error with Retry; Retry loads it.
        await page.route(PAYMENT_READ, route =>
            route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
        )
        await searchToBillPayment(page, vendor.name, `Bill payment ${number} · ${vendor.name}`)
        const id = billPaymentIdFromUrl(page)
        const loadError = page.getByText('Books could not load this bill payment.', { exact: true })
        await expect(loadError).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByRole('button', { name: 'Retry', exact: true }).click()
        await expect(loadError).toHaveCount(0)
        const title = shown(page, 'bill-payment-title')
        await expect(title).toHaveText(`Bill payment ${number}`)

        // The header, the details, Bills paid with its Total, and Posted by.
        await expect(shown(page, 'bill-payment-badge')).toHaveText('Posted')
        await expect(shown(page, 'bill-payment-figure')).toContainText('$500.00')
        await expect(shown(page, 'bill-payment-vendor-link')).toHaveText(vendor.name)
        await expect(shown(page, 'bill-payment-detail-paid-from')).toContainText(
            'Business Checking'
        )
        await expect(shown(page, 'bill-payment-detail-date')).toContainText(formatDay(today))
        await expect(shown(page, 'bill-payment-detail-payment')).toContainText(`Check · ${checkNo}`)
        const firstPaid = shown(page, `bill-payment-applied-${first.id}`)
        await expect(firstPaid).toContainText(`Bill ${first.number}`)
        await expect(firstPaid).toContainText('RV-4410')
        await expect(firstPaid).toContainText('$300.00')
        const secondPaid = shown(page, `bill-payment-applied-${second.id}`)
        await expect(secondPaid).toContainText(`Bill ${second.number}`)
        await expect(secondPaid).toContainText('$200.00')
        await expect(shown(page, 'bill-payment-applied-total')).toContainText('$500.00')
        await expect(shown(page, 'bill-payment-posted-by')).toHaveText(/^Posted by \S.*, \S/)

        // J: the payment's entry, typed Bill payment, the vendor named on both lines.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Bill payment')
        const names = entry.locator('[data-testid^="entry-line-party-"]')
        await expect.poll(() => names.count()).toBe(2)
        await expect
            .poll(async () => [...new Set(await names.allInnerTexts())])
            .toEqual([vendor.name])
        await page.goBack()
        await expect(page).toHaveURL(new RegExp(`/books/bill-payments/${id}$`))
        await expect(title).toHaveText(`Bill payment ${number}`)

        // V: the Void dialog with the spec's text; confirmed, the payment is Void and offers
        // View journal entry only.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(VOID_TEXT)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'bill-payment-badge')).toHaveText('Void')
        await expect(title).toHaveText(`Bill payment ${number}`)
        await expect(shown(page, 'bill-payment-voided-by')).toContainText('Voided by')
        await expect(shown(page, 'bill-payment-read-edit')).toHaveCount(0)
        await expect(shown(page, 'bill-payment-read-void')).toHaveCount(0)
        await expect(shown(page, 'bill-payment-read-entry')).toBeVisible()

        // Pay Bills lists both bills again, each open for its whole amount (the row's money
        // texts are Bill total and Open balance; Payment is an empty input).
        await openPayBills(page)
        await filterToVendor(page, vendor)
        await expect(page.getByTestId('pay-bills-count')).toHaveText('2 open bills')
        await expect(payBillsRow(page, first.id).getByText(MONEY)).toHaveText([
            '$300.00',
            '$300.00',
        ])
        await expect(payBillsRow(page, second.id).getByText(MONEY)).toHaveText([
            '$200.00',
            '$200.00',
        ])

        // At 390 the void payment's read view lists Bills paid as cards (a grid row is wider
        // than the phone) and keeps View journal entry in the phone bar, beside More.
        await page.goBack()
        await expect(page).not.toHaveURL(PAY_BILLS_URL)
        await searchToBillPayment(
            page,
            vendor.name,
            `Bill payment ${number} (void) · ${vendor.name}`
        )
        await expect(page).toHaveURL(new RegExp(`/books/bill-payments/${id}$`))
        await page.setViewportSize(PHONE)
        const card = shown(page, `bill-payment-applied-${first.id}`)
        await expect(card).toContainText(`Bill ${first.number}`)
        await expect(card).toContainText('$300.00')
        await expect(shown(page, `bill-payment-applied-${second.id}`)).toContainText('$200.00')
        await expect
            .poll(async () => (await card.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
            .toBeLessThanOrEqual(PHONE.width)
        const bar = shown(page, 'bill-payment-read-actions')
        await expect(bar.getByTestId('bill-payment-read-entry')).toBeVisible()
        // More holds Audit history (as on every document) and no Edit or Void row.
        const moreItems = await openMoreMenu(page, 'bill-payment-read-more')
        await expect(moreItems.last()).toHaveText('Audit history')
        await expect(moreItems.filter({ hasText: /^(Edit|Void)/ })).toHaveCount(0)
        await expect(shown(page, 'bill-payment-read-edit')).toHaveCount(0)
        await expect(shown(page, 'bill-payment-read-void')).toHaveCount(0)
    })
})
