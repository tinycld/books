import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'
import {
    BILL_PAYMENT_URL,
    billPaymentIdFromUrl,
    CHECKING,
    DESKTOP,
    filterToVendor,
    localDay,
    moneyCents,
    openPayBills,
    PAY_BILLS_URL,
    payBillsRow,
    payBillsRowAmount,
    pickSelect,
    postedNumber,
    replacesUrl,
    searchToBillPayment,
    shown,
    vendorWithBills,
} from './pay-bills-helpers'
import { isDisabled } from './record-form-helpers'
import { expectRecordUrl } from './record-key-helpers'

// Editing a posted bill payment (spec §3.6, §3.11) from the keyboard only: the read view's E
// opens Pay Bills in edit mode with the vendor fixed and the original's rows paid; Tab, Enter
// and ⌥↵ change the rows; ⌘↵ saves a correction that keeps the number and voids the
// original. The test makes its own vendor and bills and pays them through Pay Bills; no
// seeded bill or bill payment is read. Desktop only: the phone runs the same edit logic.

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const MONEY = /^\$[\d,]+\.\d{2}$/

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The entries list row typed Bill payment with this status.
function billPaymentEntryRow(page: Page, status: RegExp) {
    return page
        .locator(ROWS)
        .filter({
            has: page.locator('[data-testid^="entries-cell-type-"]', { hasText: /^Bill payment$/ }),
        })
        .filter({ has: page.locator('[data-testid^="entries-status-"]', { hasText: status }) })
}

async function entryIdOf(row: Locator) {
    return ((await row.getAttribute('data-testid')) ?? '').replace(/^entries-row-/, '')
}

// Tab until the target has focus, past the stops between (a disabled Vendor filter may or
// may not be one); at most `limit` presses.
async function tabUntil(page: Page, target: Locator, limit: number) {
    for (let press = 0; press < limit; press++) {
        await page.keyboard.press('Tab')
        if (await target.evaluate(el => el === document.activeElement)) return
    }
    await expect(target).toBeFocused()
}

test.describe('pay-bills: keyboard edit', () => {
    test('a bill payment is edited from the keyboard as a correction that keeps its number', async ({
        page,
    }) => {
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [
                { amount: '300.00', due: await localDay(page, 10) },
                { amount: '200.00', due: await localDay(page, 20) },
                { amount: '150.00', due: await localDay(page, 30) },
            ],
        })
        const [first, second, third] = bills

        // Pay bill 1 in part and bill 2 in full by bank transfer.
        await openPayBills(page)
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await pickSelect(page, 'pay-bills-method', 'Bank transfer')
        await filterToVendor(page, vendor)
        await payBillsRowAmount(page, first.id).fill('100.00')
        await page.getByTestId(`pay-bills-row-tick-${second.id}`).click()
        await expect(payBillsRowAmount(page, second.id)).toHaveValue('200.00')
        await page.getByTestId('pay-bills-pay').click()
        const number = await postedNumber(page)
        await expect(page).not.toHaveURL(PAY_BILLS_URL)

        // Journal Entries: the payment's entry, by its memo; Open goes to the payment.
        const memo = `Payment of Bill ${first.number}, Bill ${second.number}`
        await openEntriesList(page)
        await searchEntries(page, memo)
        const posted = billPaymentEntryRow(page, /^Posted$/)
        await expect(posted).toHaveCount(1)
        const postedEntryId = await entryIdOf(posted)
        await expect(page.getByTestId(`entries-cell-number-${postedEntryId}`)).toHaveText(number)
        await page.getByTestId(`entries-row-menu-${postedEntryId}`).click()
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(BILL_PAYMENT_URL)
        const originalId = await billPaymentIdFromUrl(page)
        await expect(shown(page, 'bill-payment-title')).toHaveText(`Bill payment ${number}`)

        // From here no click. E opens edit mode: the vendor fixed, rows 1 and 2 paid as
        // before (row 2, now at a zero balance, open for its whole original amount), row 3
        // open; Paid from has focus.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(replacesUrl(originalId))
        await expect(shown(page, 'pay-bills-title')).toHaveText(`Edit bill payment ${number}`)
        const vendorFilter = page.getByTestId('pay-bills-vendor-filter')
        await expect(vendorFilter).toContainText(vendor.name)
        await expect.poll(() => isDisabled(vendorFilter)).toBe(true)
        const amount1 = payBillsRowAmount(page, first.id)
        const amount2 = payBillsRowAmount(page, second.id)
        const amount3 = payBillsRowAmount(page, third.id)
        await expect(amount1).toHaveValue('100.00')
        await expect(amount2).toHaveValue('200.00')
        await expect(payBillsRow(page, second.id).getByText(MONEY)).toHaveText([
            '$200.00',
            '$200.00',
        ])
        await expect(amount3).toHaveValue('')
        const paidFrom = page.getByTestId('pay-bills-paid-from')
        await expect(paidFrom).toBeFocused()
        await expect(paidFrom).toContainText(CHECKING)
        await expect(page.getByTestId('pay-bills-method')).toContainText('Bank transfer')

        // Tab to row 1, change its amount; Enter to row 2, ⌥↵ clears it; Enter to row 3,
        // ⌥↵ pays it in full.
        await tabTo(page, page.getByTestId('pay-bills-date'))
        await tabTo(page, page.getByTestId('pay-bills-date-open'))
        await tabTo(page, page.getByTestId('pay-bills-method'))
        await tabUntil(page, amount1, 4)
        await page.keyboard.type('120.00')
        await page.keyboard.press('Enter')
        await expect(amount2).toBeFocused()
        await page.keyboard.press('Alt+Enter')
        await expect(amount2).toHaveValue('')
        await page.keyboard.press('Enter')
        await expect(amount3).toBeFocused()
        await page.keyboard.press('Alt+Enter')
        await expect(amount3).toHaveValue('150.00')
        await expect(amount1).toHaveValue('120.00')

        // "Payment <n> now" gives back the original's $300.00: New balance is Current balance
        // + $300.00 − $270.00.
        await expect(page.getByTestId('pay-bills-original-now')).toContainText(
            `Payment ${number} now`
        )
        await expect(page.getByTestId('pay-bills-original-now')).toContainText('$300.00')
        await expect(page.getByTestId('pay-bills-figure')).toContainText('$270.00')
        const current = moneyCents(await page.getByTestId('pay-bills-current-balance').innerText())
        await expect
            .poll(async () =>
                moneyCents(await page.getByTestId('pay-bills-new-balance').innerText())
            )
            .toBe(current + 30_000 - 27_000)

        // ⌘↵ saves: the correction's read view, the same number, bills 1 and 3 paid.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(BILL_PAYMENT_URL)
        const correctionId = await billPaymentIdFromUrl(page)
        expect(correctionId).not.toBe(originalId)
        await expect(shown(page, 'bill-payment-title')).toHaveText(`Bill payment ${number}`)
        await expect(shown(page, 'bill-payment-badge')).toHaveText('Posted')
        await expect(shown(page, `bill-payment-applied-${first.id}`)).toContainText('$120.00')
        await expect(shown(page, `bill-payment-applied-${third.id}`)).toContainText('$150.00')
        await expect(shown(page, `bill-payment-applied-${second.id}`)).toHaveCount(0)

        // The original, by search: Void, replaced by the correction, no Edit or Void.
        await searchToBillPayment(
            page,
            vendor.name,
            `Bill payment ${number} (void) · ${vendor.name}`
        )
        await expectRecordUrl(page, 'bill-payments', originalId)
        await expect(shown(page, 'bill-payment-replaced-by')).toHaveText(
            `Replaced by ${number} (edited)`
        )
        await expect(shown(page, 'bill-payment-badge')).toHaveText('Void')
        await expect(shown(page, 'bill-payment-read-entry')).toBeVisible()
        await expect(shown(page, 'bill-payment-read-edit')).toHaveCount(0)
        await expect(shown(page, 'bill-payment-read-void')).toHaveCount(0)

        // Journal Entries: the original's entry is Void; the correction's Edit reopens edit
        // mode, where clearing every row and ⌘↵ is refused.
        await openEntriesList(page)
        await searchEntries(page, memo)
        const voided = billPaymentEntryRow(page, /^Void$/)
        await expect(voided).toHaveCount(1)
        await expect(page.getByTestId(`entries-cell-number-${await entryIdOf(voided)}`)).toHaveText(
            number
        )
        await searchEntries(page, `Payment of Bill ${first.number}, Bill ${third.number}`)
        const correction = billPaymentEntryRow(page, /^Posted$/)
        await expect(correction).toHaveCount(1)
        const correctionEntryId = await entryIdOf(correction)
        await page.getByTestId(`entries-row-menu-${correctionEntryId}`).click()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-edit').click()
        await expect(page).toHaveURL(replacesUrl(correctionId))
        await expect(shown(page, 'pay-bills-title')).toHaveText(`Edit bill payment ${number}`)
        await expect(page.getByTestId('pay-bills-paid-from')).toBeFocused()
        await expect(payBillsRowAmount(page, first.id)).toHaveValue('120.00')
        await page.keyboard.press('Alt+Backspace')
        await expect(payBillsRowAmount(page, first.id)).toHaveValue('')
        await expect(payBillsRowAmount(page, third.id)).toHaveValue('')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('pay-bills-error-summary')).toContainText(
            'Select at least one bill to pay.'
        )
        await expect(page).toHaveURL(replacesUrl(correctionId))
    })
})
