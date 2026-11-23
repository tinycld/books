import { expect, type Page, type Request, test } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import { AP_AGING_TITLE } from '~/tinycld/books/lib/ap-aging-fixture'
import {
    EXPENSES_BY_VENDOR_SEED,
    EXPENSES_BY_VENDOR_TITLE,
} from '~/tinycld/books/lib/expenses-by-vendor-fixture'
import {
    AP_AGING_SHIPPED_KEY,
    EXPENSES_BY_VENDOR_SHIPPED_KEY,
    VENDOR_BALANCE_SHIPPED_KEY,
} from '~/tinycld/books/lib/shipped-reports'
import { VENDOR_BALANCE_TITLE } from '~/tinycld/books/lib/vendor-balance-fixture'
import { VENDOR_IDS, VENDORS } from '~/tinycld/books/lib/vendor-form-fixture'
import { DESKTOP, PHONE } from './account-register-helpers'
import { apVendorWithBill, filterToVendors, payPartOfBill } from './ap-aging-helpers'
import { freshPageWithReports } from './ar-aging-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import { BILL_URL } from './bill-helpers'
import {
    browserToday,
    choosePeriod,
    csvRecords,
    dayWords,
    expectedHeading,
    expectTableFits,
    exportReport,
    MANUAL_NOTE,
    manualBand,
    type ReportSnapshot,
    refreshReport,
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
    expectLabelsWrapWhole,
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
import { expectSalesPhoneLines, expectSalesRowsFit } from './sales-reports-helpers'
import { postVendorCredit } from './vendor-credit-helpers'
import { openVendorsList, vendorEntries } from './vendor-form-helpers'

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

// The change-signal topics (core changesignal.Topic) of the ledger tables the report
// reads: a live report subscribes to them and runs again on each of their signals.
const LEDGER_TOPICS = [
    'collection/books_journal_lines',
    'collection/books_cash_basis_lines',
    'collection/books_journal_entries',
]

// The topics of one realtime subscribe request (`{ clientId, subscriptions }`).
function realtimeTopics(request: Request): string[] {
    const body = request.postDataJSON() as { subscriptions?: unknown } | null
    const topics = body?.subscriptions
    return Array.isArray(topics) ? topics.filter(t => typeof t === 'string') : []
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

    // Plan D11 (human, 2026-11-21): the report is not live. It shows core's note and
    // Refresh, and a post made in another window shows only after Refresh.
    test('an open report shows Refresh, and a bill posted in another window shows after Refresh', async ({
        page,
    }) => {
        // Every report run `page` sends, and the topic set of each realtime subscribe
        // it sends (each subscribe carries the client's whole set).
        const runs: (string | null)[] = []
        let subscribed: string[] = []
        page.on('request', request => {
            const path = new URL(request.url()).pathname
            if (request.method() !== 'POST') return
            if (path === '/api/reports/run') runs.push(request.postData())
            if (path === '/api/realtime') subscribed = realtimeTopics(request)
        })

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
        const { note, refresh } = manualBand(page)
        await expect(note).toHaveText(MANUAL_NOTE)
        await expect(refresh).toBeVisible()
        // The open report's own body: a run with another body (another worker's share
        // or save of another report) is not a re-run of this one.
        const openBody = runs.at(-1)
        expect(openBody, 'the open report sent its run').toBeTruthy()
        const runsBeforePost = runs.length

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

        // A report re-runs by itself only on a change signal of a table it reads, and a
        // signal reaches `page` only for a topic it subscribes to. A live report
        // subscribes to its ledger tables once its run lands, long before the post
        // ends; this one holds none, so no change of the post can reach it, however
        // late the reads below come.
        expect(subscribed.filter(topic => LEDGER_TOPICS.includes(topic))).toEqual([])
        const unchanged = await reportSnapshot(page)
        expect(expenseCents(unchanged, vendor.name)).toBe(25000)
        expect(expenseCents(unchanged, 'Total')).toBe(25000)
        expect(runs.slice(runsBeforePost).filter(body => body === openBody)).toEqual([])

        await refreshReport(page)
        const refreshed = await snapshotWhen(
            page,
            reportSnapshot,
            s => expenseCents(s, vendor.name) === 32500,
            `${vendor.name} reads 325.00 in the open report after Refresh`
        )
        expect(expenseCents(refreshed, 'Total')).toBe(32500)
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

// The menu's items in the order they are drawn: the visible `vendors-reports-…` test ids.
function reportsMenuItems(page: Page): Promise<(string | null)[]> {
    return page
        .locator('[data-testid^="vendors-reports-"]')
        .filter({ visible: true })
        .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))
}

// A prefix that, with uniqueName's stamp, makes a name of about 60 characters: long enough
// to wrap at 375 and 390 (as in books-vendor-balance.spec.ts).
const LONG_VENDOR_PREFIX = 'Cascade Mountain Industrial Freight Supply'

// Two lines whose figures are wide (spec §3 "Phone").
const LONG_LINES = [
    { account: RENT, amount: '64015.25' },
    { account: BILL_EXPENSE_ACCOUNT, amount: '66100.00' },
] as const
// The bill's memo, saved as its journal entry memo: a bill line's description in the report
// (lineDescriptionFormula: the line memo, else the entry memo). Long enough that each bill
// line's label wraps at 375 and 390, short enough to stay within three lines.
const LONG_MEMO = 'Warehouse dock rent and route software, Q4'

// The phone arrangement of D1: the name on line 1, Total and % of expenses on line 2. The
// helper places the label on line 1 itself; `lines` are the lines below it.
const EXPENSE_PHONE_LINES = [['amount', 'pct']] as const
const EXPENSE_COLUMNS = ['amount', 'pct'] as const

/**
 * Spec §3 "Phone" at `viewport`: at the default viewport a vendor with a long name and a
 * bill on two accounts with a long memo (paid in part when `method` is Cash), the report
 * narrowed to it and to today; then at the phone size the table takes its `mobile`
 * arrangement, the vendor row and an opened line have their figures on line 2, every label
 * takes at most three lines, the long vendor name and the bill lines' labels wrap and show
 * whole, no figure is cut, and nothing scrolls sideways.
 */
async function expectOpenedVendorFitsPhone(
    page: Page,
    viewport: { width: number; height: number },
    method: 'Accrual' | 'Cash'
): Promise<void> {
    await openBooks(page, DESKTOP)
    const { vendor } = await vendorWithBills(page, {
        name: uniqueName(LONG_VENDOR_PREFIX),
        bills: [],
    })
    const bill = await postBillOnAccounts(page, vendor.name, LONG_LINES, { memo: LONG_MEMO })
    if (method === 'Cash') {
        await payPartOfBill(page, { vendor, billId: bill.id, amount: '1000.00' })
    }
    await openFor(page, [vendor.name])
    if (method === 'Cash') await chooseExpenseMethod(page, 'Cash')
    const lineCount = method === 'Cash' ? 6 : 2

    await page.setViewportSize(viewport)
    await expect(page.getByTestId('toolbar-more-button')).toBeVisible()
    await expect(page.getByTestId('report-table')).toHaveAttribute('data-layout', 'mobile')
    const closed = await snapshotWhen(
        page,
        reportSnapshot,
        s => vendorLabels(s).includes(vendor.name),
        `the ${vendor.name} row is mounted`
    )
    const row = closed.rows.find(r => r.kind === 'group' && r.label === vendor.name)
    if (!row) throw new Error(`no mounted row "${vendor.name}"`)
    await expectSalesPhoneLines(page, row.id, EXPENSE_PHONE_LINES)
    await expectSalesRowsFit(page, EXPENSE_COLUMNS)
    // The long vendor name wraps and shows whole (whiteSpace normal, not one line cut).
    await expectLabelsWrapWhole(page, [row.id])

    await openBalanceRow(page, vendor.name)
    const opened = await snapshotWhen(
        page,
        reportSnapshot,
        s => expenseLines(s, vendor.name).length === lineCount,
        `${lineCount} lines under ${vendor.name} on ${method}`
    )
    const lines = expenseLines(opened, vendor.name)
    for (const line of lines) await expectSalesPhoneLines(page, line.id, EXPENSE_PHONE_LINES)
    await expectSalesRowsFit(page, EXPENSE_COLUMNS)
    // The bill's own lines carry the long memo as their description; each wraps and shows whole.
    const today = await browserToday(page)
    const described = lines.filter(line => line.label.endsWith(` · ${LONG_MEMO}`))
    expect(
        described.map(line => line.label),
        'the two bill lines are opened with the memo as their description'
    ).toEqual([
        expect.stringMatching(lineLabel(today, `Bill ${bill.number}`, RENT, LONG_MEMO)),
        expect.stringMatching(
            lineLabel(today, `Bill ${bill.number}`, BILL_EXPENSE_ACCOUNT, LONG_MEMO)
        ),
    ])
    await expectLabelsWrapWhole(
        page,
        described.map(line => line.id)
    )
    await expectTableFits(page)
}

test.describe('expenses-by-vendor: entry points and phone rows', () => {
    // No phone run: the menu is the same component and logic at both widths.
    test("the Vendors list's Reports menu lists Expenses by Vendor third, for a reader too, and draws only the reports that are found", async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await openBooks(page, DESKTOP)
        await openVendorsList(page)
        // A reader page: the header shows the Reports menu and no New vendor button.
        const reports = page.getByTestId('vendors-reports')
        await expect(reports).toBeVisible()
        await expect(page.getByTestId('vendor-new-header')).toHaveCount(0)
        await reports.click()
        const expenses = page.getByTestId('vendors-reports-expenses').filter({ visible: true })
        await expect(expenses).toHaveText('Expenses by Vendor')
        await expect
            .poll(() => reportsMenuItems(page), {
                message:
                    'the menu holds Vendor Balance, A/P Aging, Expenses by Vendor, 1099 Summary and Detail in order',
            })
            .toEqual([
                'vendors-reports-balance',
                'vendors-reports-aging',
                'vendors-reports-expenses',
                'vendors-reports-1099',
            ])
        await expenses.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(page).toHaveURL(/\/a\/books\/reports\//)
        await expect(
            page.getByTestId('report-document-title').filter({ visible: true })
        ).toHaveText(EXPENSES_BY_VENDOR_TITLE)

        // The Expenses by Vendor is not found: after its read answered with no row, the menu
        // holds the other two only.
        const twoOnly = await freshPageWithReports(page, [
            {
                id: 'ebvbalancerep01',
                shipped_key: VENDOR_BALANCE_SHIPPED_KEY,
                title: VENDOR_BALANCE_TITLE,
            },
            { id: 'ebvagingreport1', shipped_key: AP_AGING_SHIPPED_KEY, title: AP_AGING_TITLE },
        ])
        await openBooks(twoOnly.fresh, DESKTOP)
        await openVendorsList(twoOnly.fresh)
        await expect
            .poll(
                () =>
                    twoOnly.answered.some(filter =>
                        filter.includes(EXPENSES_BY_VENDOR_SHIPPED_KEY)
                    ),
                { message: 'the Vendors list got its answer for the Expenses by Vendor' }
            )
            .toBe(true)
        await expect(vendorEntries(twoOnly.fresh).first()).toBeVisible()
        await twoOnly.fresh.getByTestId('vendors-reports').click()
        await expect(
            twoOnly.fresh.getByTestId('vendors-reports-aging').filter({ visible: true })
        ).toHaveText('A/P Aging')
        await expect
            .poll(() => reportsMenuItems(twoOnly.fresh))
            .toEqual(['vendors-reports-balance', 'vendors-reports-aging'])
        await expect(twoOnly.fresh.getByTestId('vendors-reports-expenses')).toHaveCount(0)
        await twoOnly.fresh.close()
    })

    // Phone runs: the phone path is other code (the report's `display.layouts` arrangement,
    // core's phone row layout). 375 and 390 are both measured widths of D1 (lesson 21).
    test('an opened vendor reads on a 390 px phone with no sideways scroll', async ({ page }) => {
        await expectOpenedVendorFitsPhone(page, PHONE, 'Accrual')
    })

    test('an opened vendor reads on a 375 px phone with no sideways scroll', async ({ page }) => {
        await expectOpenedVendorFitsPhone(page, { width: 375, height: 844 }, 'Cash')
    })
})
