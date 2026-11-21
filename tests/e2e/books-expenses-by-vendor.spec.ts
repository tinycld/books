import { expect, type Page, test } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import { EXPENSES_BY_VENDOR_TITLE } from '~/tinycld/books/lib/expenses-by-vendor-fixture'
import { DESKTOP } from './account-register-helpers'
import { apVendorWithBill, filterToVendors, payPartOfBill } from './ap-aging-helpers'
import {
    browserToday,
    choosePeriod,
    dayWords,
    expectedHeading,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { chooseBalanceRows } from './customer-balance-helpers'
import {
    expenseCellTestId,
    openNewExpense,
    pickExpenseLineAccount,
    pickExpenseVendor,
    pickPaidFrom,
    postExpense,
} from './expense-helpers'
import {
    chooseExpenseMethod,
    chooseExpenseOrder,
    expenseCents,
    expenseShare,
    openExpensesByVendor,
    postBillOnAccounts,
    runLanded,
    voidBill,
} from './expenses-by-vendor-helpers'
import { BILL_EXPENSE_ACCOUNT, CHECKING, localDay, vendorWithBills } from './pay-bills-helpers'
import { openBooks, uniqueName } from './record-form-helpers'
import { postVendorCredit } from './vendor-credit-helpers'

// The Expenses by Vendor (expenses-by-vendor checkpoint 1): the shipped report from the
// Books hub. Each test creates its own vendors through the UI, posts documents dated today
// (the forms' default), filters the report to its vendors and sets a Custom period of
// today, so every figure it asserts is its own and none depends on the fiscal month. Core's
// table mounts only the rows near the viewport; a filtered report is a few rows, read in
// one snapshot.

const RENT = '6100 Rent'

// Sets the Custom period from `day` to `day` and waits for the run of that period: core
// keeps the previous run's rows on screen until the new run lands.
async function chooseDay(page: Page, day: string): Promise<void> {
    const landed = runLanded(page, params => {
        const period = params.period as { from?: string; to?: string } | undefined
        return period?.from === day && period?.to === day
    })
    await choosePeriod(page, { from: day, to: day })
    await landed
}

// Opens the report, narrows it to `names` and to today.
async function openFor(page: Page, names: readonly string[]): Promise<void> {
    const today = await browserToday(page)
    await openExpensesByVendor(page)
    await filterToVendors(page, names)
    await chooseDay(page, today)
}

// The vendor rows' labels of one snapshot, top to bottom.
function vendorLabels(snapshot: ReportSnapshot): string[] {
    return snapshot.rows.filter(row => row.kind === 'group').map(row => row.label)
}

test.describe('expenses-by-vendor: report', () => {
    test('opens from the Reports hub with its heading, and a period with no expense is empty', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openExpensesByVendor(page)

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '',
            'the report header'
        )
        expect(snapshot.title).toBe(EXPENSES_BY_VENDOR_TITLE)
        await expect
            .poll(async () => {
                const expected = await expectedHeading(page)
                return expected !== '' && (await reportSnapshot(page)).business === expected
            })
            .toBe(true)
        const today = await browserToday(page)
        expect((await reportSnapshot(page)).header.endsWith(dayWords(today))).toBe(true)
        await expect(page.getByTestId('report-header-param-method')).toHaveText('Accrual basis')

        const chips = await page
            .getByTestId('report-controls')
            .locator('[data-testid^="report-param-"]')
            .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))
        expect(chips).toEqual([
            'report-param-period',
            'report-param-method',
            'report-param-rows',
            'report-param-order',
        ])
        await expect(page.getByTestId('report-param-period')).toContainText(
            'This fiscal year to date'
        )
        await expect(page.getByTestId('report-param-method')).toContainText('Accrual')
        await expect(page.getByTestId('report-param-rows')).toContainText('Non-zero')
        await expect(page.getByTestId('report-param-order')).toContainText('Name')
        // Vendor has no default, so core lists it under Add filter, not as a chip.
        await page.getByTestId('report-add-filter').click()
        await expect(page.getByTestId('report-add-filter-vendors')).toHaveText('Vendor')
        await page.keyboard.press('Escape')

        await choosePeriod(page, { from: '2020-01-01', to: '2020-01-31' })
        await expect(page.getByTestId('report-empty')).toBeVisible()
        await expect(
            page.locator('[data-testid^="report-row-g:"], [data-testid^="report-row-d:"]')
        ).toHaveCount(0)
    })

    test("a bill on two expense accounts and an expense give the vendor's Total, and the Total row is 100.00%", async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { vendor } = await vendorWithBills(page, { bills: [] })
        await postBillOnAccounts(page, vendor.name, [
            { account: RENT, amount: '300.00' },
            { account: BILL_EXPENSE_ACCOUNT, amount: '200.00' },
        ])

        await openFor(page, [vendor.name])
        const billOnly = await reportSnapshot(page)
        expect(vendorLabels(billOnly)).toEqual([vendor.name])
        expect(expenseCents(billOnly, vendor.name)).toBe(50000)
        expect(expenseShare(billOnly, vendor.name)).toBe(100)
        expect(expenseCents(billOnly, 'Total')).toBe(50000)
        expect(expenseShare(billOnly, 'Total')).toBe(100)

        // The New menu is Books', not the report view's: go back to Books first.
        await navigateToPackage(page, 'books')
        await openNewExpense(page)
        await pickExpenseVendor(page, vendor.name)
        await pickPaidFrom(page, CHECKING)
        const line = await pickExpenseLineAccount(page, 0, BILL_EXPENSE_ACCOUNT)
        await page.getByTestId(expenseCellTestId('account_lines', line, 'amount')).fill('50.00')
        await postExpense(page)

        // Leaving the report through the Books rail drops its params, so the report opens
        // again unfiltered: narrow it to the vendor and today again, so the Total is this
        // test's own.
        await openFor(page, [vendor.name])
        const withExpense = await snapshotWhen(
            page,
            reportSnapshot,
            s => expenseCents(s, vendor.name) === 55000,
            `${vendor.name} reads 550.00 with the bill and the expense`
        )
        expect(expenseCents(withExpense, 'Total')).toBe(55000)
        expect(expenseShare(withExpense, vendor.name)).toBe(100)
    })

    test('a vendor credit lowers a vendor, a credit alone is below zero, and Largest expenses orders by Total', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        // Both vendors first: vendorWithBills starts from a list, and a posted credit leaves
        // its read view on screen. The names put the credit-only vendor first by name, so
        // the order by Total differs from the order by name.
        const { vendor: billed } = await apVendorWithBill(page, {
            amount: '400.00',
            due,
            name: uniqueName('Zephyr EBV billed'),
        })
        const { vendor: creditOnly } = await vendorWithBills(page, {
            name: uniqueName('Alder EBV credit only'),
            bills: [],
        })
        await postVendorCredit(page, {
            vendor: billed.name,
            account: BILL_EXPENSE_ACCOUNT,
            amount: '100.00',
            memo: uniqueName('EBV credit'),
        })
        await postVendorCredit(page, {
            vendor: creditOnly.name,
            account: BILL_EXPENSE_ACCOUNT,
            amount: '60.00',
            memo: uniqueName('EBV credit only'),
        })

        await openFor(page, [billed.name, creditOnly.name])
        const header = page.getByTestId('report-header-param-vendors')
        await expect(header).toContainText('Vendor: ')
        await expect(header).toContainText(billed.name)
        await expect(header).toContainText(creditOnly.name)
        const byName = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorLabels(s).join('\n') === [creditOnly.name, billed.name].join('\n'),
            'the vendor rows in the Name order'
        )
        expect(expenseCents(byName, billed.name)).toBe(30000)
        expect(expenseCents(byName, creditOnly.name)).toBe(-6000)
        expect(expenseShare(byName, creditOnly.name)).toBeLessThan(0)
        expect(expenseCents(byName, 'Total')).toBe(24000)
        expect(vendorLabels(byName)).toEqual([creditOnly.name, billed.name])

        await chooseExpenseOrder(page, 'amount')
        // Core keeps the Name run's rows, with the same labels, until the new run lands: read
        // the rows only once they are in the Largest-expenses order.
        const byAmount = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorLabels(s).join('\n') === [billed.name, creditOnly.name].join('\n'),
            'the vendor rows in the Largest-expenses order'
        )
        expect(vendorLabels(byAmount)).toEqual([billed.name, creditOnly.name])
        expect(expenseCents(byAmount, 'Total')).toBe(24000)
    })

    test('Method Cash counts a bill by the share a payment paid', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const { vendor, billId } = await apVendorWithBill(page, { amount: '400.00', due })
        await payPartOfBill(page, { vendor, billId, amount: '100.00' })

        await openFor(page, [vendor.name])
        await expect(page.getByTestId('report-header-param-method')).toHaveText('Accrual basis')
        expect(expenseCents(await reportSnapshot(page), vendor.name)).toBe(40000)

        await chooseExpenseMethod(page, 'Cash')
        const cash = await reportSnapshot(page)
        expect(expenseCents(cash, vendor.name)).toBe(10000)
        expect(expenseCents(cash, 'Total')).toBe(10000)
        await expect(page.getByTestId('report-header-param-method')).toHaveText('Cash basis')
    })

    test('a void hides the vendor, and With activity keeps it at 0.00', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const { vendor, billId } = await apVendorWithBill(page, { amount: '300.00', due })
        await voidBill(page, vendor, billId)
        const today = await browserToday(page)

        await openExpensesByVendor(page)
        const activityRun = runLanded(page, params => (params.rows ?? 'nonzero') === 'activity')
        await chooseBalanceRows(page, 'activity')
        await activityRun
        await filterToVendors(page, [vendor.name])
        await chooseDay(page, today)
        const activity = await reportSnapshot(page)
        expect(vendorLabels(activity)).toEqual([vendor.name])
        expect(expenseCents(activity, vendor.name)).toBe(0)

        const nonzeroRun = runLanded(page, params => (params.rows ?? 'nonzero') === 'nonzero')
        await chooseBalanceRows(page, 'nonzero')
        await nonzeroRun
        await snapshotWhen(
            page,
            reportSnapshot,
            s => !s.rows.some(row => row.kind === 'group'),
            `no vendor row under Non-zero for ${vendor.name}`
        )
    })
})
