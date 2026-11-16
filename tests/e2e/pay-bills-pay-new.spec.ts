import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'
import {
    CHECKING,
    DESKTOP,
    filterToVendor,
    localDay,
    openPayBills,
    PAY_BILLS_URL,
    payBillsRow,
    pickSelect,
    uniqueCheckNo,
    vendorWithBills,
} from './pay-bills-helpers'
import { uniqueName } from './vendor-form-helpers'

// Pay & new for two vendors (spec §3.4, §3.5, §9): one Pay writes one payment per vendor;
// the checks and the payment numbers follow vendor display-name order; the screen stays for
// the next payment with the header kept and Starting check no. moved on. The test makes
// two vendors of its own, named so their order is known, with one bill each.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

const ENTRY_ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'

test.describe('pay-bills: pay and new for two vendors', () => {
    test('Pay & new posts one numbered payment per vendor and keeps the header', async ({
        page,
    }) => {
        await openBooks(page)
        const due = await localDay(page, 12)
        const today = await localDay(page, 0)
        const a = await vendorWithBills(page, {
            name: uniqueName('A'),
            bills: [{ amount: '110.00', due }],
        })
        const b = await vendorWithBills(page, {
            name: uniqueName('B'),
            bills: [{ amount: '220.00', due }],
        })
        const [billA] = a.bills
        const [billB] = b.bills
        const start = uniqueCheckNo()
        const next = (k: number) => String(Number(start) + k)

        await openPayBills(page)
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await expect(page.getByTestId('pay-bills-method')).toContainText('Check')
        const checkNo = page.getByTestId('pay-bills-check-no')
        await checkNo.fill(start)

        // One bill of each vendor, each found through the Vendor filter.
        await filterToVendor(page, b.vendor)
        await page.getByTestId(`pay-bills-row-tick-${billB.id}`).click()
        await filterToVendor(page, a.vendor)
        await page.getByTestId(`pay-bills-row-tick-${billA.id}`).click()
        await expect(page.getByTestId('pay-bills-selected')).toHaveText(
            '2 bills selected · 2 vendors'
        )
        await expect(page.getByTestId('pay-bills-check-plan')).toHaveText(
            `${a.vendor.name} gets check ${start}, ${b.vendor.name} check ${next(1)}.`
        )

        // ⌘⇧↵: both post; the toast gives the two numbers.
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        const toast = page.getByText(/^Posted 2 bill payments \(\d+–\d+\)$/)
        await expect(toast).toBeVisible()
        const [, low, high] = /\((\d+)–(\d+)\)$/.exec(await toast.innerText()) ?? []
        if (!low || !high) throw new Error('the toast has no number range')
        expect(Number(high)).toBe(Number(low) + 1)

        // The screen stays: filters and rows clear, the paid bills are gone, the header is
        // kept, Starting check no. moves past the two checks used, Paid from has focus.
        await expect(page).toHaveURL(PAY_BILLS_URL)
        await expect(page.getByTestId('pay-bills-vendor-filter')).toContainText('All vendors')
        await expect(page.getByTestId('pay-bills-due-filter')).toContainText('Due: Any time')
        await expect(payBillsRow(page, billA.id)).toHaveCount(0)
        await expect(payBillsRow(page, billB.id)).toHaveCount(0)
        await expect(page.getByTestId('pay-bills-selected')).toHaveText('No bills selected')
        const paidFrom = page.getByTestId('pay-bills-paid-from')
        await expect(paidFrom).toContainText(CHECKING)
        await expect(page.getByTestId('pay-bills-date')).toHaveValue(today)
        await expect(page.getByTestId('pay-bills-method')).toContainText('Check')
        await expect(checkNo).toHaveValue(next(2))
        await expect(paidFrom).toBeFocused()

        // The Journal Entries list: A's payment has the lower number, B's the next. The
        // entries search reads number and memo only, and a payment's memo names its bills
        // (spec §4: "Payment of Bill 1003, Bill 1004"), so each is found by its bill.
        await page.getByTestId('pay-bills-cancel').click()
        await expect(page).not.toHaveURL(PAY_BILLS_URL)
        await openEntriesList(page)
        for (const [bill, number] of [
            [billA, low],
            [billB, high],
        ] as const) {
            const memo = `Payment of Bill ${bill.number}`
            await searchEntries(page, memo)
            const row = page
                .locator(ENTRY_ROWS)
                .filter({ has: page.getByText(memo, { exact: true }) })
                .filter({ has: page.getByText('Bill payment', { exact: true }) })
            await expect(row).toHaveCount(1)
            await expect(row.getByText(number, { exact: true })).toBeVisible()
        }
    })
})
