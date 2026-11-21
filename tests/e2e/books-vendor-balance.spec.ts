import { expect, type Page, test } from '@playwright/test'
import {
    VENDOR_BALANCE_EMPTY_DAY,
    VENDOR_BALANCE_SEED,
    VENDOR_BALANCE_TITLE,
} from '~/tinycld/books/lib/vendor-balance-fixture'
import { VENDORS } from '~/tinycld/books/lib/vendor-form-fixture'
import { DESKTOP } from './account-register-helpers'
import { apVendorWithBill, filterToVendors, payPartOfBill } from './ap-aging-helpers'
import { BILL_URL } from './bill-helpers'
import {
    browserToday,
    chooseAsOf,
    dayWords,
    expectedHeading,
    type ReportSnapshot,
    reportLinesUnder,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import {
    centsOf,
    chooseBalanceOrder,
    chooseBalanceRows,
    openBalanceRow,
} from './customer-balance-helpers'
import { BILL_EXPENSE_ACCOUNT, localDay, vendorWithBills } from './pay-bills-helpers'
import { openBooks, uniqueName } from './record-form-helpers'
import {
    openVendorBalance,
    totalCents,
    vendorBalanceCsv,
    vendorRowCents,
} from './vendor-balance-helpers'
import { postVendorCredit } from './vendor-credit-helpers'
import { openVendor, openVendorsList, searchVendors, vendorEntry } from './vendor-form-helpers'

// The Vendor Balance (vendor-balance checkpoint 1): the shipped report from the Books hub,
// and the vendors each test creates through the UI, each bill due 30 days after today (so
// dated today), read with the report filtered to them, so every exact figure is the test's
// own. As of keeps its default, Today, except in the empty-state test. Core's table mounts
// only the rows near the viewport; the filtered report is a few rows, read in one snapshot.

// Waits for the run of a Rows choice: core keeps the previous run's rows on screen until
// the new run lands. Start it before the change and await it after.
function rowsRunLanded(page: Page, rows: 'nonzero' | 'activity') {
    return page.waitForResponse(response => {
        if (!response.url().includes('/api/reports/run') || !response.ok()) return false
        const body = response.request().postDataJSON() as { params?: { rows?: string } } | null
        return (body?.params?.rows ?? 'nonzero') === rows
    })
}

test.describe('vendor-balance: report', () => {
    test('opens from the Reports hub with its heading, and is empty before the first payable', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openVendorBalance(page)

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '',
            'the report header'
        )
        expect(snapshot.title).toBe(VENDOR_BALANCE_TITLE)
        await expect
            .poll(async () => {
                const expected = await expectedHeading(page)
                return expected !== '' && (await reportSnapshot(page)).business === expected
            })
            .toBe(true)
        const today = await browserToday(page)
        expect((await reportSnapshot(page)).header).toBe(`As of ${dayWords(today)}`)
        await expect(page.getByTestId('report-param-asOf')).toBeVisible()
        await expect(page.getByTestId('report-param-rows')).toContainText('Non-zero')
        await expect(page.getByTestId('report-param-order')).toContainText('Name')
        const { headings } = await reportSnapshot(page)
        expect([headings.name, headings.balance]).toEqual(['Vendor', 'Balance'])

        await chooseAsOf(page, { day: VENDOR_BALANCE_EMPTY_DAY })
        await expect(page.getByTestId('report-empty')).toContainText(
            `No rows as of ${dayWords(VENDOR_BALANCE_EMPTY_DAY)}`
        )
        await expect(
            page.locator('[data-testid^="report-row-g:"], [data-testid^="report-row-d:"]')
        ).toHaveCount(0)
    })

    test("a new vendor's balance is its page's Open balance", async ({ page }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const { vendor } = await apVendorWithBill(page, { amount: '1250.00', due })

        await openVendor(page, vendor.name)
        const open = page.getByTestId('vendor-balance-open').filter({ visible: true })
        await expect(open).toHaveText(/^−?\$[\d,]+\.\d{2}$/)
        const pageCents = centsOf(await open.innerText())

        await openVendorBalance(page)
        await filterToVendors(page, [vendor.name])
        const snapshot = await reportSnapshot(page)
        expect(snapshot.rows.filter(row => row.kind === 'group').map(row => row.label)).toEqual([
            vendor.name,
        ])
        expect(vendorRowCents(snapshot, vendor.name)).toBe(125000)
        expect(vendorRowCents(snapshot, vendor.name)).toBe(pageCents)
        expect(totalCents(snapshot)).toBe(125000)
        const header = page.getByTestId('report-header-param-vendors')
        await expect(header).toContainText('Vendor: ')
        await expect(header).toContainText(vendor.name)
    })

    test('With activity shows a vendor whose voided bill adds up to zero', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const { vendor, billId } = await apVendorWithBill(page, { amount: '300.00', due })

        await openVendorsList(page)
        await searchVendors(page, vendor.name)
        await vendorEntry(page, vendor.name).click()
        await expect(page.getByTestId('vendor-title')).toHaveText(vendor.name)
        await page.getByTestId(`vendor-transaction-${billId}`).click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
        await page.getByTestId('bill-read-void').filter({ visible: true }).click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('bill-badge').filter({ visible: true })).toHaveText('Void')

        await openVendorBalance(page)
        const activityRun = rowsRunLanded(page, 'activity')
        await chooseBalanceRows(page, 'activity')
        await activityRun
        await filterToVendors(page, [vendor.name])
        expect(vendorRowCents(await reportSnapshot(page), vendor.name)).toBe(0)

        const nonzeroRun = rowsRunLanded(page, 'nonzero')
        await chooseBalanceRows(page, 'nonzero')
        await nonzeroRun
        await snapshotWhen(
            page,
            reportSnapshot,
            s => !s.rows.some(row => row.kind === 'group'),
            `no vendor row under Non-zero for ${vendor.name}`
        )
    })

    test('a vendor opens into its bill, and the bill row opens the bill', async ({ page }) => {
        // 1280 px: under 1360, so the bill opens as its own screen (spec §3 Opening a
        // transaction; the panel path at 1360 and wider is p5-drill-down's).
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const { vendor, billId, billNo } = await apVendorWithBill(page, { amount: '640.00', due })
        const today = await browserToday(page)

        await openVendorBalance(page)
        await filterToVendors(page, [vendor.name])
        await openBalanceRow(page, vendor.name)
        const lines = reportLinesUnder(await reportSnapshot(page), vendor.name)
        expect(lines.map(line => [line.kind, lineCents(line)])).toEqual([['detail', 64000]])
        const [line] = lines
        expect(line.label).toMatch(new RegExp(`^${today} · Bill ${billNo}(?!\\d)`))

        await page.getByTestId(`report-row-${line.id}`).click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page).toHaveURL(new RegExp(`/books/bills/${billId}$`))
        await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
    })

    test('an open report follows a bill payment made in another window', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const { vendor, billId } = await apVendorWithBill(page, { amount: '900.00', due })

        const viewer = await page.context().newPage()
        await openBooks(viewer, DESKTOP)
        await openVendorBalance(viewer)
        await filterToVendors(viewer, [vendor.name])
        await openBalanceRow(viewer, vendor.name)
        const before = await reportSnapshot(viewer)
        expect(vendorRowCents(before, vendor.name)).toBe(90000)
        expect(reportLinesUnder(before, vendor.name).map(lineCents)).toEqual([90000])

        const paymentNo = await payPartOfBill(page, { vendor, billId, amount: '350.00' })
        const today = await browserToday(page)

        const live = await snapshotWhen(
            viewer,
            reportSnapshot,
            s => vendorRowCents(s, vendor.name) === 55000 && totalCents(s) === 55000,
            `${vendor.name} and the Total read 550.00 in the open report with no action on it`
        )
        expect(
            reportLinesUnder(live, vendor.name).map(lineCents),
            `the bill, then the payment, under ${vendor.name}`
        ).toEqual([90000, -35000])
        const paymentLines = reportLinesUnder(live, vendor.name).filter(row =>
            new RegExp(`^${today} · Bill payment ${paymentNo}(?!\\d)`).test(row.label)
        )
        expect(
            paymentLines.map(lineCents),
            `one line "Bill payment ${paymentNo}" under ${vendor.name}`
        ).toEqual([-35000])
        await viewer.close()
    })

    test('a vendor credit lowers the balance, and an unapplied credit alone is a negative balance', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        // Both vendors first: vendorWithBills starts from a list, and a posted credit leaves
        // its read view on screen.
        const { vendor: owed } = await apVendorWithBill(page, { amount: '500.00', due })
        const { vendor: owesUs } = await vendorWithBills(page, { bills: [] })
        const credit = await postVendorCredit(page, {
            vendor: owed.name,
            account: BILL_EXPENSE_ACCOUNT,
            amount: '120.00',
            memo: uniqueName('Vendor balance credit'),
        })
        await postVendorCredit(page, {
            vendor: owesUs.name,
            account: BILL_EXPENSE_ACCOUNT,
            amount: '80.00',
            memo: uniqueName('Vendor balance credit only'),
        })
        const today = await browserToday(page)

        await openVendorBalance(page)
        await filterToVendors(page, [owed.name, owesUs.name])
        const filtered = await reportSnapshot(page)
        expect(vendorRowCents(filtered, owed.name)).toBe(38000)
        expect(vendorRowCents(filtered, owesUs.name)).toBe(-8000)
        expect(totalCents(filtered)).toBe(30000)

        await openBalanceRow(page, owed.name)
        const creditLines = reportLinesUnder(await reportSnapshot(page), owed.name).filter(row =>
            new RegExp(`^${today} · Vendor credit ${credit.number}(?!\\d)`).test(row.label)
        )
        expect(
            creditLines.map(lineCents),
            `one line "Vendor credit ${credit.number}" under ${owed.name}`
        ).toEqual([-12000])
    })

    test('prints the Vendor filter and orders by largest balance', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const due = await localDay(page, 30)
        const small = await apVendorWithBill(page, { amount: '100.00', due })
        const large = await apVendorWithBill(page, { amount: '700.00', due })
        const byName = [small.vendor.name, large.vendor.name].sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        )
        // uniqueName stamps the time, so the vendor made first is first by name; the
        // balance order then differs from the name order.
        expect(byName).toEqual([small.vendor.name, large.vendor.name])

        await openVendorBalance(page)
        await filterToVendors(page, [small.vendor.name, large.vendor.name])
        const header = page.getByTestId('report-header-param-vendors')
        await expect(header).toContainText('Vendor: ')
        await expect(header).toContainText(small.vendor.name)
        await expect(header).toContainText(large.vendor.name)
        const filtered = await reportSnapshot(page)
        expect(vendorLabels(filtered)).toEqual(byName)
        expect(totalCents(filtered)).toBe(80000)

        await chooseBalanceOrder(page, 'balance')
        const byBalance = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.rows[0]?.label === large.vendor.name,
            `${large.vendor.name} (700.00) is the first row under Largest balance`
        )
        expect(vendorLabels(byBalance)).toEqual([large.vendor.name, small.vendor.name])
        expect(totalCents(byBalance)).toBe(80000)
    })

    test('the seeded book shows the inactive vendor, No vendor last, and a Total that adds up', async ({
        page,
    }) => {
        const oldTown = VENDORS.find(
            vendor => vendor.id === VENDOR_BALANCE_SEED.inactiveEntry.vendor
        )
        if (!oldTown) throw new Error('no seeded vendor for VENDOR_BALANCE_SEED.inactiveEntry')
        await openBooks(page, DESKTOP)
        await openVendorBalance(page)
        const records = await vendorBalanceCsv(page)
        const labels = records.map(record => record[0] ?? '')

        const inactiveLabel = `${oldTown.display_name} (inactive)`
        expect(
            labels.filter(label => label === inactiveLabel),
            `one CSV record "${inactiveLabel}"`
        ).toEqual([inactiveLabel])
        const inactive = records.find(record => record[0] === inactiveLabel)
        expect(recordCents(inactive)).toBe(VENDOR_BALANCE_SEED.inactiveEntry.cents)

        expect(labels.at(-1)).toBe('Total')
        expect(labels.filter(label => label === 'No vendor')).toEqual(['No vendor'])
        expect(labels.indexOf('No vendor'), 'No vendor is the last record before Total').toBe(
            labels.length - 2
        )

        const total = recordCents(records.at(-1))
        const sum = records
            .slice(0, -1)
            .reduce((acc, record) => acc + (recordCents(record) ?? 0), 0)
        expect(total, 'the Total is the sum of every other record').toBe(sum)
    })
})

// The vendor rows' labels of one snapshot, top to bottom.
function vendorLabels(snapshot: ReportSnapshot): string[] {
    return snapshot.rows.filter(row => row.kind === 'group').map(row => row.label)
}

// A mounted line row's Balance in cents; null when the row shows no figure.
function lineCents(row: ReportSnapshot['rows'][number]): number | null {
    const text = row.cells.balance ?? ''
    return text === '' ? null : centsOf(text)
}

// A CSV record's Balance in cents; null when it has none.
function recordCents(record: readonly string[] | undefined): number | null {
    const text = record?.[1] ?? ''
    return text === '' ? null : centsOf(text)
}
