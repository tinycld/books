import { expect, type Page, test } from '@playwright/test'
import { OPEN_PURCHASE_ORDERS_EMPTY_TEXT } from '~/tinycld/books/lib/open-purchase-orders-fixture'
import { PRODUCT_IDS } from '~/tinycld/books/lib/products-services-fixture'
import { PURCHASE_ORDER_PRODUCTS } from '~/tinycld/books/lib/purchase-orders-fixture'
import { DESKTOP, PHONE } from './account-register-helpers'
import { filterToVendors } from './ap-aging-helpers'
import { postBill } from './bill-helpers'
import {
    choosePeriod,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { centsOf } from './customer-balance-helpers'
import { runLanded } from './expenses-by-vendor-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import { tabTo } from './keyboard-helpers'
import {
    expectOpenOrderPhoneLines,
    openOpenPurchaseOrders,
    openOpenPurchaseOrdersFromVendors,
} from './open-purchase-orders-helpers'
import { vendorWithBills } from './pay-bills-helpers'
import {
    copyToBillLineId,
    copyToBillPart,
    copyToBillRowNamed,
    makePurchaseOrder,
    openCopyToBill,
    PURCHASE_ORDER_URL,
    submitCopyToBill,
    visibleOrderPart,
} from './purchase-order-helpers'
import { escapeRegExp, openBooks } from './record-form-helpers'
import { expectRecordUrl } from './record-key-helpers'
import { openVendorsList } from './vendor-form-helpers'

// The Open Purchase Orders report (purchase-orders spec §3.10, checkpoint 6), opened from
// its two links. The order is made by the spec through the form, for a vendor the spec
// makes (so the vendor group holds this order alone), and 4 of its 10 are copied to a bill
// that posts on today's date. The labels, sums and params are the Go report tests'
// (server/report_purchase_orders_test.go); this test proves the screen draws them.
//
// Phone run: the phone path is other code (the report's `display.layouts` mobile
// arrangement, core's phone row layout).

// $121.40 each (lib/purchase-orders-fixture.ts).
function productName(id: string): string {
    const row = PURCHASE_ORDER_PRODUCTS.find(product => product.id === id)
    if (!row) throw new Error(`no purchase order product ${id}`)
    return row.name
}
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const RENT = '6100 Rent'

// 6 open of 10 at $121.40, and the $50.00 rent line not billed.
const PRODUCT_OPEN_CENTS = 72_840
const ACCOUNT_OPEN_CENTS = 5_000

// A line label "<product or account> · <description>", or the name alone with no
// description.
function lineLabel(name: string): RegExp {
    return new RegExp(`^${escapeRegExp(name)}( · .*)?$`)
}

type Row = ReportSnapshot['rows'][number]

// A quantity cell as a number; null when it is blank.
function quantityOf(row: Row, column: 'ordered' | 'received' | 'open'): number | null {
    const text = (row.cells[column] ?? '').replace(/,/g, '')
    return text === '' ? null : Number(text)
}

function figuresOf(row: Row) {
    return {
        ordered: quantityOf(row, 'ordered'),
        received: quantityOf(row, 'received'),
        open: quantityOf(row, 'open'),
        openAmount: centsOf(row.cells.open_amount ?? ''),
    }
}

// The rows of the vendor's group, its order's group, the two lines and the Total, in one
// snapshot.
function rowsOf(snapshot: ReportSnapshot, vendor: string, orderLabel: string) {
    const vendorRow = snapshot.rows.find(row => row.kind === 'group' && row.label === vendor)
    const orderIndex = snapshot.rows.findIndex(
        row => row.kind === 'group' && row.label === orderLabel
    )
    const after = orderIndex < 0 ? [] : snapshot.rows.slice(orderIndex + 1)
    const end = after.findIndex(row => row.kind !== 'detail')
    const details = end < 0 ? after : after.slice(0, end)
    return {
        vendorRow,
        orderRow: orderIndex < 0 ? undefined : snapshot.rows[orderIndex],
        product: details.find(row => lineLabel(ACCESS_POINT).test(row.label)),
        account: details.find(row => lineLabel(RENT).test(row.label)),
        details,
        total: snapshot.rows.find(row => row.kind === 'total'),
    }
}

// Waits for the run of the Period choice, then for its rows: core keeps the previous
// run's rows on screen until the new run lands.
async function choosePeriodAndLand(
    page: Page,
    choice: Parameters<typeof choosePeriod>[1],
    matches: (period: unknown) => boolean
): Promise<void> {
    const landed = runLanded(page, params => matches(params.period))
    await choosePeriod(page, choice)
    await landed
}

test.describe('purchase-orders: open purchase orders report', () => {
    test('the report lists what is open, by vendor and order, on desktop and on a phone', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { vendor } = await vendorWithBills(page, { bills: [] })
        const memo = uniqueMemo('Open purchase orders')
        const order = await makePurchaseOrder(page, {
            vendor: vendor.name,
            accounts: [{ account: RENT, amount: '50.00' }],
            product: { name: ACCESS_POINT, quantity: '10' },
            memo,
        })
        const today = await localToday(page)

        // Copy 4 of the 10 to a bill, with the rent line left on the order, and post it.
        await openCopyToBill(page)
        const productLine = await copyToBillLineId(copyToBillRowNamed(page, ACCESS_POINT))
        const rentLine = await copyToBillLineId(copyToBillRowNamed(page, RENT))
        await expect(copyToBillPart(page, 'input', productLine)).toBeFocused()
        await page.keyboard.type('4')
        await expect(copyToBillPart(page, 'input', productLine)).toHaveValue('4')
        const rentTick = copyToBillPart(page, 'tick', rentLine)
        await tabTo(page, rentTick, { max: 6 })
        await page.keyboard.press('Space')
        await expect(rentTick).toHaveAttribute('aria-checked', 'false')
        await submitCopyToBill(page, order.number)
        await postBill(page)

        // From the Purchase orders tab's toolbar, narrowed to the vendor.
        await openOpenPurchaseOrders(page)
        await filterToVendors(page, [vendor.name])
        const orderLabel = `${order.number} · ${today}`
        const shown = await snapshotWhen(
            page,
            reportSnapshot,
            s => {
                const rows = rowsOf(s, vendor.name, orderLabel)
                return rows.product !== undefined && rows.account !== undefined
            },
            `the order ${orderLabel} of ${vendor.name} with its two open lines`
        )
        const rows = rowsOf(shown, vendor.name, orderLabel)
        if (!rows.vendorRow || !rows.orderRow || !rows.product || !rows.account || !rows.total) {
            throw new Error('the report has no vendor, order, line or Total row')
        }
        const groupFigures = {
            ordered: 10,
            received: 4,
            open: 6,
            openAmount: PRODUCT_OPEN_CENTS + ACCOUNT_OPEN_CENTS,
        }
        expect(figuresOf(rows.vendorRow), 'the vendor group').toEqual(groupFigures)
        expect(figuresOf(rows.orderRow), 'the order group').toEqual(groupFigures)
        expect(rows.details).toHaveLength(2)
        expect(figuresOf(rows.product), 'the product line').toEqual({
            ordered: 10,
            received: 4,
            open: 6,
            openAmount: PRODUCT_OPEN_CENTS,
        })
        expect(figuresOf(rows.account), 'the account line has blank quantities').toEqual({
            ordered: null,
            received: null,
            open: null,
            openAmount: ACCOUNT_OPEN_CENTS,
        })
        const lineSum = rows.details.reduce((sum, row) => sum + figuresOf(row).openAmount, 0)
        expect(centsOf(rows.total.cells.open_amount ?? ''), 'the Total row').toBe(lineSum)

        // A line opens the order's read view (the detail surface).
        await page.getByTestId(`report-row-${rows.product.id}`).click()
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expectRecordUrl(page, 'purchase-orders', order.id)
        await expect(visibleOrderPart(page, 'purchase-order-read-only')).toBeVisible()
        await page.goBack()
        await expect(page.getByTestId('report-table').filter({ visible: true })).toBeVisible()

        // A Period before the order's date: the report's own empty text.
        await choosePeriodAndLand(page, { from: '2020-01-01', to: '2020-01-31' }, period => {
            const range = period as { from?: string; to?: string } | undefined
            return range?.from === '2020-01-01' && range?.to === '2020-01-31'
        })
        await expect(page.getByTestId('report-empty').filter({ visible: true })).toContainText(
            OPEN_PURCHASE_ORDERS_EMPTY_TEXT
        )
        // All dates again: the order is back.
        await choosePeriodAndLand(page, { preset: 'allDates' }, period => {
            const range = period as { from?: string; to?: string } | undefined
            return range?.from !== '2020-01-01'
        })
        await snapshotWhen(
            page,
            reportSnapshot,
            s => rowsOf(s, vendor.name, orderLabel).product !== undefined,
            `the order ${orderLabel} after All dates`
        )

        // From the Vendors list's Reports menu: the same report.
        await openVendorsList(page)
        await openOpenPurchaseOrdersFromVendors(page)
        await filterToVendors(page, [vendor.name])

        // At 390 px: the product line on two lines, the account line on one.
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('report-table').filter({ visible: true })).toHaveAttribute(
            'data-layout',
            'mobile'
        )
        const phone = await snapshotWhen(
            page,
            reportSnapshot,
            s => {
                const r = rowsOf(s, vendor.name, orderLabel)
                return r.product !== undefined && r.account !== undefined
            },
            `the two lines of ${orderLabel} at 390 px`
        )
        const phoneRows = rowsOf(phone, vendor.name, orderLabel)
        if (!phoneRows.product || !phoneRows.account) throw new Error('no line rows at 390 px')
        await expectOpenOrderPhoneLines(page, {
            product: phoneRows.product.id,
            account: phoneRows.account.id,
        })
    })
})
