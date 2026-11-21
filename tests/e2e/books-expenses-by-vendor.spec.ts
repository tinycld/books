import { expect, type Page, test } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    EXPENSES_BY_VENDOR_SEED,
    EXPENSES_BY_VENDOR_TITLE,
} from '~/tinycld/books/lib/expenses-by-vendor-fixture'
import { VENDOR_IDS, VENDORS } from '~/tinycld/books/lib/vendor-form-fixture'
import { DESKTOP } from './account-register-helpers'
import { apVendorWithBill, filterToVendors, payPartOfBill } from './ap-aging-helpers'
import { BILL_URL } from './bill-helpers'
import {
    browserToday,
    choosePeriod,
    csvRecords,
    dayWords,
    expectedHeading,
    exportReport,
    type ReportSnapshot,
    reportSnapshot,
    reportSnapshotAtTop,
    snapshotWhen,
} from './books-report-helpers'
import { centsOf, chooseBalanceRows, openBalanceRow } from './customer-balance-helpers'
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
    expenseLines,
    expenseShare,
    mutedHeadingColor,
    openExpensesByVendor,
    postBillOnAccounts,
    rowLabelColor,
    runLanded,
    voidBill,
} from './expenses-by-vendor-helpers'
import { BILL_EXPENSE_ACCOUNT, CHECKING, localDay, vendorWithBills } from './pay-bills-helpers'
import { escapeRegExp, openBooks, uniqueName } from './record-form-helpers'
import { postVendorCredit } from './vendor-credit-helpers'

// The Expenses by Vendor (expenses-by-vendor checkpoint 1): the shipped report from the
// Books hub. Each test creates its own vendors through the UI, posts documents dated today
// (the forms' default), filters the report to its vendors and sets a Custom period of
// today, so every figure it asserts is its own and none depends on the fiscal month. Core's
// table mounts only the rows near the viewport; a filtered report is a few rows, read in
// one snapshot.

const RENT = '6100 Rent'

// Sets the Custom period from `from` to `to` and waits for the run of that period: core
// keeps the previous run's rows on screen until the new run lands.
async function chooseDays(page: Page, from: string, to: string): Promise<void> {
    const landed = runLanded(page, params => {
        const period = params.period as { from?: string; to?: string } | undefined
        return period?.from === from && period?.to === to
    })
    await choosePeriod(page, { from, to })
    await landed
}

// Sets the Custom period from `day` to `day` and waits for the run of that period.
function chooseDay(page: Page, day: string): Promise<void> {
    return chooseDays(page, day, day)
}

// A line label of the given parts joined by " · ", with nothing after the last part.
function lineLabel(...parts: string[]): RegExp {
    return new RegExp(`^${parts.map(escapeRegExp).join(' · ')}$`)
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

    test('a vendor opens into its lines with their accounts, and a line opens the bill', async ({
        page,
    }) => {
        // 1280 px: under 1360, so the bill opens as its own screen (spec §3 Opening a
        // transaction; the panel path at 1360 and wider is p5-drill-down's).
        await openBooks(page, DESKTOP)
        const { vendor } = await vendorWithBills(page, { bills: [] })
        const bill = await postBillOnAccounts(page, vendor.name, [
            { account: RENT, amount: '300.00' },
            { account: BILL_EXPENSE_ACCOUNT, amount: '200.00' },
        ])
        await navigateToPackage(page, 'books')
        await openNewExpense(page)
        await pickExpenseVendor(page, vendor.name)
        await pickPaidFrom(page, CHECKING)
        const expenseLine = await pickExpenseLineAccount(page, 0, BILL_EXPENSE_ACCOUNT)
        await page
            .getByTestId(expenseCellTestId('account_lines', expenseLine, 'amount'))
            .fill('50.00')
        const expenseNo = await postExpense(page)
        const today = await browserToday(page)

        await openFor(page, [vendor.name])
        await openBalanceRow(page, vendor.name)
        const opened = await snapshotWhen(
            page,
            reportSnapshot,
            s => expenseLines(s, vendor.name).length === 3,
            `three lines under ${vendor.name}`
        )
        const lines = expenseLines(opened, vendor.name)
        // The bill's two lines by position, then the expense, posted after it.
        expect(lines.map(line => line.label)).toEqual([
            expect.stringMatching(lineLabel(today, `Bill ${bill.number}`, RENT)),
            expect.stringMatching(lineLabel(today, `Bill ${bill.number}`, BILL_EXPENSE_ACCOUNT)),
            expect.stringMatching(lineLabel(today, `Expense ${expenseNo}`, BILL_EXPENSE_ACCOUNT)),
        ])
        expect(lines.map(line => line.cents)).toEqual([30000, 20000, 5000])
        expect(lines.map(line => line.share)).toEqual(['', '', ''])
        const sum = lines.reduce((acc, line) => acc + line.cents, 0)
        expect(sum, `the lines add up to ${vendor.name}'s Total`).toBe(
            expenseCents(opened, vendor.name)
        )

        await page.getByTestId(`report-row-${lines[0].id}`).click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page).toHaveURL(new RegExp(`/books/bills/${bill.id}$`))
        await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
    })

    test("on Cash an opened vendor shows the bill line, its take-out row and the payment's share", async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const { vendor, billId, billNo } = await apVendorWithBill(page, { amount: '400.00', due })
        const paymentNo = await payPartOfBill(page, { vendor, billId, amount: '100.00' })
        const today = await browserToday(page)

        await openFor(page, [vendor.name])
        await chooseExpenseMethod(page, 'Cash')
        await openBalanceRow(page, vendor.name)
        const opened = await snapshotWhen(
            page,
            reportSnapshot,
            s => expenseLines(s, vendor.name).length === 3,
            `three lines under ${vendor.name} on Cash`
        )
        const lines = expenseLines(opened, vendor.name)
        expect(lines.map(line => line.label)).toEqual([
            expect.stringMatching(lineLabel(today, `Bill ${billNo}`, BILL_EXPENSE_ACCOUNT)),
            expect.stringMatching(
                lineLabel(today, `Bill ${billNo}`, BILL_EXPENSE_ACCOUNT, 'Unpaid bill (cash basis)')
            ),
            expect.stringMatching(
                lineLabel(
                    today,
                    `Bill payment ${paymentNo}`,
                    BILL_EXPENSE_ACCOUNT,
                    `Bill ${billNo} paid (cash basis)`
                )
            ),
        ])
        expect(lines.map(line => line.cents)).toEqual([40000, -40000, 10000])
        expect(lines.reduce((acc, line) => acc + line.cents, 0)).toBe(10000)
        expect(expenseCents(opened, vendor.name)).toBe(10000)
    })

    test('an open report follows a bill posted in another window', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const { vendor } = await apVendorWithBill(page, { amount: '250.00', due })

        await openFor(page, [vendor.name])
        const before = await snapshotWhen(
            page,
            reportSnapshot,
            s => expenseCents(s, vendor.name) === 25000,
            `${vendor.name} reads 250.00 with its one bill`
        )
        expect(expenseCents(before, 'Total')).toBe(25000)

        // The report stays open on `page`; a second window of the same session posts.
        const poster = await page.context().newPage()
        try {
            await openBooks(poster, DESKTOP)
            await postBillOnAccounts(poster, vendor.name, [
                { account: BILL_EXPENSE_ACCOUNT, amount: '75.00' },
            ])
        } finally {
            await poster.close()
        }

        const live = await snapshotWhen(
            page,
            reportSnapshot,
            s => expenseCents(s, vendor.name) === 32500,
            `${vendor.name} reads 325.00 in the open report with no action on it`
        )
        expect(expenseCents(live, 'Total')).toBe(32500)
    })

    test("the seeded book: an inactive vendor marked, the long name, No vendor last, and a CSV that lists every vendor's lines", async ({
        page,
    }) => {
        const nameOf = (id: string) => {
            const vendor = VENDORS.find(v => v.id === id)
            if (!vendor) throw new Error(`no seeded vendor ${id}`)
            return vendor.display_name
        }
        const coastal = `${nameOf(VENDOR_IDS.coastalCoffee)} (inactive)`
        const willamette = nameOf(VENDOR_IDS.willamette)
        await page.emulateMedia({ colorScheme: 'light' })
        await openBooks(page, DESKTOP)
        await openExpensesByVendor(page)
        await chooseDays(page, '2026-09-01', '2026-09-30')

        // The view is read only for the muted color of the Coastal row: the list is windowed
        // and other specs add September vendors, so the row order is read from the CSV.
        const top = await snapshotWhen(
            page,
            reportSnapshotAtTop,
            s => s.rows.some(row => row.kind === 'group' && row.label === coastal),
            `the ${coastal} row is mounted`
        )
        const coastalRow = top.rows.find(row => row.kind === 'group' && row.label === coastal)
        if (!coastalRow) throw new Error(`the ${coastal} row is not mounted`)
        expect(
            await rowLabelColor(page, coastalRow.id),
            `${coastal} is drawn in the muted foreground of the column headings`
        ).toBe(await mutedHeadingColor(page, 'name'))

        // Every figure below is of the one CSV run.
        const { bytes } = await exportReport(page, 'csv')
        const records = csvRecords(bytes)
        expect(records[0]).toEqual(['Vendor', 'Total', '% of expenses'])
        const isLine = (record: string[]) => /^\d{4}-\d{2}-\d{2} · /.test(record[0] ?? '')
        const totalRecord = records.at(-1)
        expect(totalRecord?.[0], 'the Total is the last CSV record').toBe('Total')
        const vendorRecords = records.slice(1, -1).filter(record => !isLine(record))
        const vendorNames = vendorRecords.map(record => record[0])
        expect(vendorNames).toContain(coastal)
        expect(vendorNames).toContain(willamette)
        expect(vendorNames.at(-1), 'No vendor is the last vendor, above the Total').toBe(
            'No vendor'
        )
        const vendorSum = vendorRecords.reduce((acc, record) => acc + centsOf(record[1] ?? ''), 0)
        expect(centsOf(totalRecord?.[1] ?? ''), 'the Total adds up the vendors').toBe(vendorSum)

        const coastalAt = records.findIndex(record => record[0] === coastal)
        const nextVendor = records.findIndex(
            (record, index) => index > coastalAt && !isLine(record)
        )
        const coastalLines = records.slice(coastalAt + 1, nextVendor)
        const seedLine = EXPENSES_BY_VENDOR_SEED.lines.find(
            line => line.vendor === VENDOR_IDS.coastalCoffee
        )
        if (!seedLine) throw new Error('EXPENSES_BY_VENDOR_SEED has no Coastal Coffee line')
        expect(
            coastalLines.map(record => [record[0], centsOf(record[1] ?? ''), record[2]]),
            `the seeded journal entry's line on 6200 under ${coastal}`
        ).toContainEqual([
            expect.stringMatching(
                new RegExp(
                    // A seeded entry's number is not only digits ("JE-25").
                    `^${EXPENSES_BY_VENDOR_SEED.date} · Journal entry \\S+ · ${escapeRegExp(BILL_EXPENSE_ACCOUNT)} · ${escapeRegExp(EXPENSES_BY_VENDOR_SEED.memo)}$`
                )
            ),
            seedLine.debit,
            '',
        ])
    })
})
