import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { VENDOR_IDS, VENDORS } from '../../tinycld/books/lib/vendor-form-fixture'
import { DESKTOP, PHONE } from './account-register-helpers'
import { billCellTestId } from './bill-helpers'
import { refuseBatchWrite } from './document-batch-helpers'
import { uniqueMemo } from './invoice-helpers'
import { settleFrames } from './journal-entries-helpers'
import { purchaseTabUrl } from './purchase-lists-helpers'
import {
    NEW_PURCHASE_ORDER_URL,
    openNewPurchaseOrder,
    openPurchaseOrderBySearch,
    PURCHASE_ORDER_EDIT_URL,
    PURCHASE_ORDER_URL,
    pickPurchaseOrderVendor,
    purchaseOrderCell,
    purchaseOrderLineRowId,
    purchaseOrderLineRows,
    purchaseOrderNumberOf,
    searchToPurchaseOrder,
    visibleOrderPart,
} from './purchase-order-helpers'
import { pickFromSearchPicker } from './search-picker-helpers'

// The purchase order form and read view (purchase order spec §3.3–§3.9), checkpoint 3:
// the refusals, the conflict notice, the load error, the leave guard, Delete and the
// states, and the phone form and read view. Every order a test changes is made by the
// test with a unique memo and reopened through search; the seeded orders 1001 and 1004
// are only read. A refusal or a load failure is forced with route.fulfill, as the bill
// and estimate specs do, so it covers the client only (the Go tests cover the server's
// own refusals).
//
// Not driven here, and why (cp3 brief, E2E budget): the reader's read view and the
// reader at /new (role-bound: unit cases of documentScreenState and orderReadActions),
// loading (transient; a unit case), offline (the bars' shared useWritesAvailable; a unit
// case of documentReadActionDisabled), the "Bill lines" setting (its specs run in the
// serial purchase-lines-setting project; unit: tests/purchase-order-tables.test.ts), and
// the closed-edit notice (no in-app path to `?edit=1` on a closed order: unit cases of
// documentScreenState and gate 2's built URL).

function vendorName(id: string) {
    const row = VENDORS.find(vendor => vendor.id === id)
    if (!row) throw new Error(`no vendor ${id} in the fixture`)
    return row.display_name
}

function productOf(id: string) {
    const row = PRODUCTS.find(product => product.id === id)
    if (!row?.vendor_part_no) throw new Error(`no vendor part no. for ${id}`)
    return { name: row.name, partNo: row.vendor_part_no }
}

const OFFICE_SUPPLY = vendorName(VENDOR_IDS.officeSupply)
const ACCESS_POINT = productOf(PRODUCT_IDS.accessPoint)

const LINE_REQUIRED = 'Add at least one account or product line'
const CONFLICT =
    'This purchase order changed after you opened it. Load the current purchase order, then review it before you save.'
const LOAD_FAILED = 'Books could not load this purchase order.'
const NOT_FOUND = 'This purchase order does not exist'
// A message-only refusal (forced: it covers the client only).
const SERVER_REFUSAL = 'Books could not number this purchase order. Try again.'
// The seeded orders, read only (lib/purchase-orders-fixture.ts).
const CLOSED_ORDER_MEMO = 'Backup licences and two access points for the annex'
const OPEN_ORDER_MEMO = 'Back-office network refresh, phase 1'
const TABLET = { width: 768, height: 1024 }

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

function readView(page: Page): Locator {
    return visibleOrderPart(page, 'purchase-order-read-only')
}

function readLines(page: Page): Locator {
    return readView(page).locator('[data-testid^="purchase-order-read-line-"]')
}

// Whether the page scrolls sideways.
function pageScrollsSideways(page: Page): Promise<boolean> {
    return page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
}

// The spread of the tops of the elements: 0 when they sit on one row.
async function topSpread(buttons: Locator[]): Promise<number> {
    const tops = await Promise.all(buttons.map(async b => (await b.boundingBox())?.y ?? Number.NaN))
    return Math.max(...tops) - Math.min(...tops)
}

test.describe('purchase-orders: form and read view', () => {
    test('refusals, delete and states', async ({ context }) => {
        const memo = uniqueMemo('Purchase order refusals')
        const page = await context.newPage()
        await openBooks(page)
        await page.setViewportSize(DESKTOP)
        await openNewPurchaseOrder(page)
        // An order that is not stored has no status, so its title has no badge (spec §3.3).
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveCount(0)

        // No vendor and no line with an amount: the inline and the summary texts.
        await visibleOrderPart(page, 'purchase-order-save').click()
        await expect(page.getByTestId('form-field-vendor-error')).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-error-summary')).toContainText(
            LINE_REQUIRED
        )
        await expect(page).toHaveURL(NEW_PURCHASE_ORDER_URL)

        await pickPurchaseOrderVendor(page, OFFICE_SUPPLY)
        const line = await purchaseOrderLineRowId(page, 'account_lines', 0)
        await purchaseOrderCell(page, 'account_lines', line)('amount').fill('50.00')
        await page.getByTestId('form-input-memo').fill(memo)

        // A forced server refusal shows in the summary; nothing is saved.
        await refuseBatchWrite(page, 'books_purchase_orders', 'POST', {
            message: SERVER_REFUSAL,
            data: {},
        })
        await visibleOrderPart(page, 'purchase-order-save').click()
        await expect(visibleOrderPart(page, 'purchase-order-error-summary')).toContainText(
            SERVER_REFUSAL
        )
        await expect(page).toHaveURL(NEW_PURCHASE_ORDER_URL)
        await page.unrouteAll({ behavior: 'wait' })

        await visibleOrderPart(page, 'purchase-order-save').click()
        await expect(page).toHaveURL(PURCHASE_ORDER_EDIT_URL)
        const number = await purchaseOrderNumberOf(page)
        // The first Save creates the order as Open: the badge shows from then on.
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Open')

        // A forced stale-revision refusal (the 409 the server answers a stale save, inside
        // the batch): the layer's notice and its Load button; what was typed stays.
        const memoInput = page.getByTestId('form-input-memo')
        await memoInput.fill(`${memo} edited`)
        await refuseBatchWrite(page, 'books_purchase_orders', 'PATCH', {
            status: 409,
            message: 'The record changed.',
            data: {},
        })
        await visibleOrderPart(page, 'purchase-order-save').click()
        const conflict = visibleOrderPart(page, 'purchase-order-conflict')
        await expect(conflict).toContainText(CONFLICT)
        await expect(memoInput).toHaveValue(`${memo} edited`)
        await page.unrouteAll({ behavior: 'wait' })
        await conflict.getByRole('button', { name: 'Load the current purchase order' }).click()
        await expect(conflict).toHaveCount(0)
        await expect(memoInput).toHaveValue(memo)

        // A dirty Cancel asks first; leaving discards the edit.
        await memoInput.fill(`${memo} unsaved`)
        await visibleOrderPart(page, 'purchase-order-cancel').click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expect(readView(page)).toBeVisible()
        await expect(readView(page)).not.toContainText(`${memo} unsaved`)

        // An open order offers no Send… until the kind can be sent (checkpoint 5): an action
        // without a handler is not drawn. Edit shows first, so the bar has drawn.
        await expect(visibleOrderPart(page, 'purchase-order-read-edit')).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-read-send')).toHaveCount(0)

        // The route's number key is read again after a reload, and that read fails: the
        // load error and Retry show; Retry after the route is gone shows the order.
        await expect(page).toHaveURL(new RegExp(`/books/purchase-orders/${number}$`))
        await page.route('**/api/collections/books_purchase_orders/records*', route => {
            const filter = new URL(route.request().url()).searchParams.get('filter') ?? ''
            if (!filter.includes('sequence')) return route.fallback()
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: 'Read failed.', data: {} }),
            })
        })
        await page.reload()
        await expect(visibleOrderPart(page, 'purchase-order-error')).toContainText(LOAD_FAILED)
        await expect(readView(page)).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })
        await visibleOrderPart(page, 'purchase-order-retry').click()
        await expect(readView(page)).toBeVisible()
        await expect(readView(page)).toContainText(memo)

        // The order's own read fails on a fresh page (pbtsdb's grace window would serve
        // the held row on this one): Retry loads it.
        const second = await context.newPage()
        await second.route('**/api/collections/books_purchase_orders/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(second)
        await second.setViewportSize(DESKTOP)
        await searchToPurchaseOrder(second, memo)
        await expect(visibleOrderPart(second, 'purchase-order-error')).toContainText(LOAD_FAILED)
        await expect(readView(second)).toHaveCount(0)
        await second.unrouteAll({ behavior: 'wait' })
        await visibleOrderPart(second, 'purchase-order-retry').click()
        await expect(readView(second)).toBeVisible()
        await expect(readView(second)).toContainText(memo)
        await second.close()

        // More → Delete purchase order confirms with the number and leaves the order.
        await visibleOrderPart(page, 'purchase-order-read-more').click()
        await page.getByTestId('purchase-order-read-delete').click()
        const dialog = page.getByTestId('purchase-order-delete-dialog')
        await expect(dialog).toContainText(`Delete purchase order ${number}?`)
        await expect(dialog).toContainText("This can't be undone.")
        await page.getByTestId('purchase-order-delete-confirm').click()
        await expect(page).toHaveURL(purchaseTabUrl('all'))
        await expect(visibleOrderPart(page, 'purchases-list')).toBeVisible()

        // Back to the deleted order's route: it does not exist.
        await page.goBack()
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expect(visibleOrderPart(page, 'purchase-order-not-found')).toContainText(NOT_FOUND)

        // The seeded closed order 1001, only read: no Edit, and E does nothing.
        await openPurchaseOrderBySearch(page, CLOSED_ORDER_MEMO)
        await expect(visibleOrderPart(page, 'purchase-order-title')).toHaveText(
            'Purchase order 1001'
        )
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Closed')
        await expect(visibleOrderPart(page, 'purchase-order-read-pdf')).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-read-edit')).toHaveCount(0)
        await page.keyboard.press('e')
        await settleFrames(page)
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expect(visibleOrderPart(page, 'purchase-order-form')).toHaveCount(0)
        await expect(readView(page)).toBeVisible()
    })

    test('the phone form and read view at 390', async ({ page }) => {
        const memo = uniqueMemo('Purchase order phone')
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await openNewPurchaseOrder(page)

        // The phone bar: Cancel · Save & close · More, on one row.
        const bar = visibleOrderPart(page, 'purchase-order-actions')
        const buttons = [
            'purchase-order-cancel',
            'purchase-order-save-close',
            'purchase-order-more',
        ].map(id => bar.getByTestId(id))
        for (const button of buttons) await expect(button).toBeVisible()
        await expect.poll(() => topSpread(buttons)).toBeLessThanOrEqual(2)
        await expect(bar.getByTestId('purchase-order-save')).toHaveCount(0)
        await expect(bar.getByTestId('purchase-order-save-new')).toHaveCount(0)

        // A product line is a card with the product's Vendor part no. under its name.
        // The vendor's default expense account fills account line 1 (spec §3.3), and a line
        // with an account needs an amount, so type one before the save.
        await pickPurchaseOrderVendor(page, OFFICE_SUPPLY)
        await expect(purchaseOrderLineRows(page, 'account_lines')).toHaveCount(1)
        const accountLine = await purchaseOrderLineRowId(page, 'account_lines', 0)
        await purchaseOrderCell(page, 'account_lines', accountLine)('amount').fill('15.00')
        await visibleOrderPart(page, 'form-table-item_lines-add').click()
        await expect(purchaseOrderLineRows(page, 'item_lines')).toHaveCount(1)
        const row = await purchaseOrderLineRowId(page, 'item_lines', 0)
        await pickFromSearchPicker(
            page,
            billCellTestId('item_lines', row, 'product'),
            ACCESS_POINT.name
        )
        await purchaseOrderCell(page, 'item_lines', row)('quantity').fill('2')
        await expect(purchaseOrderLineRows(page, 'item_lines').first()).toContainText(
            ACCESS_POINT.partNo
        )
        await page.getByTestId('form-input-memo').fill(memo)

        // More holds Save, Save & new and Download PDF; Save keeps the form.
        await bar.getByTestId('purchase-order-more').click()
        await expect(page.getByTestId('purchase-order-save-new')).toBeVisible()
        await expect(page.getByTestId('purchase-order-download-pdf')).toBeVisible()
        await page.getByTestId('purchase-order-save').click()
        await expect(page).toHaveURL(PURCHASE_ORDER_EDIT_URL)
        await purchaseOrderNumberOf(page)

        // On the saved order More holds Delete purchase order too.
        await bar.getByTestId('purchase-order-more').click()
        for (const id of [
            'purchase-order-save',
            'purchase-order-save-new',
            'purchase-order-download-pdf',
            'purchase-order-delete',
        ]) {
            await expect(page.getByTestId(id)).toBeVisible()
        }
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('purchase-order-delete')).toHaveCount(0)
        await bar.getByTestId('purchase-order-save-close').click()
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expect(readView(page)).toBeVisible()

        // The read view's lines are cards; the totals sit above the notes.
        const card = readLines(page).filter({ hasText: ACCESS_POINT.name })
        await expect(card).toContainText(/Ordered 2 · Received 0 · Open 2/)
        await expect(card).toContainText(ACCESS_POINT.partNo)
        await expect
            .poll(async () => {
                const totals = await readView(page)
                    .getByTestId('purchase-order-totals')
                    .boundingBox()
                const notes = await readView(page)
                    .getByTestId('purchase-order-detail-memo')
                    .boundingBox()
                if (!totals || !notes) return Number.NaN
                return notes.y - (totals.y + totals.height)
            })
            .toBeGreaterThanOrEqual(0)
        await expect.poll(() => pageScrollsSideways(page)).toBe(false)

        // At 768 the seeded open order 1004 (only read) draws its lines as cards too.
        await page.setViewportSize(TABLET)
        await openPurchaseOrderBySearch(page, OPEN_ORDER_MEMO)
        await expect(visibleOrderPart(page, 'purchase-order-title')).toHaveText(
            'Purchase order 1004'
        )
        const seeded = readLines(page).filter({ hasText: ACCESS_POINT.name })
        await expect(seeded).toContainText(/Ordered 6 · Received 0 · Open 6/)
        await expect(seeded).toContainText(ACCESS_POINT.partNo)
        await expect.poll(() => pageScrollsSideways(page)).toBe(false)
    })
})
