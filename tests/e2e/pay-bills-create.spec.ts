import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { shiftTabTo, tabTo } from './keyboard-helpers'
import {
    CHECKING,
    DESKTOP,
    filterToVendor,
    listedBillIds,
    localDay,
    moneyCents,
    openPayBills,
    PAY_BILLS_URL,
    payBillsRow,
    payBillsRowAmount,
    pickFocusedSelect,
    postedNumber,
    uniqueCheckNo,
    vendorWithBills,
} from './pay-bills-helpers'

// Pay Bills from the keyboard only (spec §3.1–§3.5). After the screen opens, no click: focus
// starts in Paid from, Tab moves between the fields, the filters and the rows' Payment
// cells, Enter moves down the rows, ⌥↵ pays a row in full, ⌘↵ pays. The test makes its own
// vendor and bills and filters the list to that vendor. Desktop only: the phone path is
// pay-bills-phone.spec.ts.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

test.describe('pay-bills: keyboard create', () => {
    test('two bills of one vendor are paid by check from the keyboard only', async ({ page }) => {
        await openBooks(page)
        const yesterday = await localDay(page, -1)
        const inTwenty = await localDay(page, 20)
        const today = await localDay(page, 0)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [
                { amount: '300.00', due: yesterday, billNo: '88412' },
                { amount: '200.00', due: inTwenty },
            ],
        })
        const [first, second] = bills
        const start = uniqueCheckNo()
        await openPayBills(page)

        // From here no click. Paid from has focus; picking a bank account shows its balance
        // and sets Payment method to Check.
        const paidFrom = page.getByTestId('pay-bills-paid-from')
        await expect(paidFrom).toBeFocused()
        await pickFocusedSelect(page, paidFrom, CHECKING)
        await expect(page.getByTestId('pay-bills-paid-from-balance')).toHaveText(
            /^Balance -?\$[\d,]+\.\d\d$/
        )

        const date = page.getByTestId('pay-bills-date')
        await tabTo(page, date)
        await expect(date).toHaveValue(today)
        // Core DateField's own "Open calendar" button is part of the Payment date field.
        await tabTo(page, page.getByTestId('pay-bills-date-open'))
        const method = page.getByTestId('pay-bills-method')
        await tabTo(page, method)
        await expect(method).toContainText('Check')

        // Starting check no. shows only while the method is Check.
        const checkNo = page.getByTestId('pay-bills-check-no')
        await pickFocusedSelect(page, method, 'Bank transfer')
        await expect(checkNo).toHaveCount(0)
        await pickFocusedSelect(page, method, 'Check')
        await expect(checkNo).toBeVisible()
        await tabTo(page, checkNo)
        await page.keyboard.type(start)

        // The Vendor filter: Enter opens its search, the name, Enter picks.
        const vendorFilter = page.getByTestId('pay-bills-vendor-filter')
        await tabTo(page, vendorFilter)
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('pay-bills-vendor-filter-search')).toBeFocused()
        await page.keyboard.type(vendor.name)
        await expect(page.getByTestId(`pay-bills-vendor-option-${vendor.id}`)).toBeVisible()
        await page.keyboard.press('Enter')
        await expect(vendorFilter).toContainText(vendor.name)
        await expect(page.getByTestId('pay-bills-count')).toHaveText('2 open bills')

        // The rows: due date ascending, the overdue one marked, the vendor's bill no. under
        // its Bill link.
        await expect.poll(() => listedBillIds(page)).toEqual([first.id, second.id])
        await expect(payBillsRow(page, first.id)).toContainText('Overdue')
        await expect(payBillsRow(page, second.id)).not.toContainText('Overdue')
        await expect(page.getByTestId(`pay-bills-row-link-${first.id}`)).toHaveText(
            `Bill ${first.number}`
        )
        await expect(
            payBillsRow(page, first.id).getByText('No. 88412', { exact: true })
        ).toBeVisible()

        // The filter's pick leaves focus on the chip, or moves it to Due; the next stop
        // after Due is row 1's Payment cell.
        const dueFilter = page.getByTestId('pay-bills-due-filter')
        if (await vendorFilter.evaluate(el => el === document.activeElement)) {
            await tabTo(page, dueFilter)
        }
        await expect(dueFilter).toBeFocused()
        const amount1 = payBillsRowAmount(page, first.id)
        const amount2 = payBillsRowAmount(page, second.id)
        await tabTo(page, amount1)
        await page.keyboard.type('120.00')
        await page.keyboard.press('Enter')
        await expect(amount2).toBeFocused()
        await page.keyboard.press('Alt+Enter')
        await expect(amount2).toHaveValue('200.00')
        await page.keyboard.press('Enter')
        const clear = page.getByTestId('pay-bills-clear')
        await expect(clear).toBeFocused()

        // Back on row 2, the cell selects its whole value.
        await shiftTabTo(page, amount2)
        await expect
            .poll(() =>
                amount2.evaluate(el => {
                    const input = el as HTMLInputElement
                    return [input.selectionStart, input.selectionEnd, input.value.length]
                })
            )
            .toEqual([0, 6, 6])
        await expect(amount1).toHaveValue('120.00')

        // ⇧? lists the screen's keys under "Pay bills"; Escape closes only the list.
        await tabTo(page, clear)
        await page.keyboard.press('Shift+?')
        const list = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(list).toBeVisible()
        const group = list.getByText('Pay bills', { exact: true }).locator('..')
        for (const label of ['Pay', 'Pay & new', 'Clear payments']) {
            await expect(group.getByText(label, { exact: true }), label).toBeVisible()
        }
        // ⌥A and ⌥↵, by the spec's key table.
        await expect(group).toContainText('Pay every shown bill in full')
        await expect(group).toContainText('Pay this row in full')
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)
        await expect(page.getByTestId('pay-bills-form')).toBeVisible()
        await expect(amount1).toHaveValue('120.00')

        // The figure, the totals row, the summary, the check plan and the balance lines.
        await expect(page.getByTestId('pay-bills-figure')).toContainText('$320.00')
        const totals = page.getByTestId('pay-bills-grid-totals')
        await expect(totals).toContainText('$500.00')
        await expect(totals).toContainText('$320.00')
        await expect(page.getByTestId('pay-bills-selected')).toHaveText(
            '2 bills selected · 1 vendor'
        )
        await expect(page.getByTestId('pay-bills-check-plan')).toHaveText(
            `${vendor.name} gets check ${start}.`
        )
        const current = moneyCents(await page.getByTestId('pay-bills-current-balance').innerText())
        const total = moneyCents(await page.getByTestId('pay-bills-total-payment').innerText())
        expect(Math.abs(total)).toBe(32_000)
        await expect
            .poll(async () =>
                moneyCents(await page.getByTestId('pay-bills-new-balance').innerText())
            )
            .toBe(current - 32_000)

        // ⌘↵ pays: the toast names the payment and the screen leaves.
        await page.keyboard.press('ControlOrMeta+Enter')
        await postedNumber(page)
        await expect(page).not.toHaveURL(PAY_BILLS_URL)
        await expect(page.getByTestId('pay-bills-form')).toHaveCount(0)

        // Reopened: bill 1 keeps what is left open, bill 2 is paid and gone.
        await openPayBills(page)
        await filterToVendor(page, vendor)
        await expect(payBillsRow(page, first.id)).toContainText('$180.00')
        await expect(payBillsRow(page, second.id)).toHaveCount(0)
        await expect(page.getByTestId('pay-bills-count')).toHaveText('1 open bill')
    })
})
