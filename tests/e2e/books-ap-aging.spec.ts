import { expect, test } from '@playwright/test'
import { AP_AGING_TITLE } from '~/tinycld/books/lib/ap-aging-fixture'
import { DESKTOP } from './account-register-helpers'
import {
    AP_DAY,
    aged,
    apVendorWithBill,
    filterToVendors,
    groups,
    openApAging,
    payPartOfBill,
    rowsUnder,
    rowTops,
    totalRow,
} from './ap-aging-helpers'
import { type AgedCents, agedCents, agingRow, openAgingRow } from './ar-aging-helpers'
import {
    browserToday,
    chooseAsOf,
    dayWords,
    expectedHeading,
    expectTableFits,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { chooseBalanceOrder } from './customer-balance-helpers'
import { BILL_EXPENSE_ACCOUNT, BILL_PAYMENT_URL } from './pay-bills-helpers'
import { openBooks, uniqueName } from './record-form-helpers'
import { applyCreditToBill, postVendorCredit } from './vendor-credit-helpers'

// The A/P Aging (ap-aging checkpoint 3): the shipped report from the Books hub, and the
// vendors each test creates through the UI with bills dated and due AP_DAY.due, read with
// the report filtered to them, so every exact figure is the test's own. A Pay bills payment,
// a vendor credit and an application are dated today by their screens, so a test that reads
// them keeps As of at its default, Today. Core's table mounts only the rows near the
// viewport; the filtered report is a few rows, read in one snapshot.

test.describe('ap-aging: report', () => {
    test('opens from the Reports hub with its heading, and is empty before the first payable', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openApAging(page)

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '',
            'the report header'
        )
        expect(snapshot.title).toBe(AP_AGING_TITLE)
        await expect
            .poll(async () => {
                const expected = await expectedHeading(page)
                return expected !== '' && (await reportSnapshot(page)).business === expected
            })
            .toBe(true)
        const today = await browserToday(page)
        await expect(page.getByTestId('report-document-period')).toHaveText(
            `As of ${dayWords(today)}`
        )

        await chooseAsOf(page, { day: AP_DAY.empty })
        await expect(page.getByTestId('report-document-period')).toHaveText('As of January 1, 2020')
        await expect(page.getByTestId('report-empty')).toContainText(
            `No rows as of ${dayWords(AP_DAY.empty)}`
        )
        await expect(page.locator('[data-testid^="report-row-g:"]')).toHaveCount(0)
    })

    test('ages a bill by its due date', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { vendor } = await apVendorWithBill(page, { amount: '1250.00', due: AP_DAY.due })
        await openApAging(page)
        await filterToVendors(page, [vendor.name])

        const steps: [string, Partial<AgedCents>][] = [
            [AP_DAY.aged40, { d60: 125000, total: 125000 }],
            [AP_DAY.due, { current: 125000, total: 125000 }],
        ]
        for (const [day, figures] of steps) {
            await chooseAsOf(page, { day })
            const want = aged(figures)
            const snapshot = await snapshotWhen(
                page,
                reportSnapshot,
                s =>
                    s.rows.some(
                        row =>
                            row.label === vendor.name &&
                            JSON.stringify(agedCents(row)) === JSON.stringify(want)
                    ),
                `${vendor.name}'s row as of ${day}`
            )
            expect(
                agedCents(agingRow(snapshot, vendor.name)),
                `${vendor.name} as of ${day}`
            ).toEqual(want)
            const total = totalRow(snapshot)
            expect(total, `the Total as of ${day}`).toBeDefined()
            if (total) expect(agedCents(total), `the Total as of ${day}`).toEqual(want)
        }

        await chooseAsOf(page, { day: AP_DAY.beforeBill })
        await expect(page.getByTestId('report-empty')).toBeVisible()
        await expect(page.locator('[data-testid^="report-row-g:"]')).toHaveCount(0)
    })

    test('opens a vendor into its bill, the bill into its lines, and a line into the bill payment', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { vendor, billId, billNo } = await apVendorWithBill(page, {
            amount: '900.00',
            due: AP_DAY.due,
        })
        const paymentNo = await payPartOfBill(page, { vendor, billId, amount: '300.00' })
        const today = await browserToday(page)

        await openApAging(page)
        await filterToVendors(page, [vendor.name])
        const landed = await reportSnapshot(page)
        expect(agedCents(agingRow(landed, vendor.name)).total).toBe(60000)

        await openAgingRow(page, vendor.name)
        const items = rowsUnder(await reportSnapshot(page), vendor.name)
        expect(items.map(row => [row.label, row.cells.due, agedCents(row).total])).toEqual([
            [`Bill ${billNo}`, 'Jul 20, 2026', 60000],
        ])

        const itemLabel = `Bill ${billNo}`
        await openAgingRow(page, itemLabel)
        const lines = rowsUnder(await reportSnapshot(page), itemLabel)
        expect(lines.map(line => [line.kind, line.label, agedCents(line).total])).toEqual([
            ['detail', `${AP_DAY.due} · Bill ${billNo}`, 90000],
            ['detail', `${today} · Bill payment ${paymentNo}`, -30000],
        ])

        await page.getByTestId(`report-row-${lines[1].id}`).click()
        await expect(page).toHaveURL(BILL_PAYMENT_URL)
        await expect(page.getByTestId('bill-payment-title').filter({ visible: true })).toHaveText(
            `Bill payment ${paymentNo}`
        )
    })

    test('an open report follows a bill payment made in another window', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { vendor, billId } = await apVendorWithBill(page, {
            amount: '500.00',
            due: AP_DAY.due,
        })
        await openApAging(page)
        await filterToVendors(page, [vendor.name])
        expect(agedCents(agingRow(await reportSnapshot(page), vendor.name)).total).toBe(50000)

        const second = await page.context().newPage()
        await openBooks(second, DESKTOP)
        await payPartOfBill(second, { vendor, billId, amount: '200.00' })

        const live = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.rows.some(row => row.label === vendor.name && agedCents(row).total === 30000),
            `${vendor.name} reads 300.00 in the open report with no action on it`
        )
        expect(agedCents(agingRow(live, vendor.name)).total).toBe(30000)
        await second.close()
    })

    test('a vendor credit is a negative item, and applying it lowers the bill and the credit', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { vendor, billId, billNo } = await apVendorWithBill(page, {
            amount: '800.00',
            due: AP_DAY.due,
        })
        const memo = uniqueName('AP aging credit')
        const credit = await postVendorCredit(page, {
            vendor: vendor.name,
            account: BILL_EXPENSE_ACCOUNT,
            amount: '250.00',
            memo,
        })
        const billLabel = `Bill ${billNo}`
        const creditLabel = `Vendor credit ${credit.number}`

        await openApAging(page)
        await filterToVendors(page, [vendor.name])
        await openAgingRow(page, vendor.name)
        const before = await reportSnapshot(page)
        expect(agedCents(agingRow(before, billLabel)).total).toBe(80000)
        expect(agedCents(agingRow(before, creditLabel)).total).toBe(-25000)
        expect(agedCents(agingRow(before, vendor.name)).total).toBe(55000)

        // Apply on a second page, where the helper opens the credit by its own search: here
        // the credit's read view stays laid out under the report route, so the helper would
        // skip the search and press through the report. This page keeps the report filtered
        // and opened, and reads the application when its run lands.
        const second = await page.context().newPage()
        await openBooks(second, DESKTOP)
        await applyCreditToBill(second, { memo, billId, amount: '100.00' })
        await second.close()
        const today = await browserToday(page)

        const after = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.rows.some(row => row.label === billLabel && agedCents(row).total === 70000),
            `${billLabel} reads 700.00 after the application`
        )
        expect(agedCents(agingRow(after, billLabel)).total).toBe(70000)
        expect(agedCents(agingRow(after, creditLabel)).total).toBe(-15000)
        expect(agedCents(agingRow(after, vendor.name)).total).toBe(55000)

        await openAgingRow(page, billLabel)
        const lines = rowsUnder(await reportSnapshot(page), billLabel)
        expect(
            lines
                .filter(line => line.label === `${today} · Vendor credit ${credit.number}`)
                .map(line => agedCents(line).total)
        ).toEqual([-10000])
    })

    test('prints the Vendor filter and orders by largest balance', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const small = await apVendorWithBill(page, { amount: '100.00', due: AP_DAY.due })
        const large = await apVendorWithBill(page, { amount: '700.00', due: AP_DAY.due })
        const byName = [small.vendor.name, large.vendor.name].sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        )
        // uniqueName stamps the time, so the vendor made first is first by name; the
        // balance order then differs from the name order.
        expect(byName).toEqual([small.vendor.name, large.vendor.name])

        await openApAging(page)
        await filterToVendors(page, [small.vendor.name, large.vendor.name])
        const header = page.getByTestId('report-header-param-vendors')
        await expect(header).toHaveText(`Vendor: ${small.vendor.name}, ${large.vendor.name}`)
        const filtered = await reportSnapshot(page)
        expect(groups(filtered)).toEqual(byName)

        await chooseBalanceOrder(page, 'balance')
        const byBalance = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.rows[0]?.label === large.vendor.name,
            `${large.vendor.name} (700.00) is the first row under Largest balance`
        )
        expect(groups(byBalance)).toEqual([large.vendor.name, small.vendor.name])

        await page.setViewportSize({ width: 1024, height: 800 })
        const rowId = agingRow(byBalance, large.vendor.name).id
        await expect
            .poll(() => rowTops(page, rowId), {
                message: `${large.vendor.name}'s label and cells are on one line at 1024`,
            })
            .toHaveLength(1)
        await expectTableFits(page)
    })
})
