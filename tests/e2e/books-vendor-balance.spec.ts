import { expect, type Page, test } from '@playwright/test'
import { AP_AGING_TITLE } from '~/tinycld/books/lib/ap-aging-fixture'
import {
    AP_AGING_SHIPPED_KEY,
    VENDOR_BALANCE_SHIPPED_KEY,
} from '~/tinycld/books/lib/shipped-reports'
import {
    VENDOR_BALANCE_EMPTY_DAY,
    VENDOR_BALANCE_SEED,
    VENDOR_BALANCE_TITLE,
} from '~/tinycld/books/lib/vendor-balance-fixture'
import { VENDORS } from '~/tinycld/books/lib/vendor-form-fixture'
import { DESKTOP, PHONE } from './account-register-helpers'
import { apVendorWithBill, filterToVendors, payPartOfBill } from './ap-aging-helpers'
import { freshPageWithReports } from './ar-aging-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import { BILL_URL } from './bill-helpers'
import {
    browserToday,
    chooseAsOf,
    dayWords,
    expectedHeading,
    expectTableFits,
    type ReportSnapshot,
    reportLinesUnder,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import {
    centsOf,
    chooseBalanceOrder,
    chooseBalanceRows,
    expectBalanceRowsFit,
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
import {
    openVendor,
    openVendorsList,
    searchVendors,
    vendorEntries,
    vendorEntry,
} from './vendor-form-helpers'

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

// A prefix that, with uniqueName's stamp, makes a name of about 60 characters: long enough
// to wrap to two lines at 375 and 390 (as LONG_VENDOR_PREFIX of books-ap-aging.spec.ts).
const LONG_VENDOR_PREFIX = 'Cascade Mountain Industrial Freight Supply'

// The widest figure of the fixture (spec §3 Phone: Balance is never cut).
const WIDE_AMOUNT = '130115.25'

/**
 * Spec §3 "Phone" at `viewport`: at the default viewport a vendor with a long name and one
 * bill of the widest figure, the report narrowed to it; then at the phone size the toolbar
 * folds Customize into More, every mounted row has its label and Balance on one line band
 * with the Balance whole, the vendor's label takes two or three lines, and nothing scrolls
 * sideways, closed and with the vendor opened into its bill line.
 */
async function expectOpenedVendorFitsPhone(
    page: Page,
    viewport: { width: number; height: number }
): Promise<void> {
    await openBooks(page, DESKTOP)
    const due = await localDay(page, 30)
    const { vendor } = await apVendorWithBill(page, {
        amount: WIDE_AMOUNT,
        due,
        name: uniqueName(LONG_VENDOR_PREFIX),
    })
    await openVendorBalance(page)
    await filterToVendors(page, [vendor.name])
    expect(vendorRowCents(await reportSnapshot(page), vendor.name)).toBe(13011525)

    await page.setViewportSize(viewport)
    // At a phone width the report toolbar moves its actions into More (lesson 13).
    const more = page.getByTestId('toolbar-more-button')
    await expect(more).toBeVisible()
    await expect(page.getByTestId('report-customize-open')).toHaveCount(0)
    const fit = { familyHeader: false, wrappedLabel: vendor.name }
    await expectBalanceRowsFit(page, fit)

    await openBalanceRow(page, vendor.name)
    // The bill's line row is now mounted under the vendor.
    await expectBalanceRowsFit(page, fit)
    await expectTableFits(page)

    await more.click()
    await expect(page.getByRole('menuitem', { name: 'Customize', exact: true })).toBeVisible()
    await expect(page.getByTestId('report-export-csv')).toHaveAttribute('role', 'menuitem')
}

test.describe('vendor-balance: entry points and phone rows', () => {
    // No phone run: the header and the menu are the same component and logic at both widths.
    test("the Vendors list's Reports menu lists Vendor Balance above A/P Aging, for a reader too, and draws only the reports that are found", async ({
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
        const balance = page.getByTestId('vendors-reports-balance').filter({ visible: true })
        const aging = page.getByTestId('vendors-reports-aging').filter({ visible: true })
        await expect(balance).toHaveText('Vendor Balance')
        await expect(aging).toHaveText('A/P Aging')
        await expect
            .poll(
                async () => {
                    const [balanceBox, agingBox] = await Promise.all([
                        balance.boundingBox(),
                        aging.boundingBox(),
                    ])
                    return balanceBox !== null && agingBox !== null && balanceBox.y < agingBox.y
                },
                { message: 'Vendor Balance is above A/P Aging in the menu' }
            )
            .toBe(true)
        await balance.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(page).toHaveURL(/\/a\/books\/reports\//)
        await expect(
            page.getByTestId('report-document-title').filter({ visible: true })
        ).toHaveText(VENDOR_BALANCE_TITLE)

        // Core reopens Books at its last route, and the report is now on the Books route: a
        // new page would reopen on it, not on the list. Going back leaves the list as the
        // last route.
        await page.goBack()
        await openVendorsList(page)

        // Only the A/P Aging is found: after the Vendor Balance read answered with no row,
        // the menu holds the A/P Aging alone.
        const agingOnly = await freshPageWithReports(page, [
            { id: 'vbagingreport01', shipped_key: AP_AGING_SHIPPED_KEY, title: AP_AGING_TITLE },
        ])
        await openBooks(agingOnly.fresh, DESKTOP)
        await openVendorsList(agingOnly.fresh)
        await expect
            .poll(
                () =>
                    agingOnly.answered.some(filter => filter.includes(VENDOR_BALANCE_SHIPPED_KEY)),
                {
                    message: 'the Vendors list got its answer for the Vendor Balance',
                }
            )
            .toBe(true)
        await agingOnly.fresh.getByTestId('vendors-reports').click()
        await expect(
            agingOnly.fresh.getByTestId('vendors-reports-aging').filter({ visible: true })
        ).toHaveText('A/P Aging')
        await expect(agingOnly.fresh.getByTestId('vendors-reports-balance')).toHaveCount(0)
        await agingOnly.fresh.close()

        // Neither report is found: after both reads answered with no row, the list's header
        // draws no Reports menu, and the list itself shows.
        const none = await freshPageWithReports(page, [])
        await openBooks(none.fresh, DESKTOP)
        await openVendorsList(none.fresh)
        await expect
            .poll(
                () =>
                    [VENDOR_BALANCE_SHIPPED_KEY, AP_AGING_SHIPPED_KEY].every(key =>
                        none.answered.some(filter => filter.includes(key))
                    ),
                { message: 'the Vendors list got its answers for both reports' }
            )
            .toBe(true)
        await expect(vendorEntries(none.fresh).first()).toBeVisible()
        await expect(none.fresh.getByTestId('vendors-reports')).toHaveCount(0)
        await none.fresh.close()
    })

    // Phone runs: the phone path is other code (core's phone row layout from the `display`
    // block, the toolbar's More). 375 and 390 wrap differently (lesson 21).
    test('an opened vendor reads on a 390 px phone with no sideways scroll', async ({ page }) => {
        await expectOpenedVendorFitsPhone(page, PHONE)
    })

    test('an opened vendor reads on a 375 px phone with no sideways scroll', async ({ page }) => {
        await expectOpenedVendorFitsPhone(page, { width: 375, height: 812 })
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
