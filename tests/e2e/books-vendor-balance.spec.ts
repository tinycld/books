import { expect, type Page, test } from '@playwright/test'
import {
    VENDOR_BALANCE_EMPTY_DAY,
    VENDOR_BALANCE_TITLE,
} from '~/tinycld/books/lib/vendor-balance-fixture'
import { DESKTOP } from './account-register-helpers'
import { apVendorWithBill, filterToVendors } from './ap-aging-helpers'
import { BILL_URL } from './bill-helpers'
import {
    browserToday,
    chooseAsOf,
    dayWords,
    expectedHeading,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { centsOf, chooseBalanceRows } from './customer-balance-helpers'
import { localDay } from './pay-bills-helpers'
import { openBooks } from './record-form-helpers'
import { openVendorBalance, totalCents, vendorRowCents } from './vendor-balance-helpers'
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
})
