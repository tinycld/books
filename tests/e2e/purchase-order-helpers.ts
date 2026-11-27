import { expect, type Locator, type Page } from '@playwright/test'
import { billCellTestId } from './bill-helpers'
import { openEntriesList } from './journal-entries-helpers'
import { openNewAction } from './new-menu-helpers'
import { recordIdFromUrl } from './record-key-helpers'
import { pickFromSearchPicker } from './search-picker-helpers'

// Shared steps of the purchase order specs (purchase order spec §3), checkpoint 3. An
// order a spec changes is made by the spec through the form, with a unique memo, and
// reopened through search; its number is read from its title.

// The read view of a saved order: `books/purchase-orders/<key>`, never `…/new`.
export const PURCHASE_ORDER_URL = /\/books\/purchase-orders\/(?!new(?:[?#]|$))[^/?#]+$/
// The form of a saved order: `books/purchase-orders/<key>?edit=1`.
export const PURCHASE_ORDER_EDIT_URL = /\/books\/purchase-orders\/(?!new(?:[?#]|$))[^/?#]+\?edit=1$/
export const NEW_PURCHASE_ORDER_URL = /\/books\/purchase-orders\/new(?:[?#].*)?$/

export type PurchaseOrderTable = 'account_lines' | 'item_lines'

export async function purchaseOrderIdFromUrl(page: Page): Promise<string> {
    return recordIdFromUrl(page, 'purchase-orders')
}

// The Books stack may keep an earlier screen of the same order mounted and hidden.
export function visibleOrderPart(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

// Books must already be open. From the Journal Entries list through the New menu
// (tests/e2e/new-menu-helpers.ts) → Purchase order. A new order's Vendor picker has
// focus (web, every width).
export async function openNewPurchaseOrder(page: Page) {
    await openEntriesList(page)
    await openNewAction(page, 'purchase_order')
    await expect(page).toHaveURL(NEW_PURCHASE_ORDER_URL)
    await expect(visibleOrderPart(page, 'purchase-order-form')).toBeVisible()
    await expect(visibleOrderPart(page, 'purchase-order-title')).toHaveText('New purchase order')
    await expect(page.getByTestId('form-input-vendor')).toBeFocused()
}

export async function pickPurchaseOrderVendor(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-vendor', name)
}

// Each table's rows (cards on a phone) in screen order; each row's id is in its test id.
// The sections are the layer's `<test id>-<table key>` wrappers (DocumentForm.tsx).
export function purchaseOrderLineRows(page: Page, table: PurchaseOrderTable): Locator {
    const section =
        table === 'account_lines' ? 'purchase-order-account-lines' : 'purchase-order-item-lines'
    return visibleOrderPart(page, section).locator(`[data-testid^="form-table-${table}-row-"]`)
}

export async function purchaseOrderLineRowId(
    page: Page,
    table: PurchaseOrderTable,
    index: number
): Promise<string> {
    const testId = await purchaseOrderLineRows(page, table).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no ${table} line ${index + 1}`)
    return testId.slice(`form-table-${table}-row-`.length)
}

// A line cell of the order's form: the bill's core TableField ids.
export function purchaseOrderCell(page: Page, table: PurchaseOrderTable, rowId: string) {
    return (column: string) => page.getByTestId(billCellTestId(table, rowId, column))
}

// The number in a saved order's title, "Purchase order <n>".
export async function purchaseOrderNumberOf(page: Page): Promise<string> {
    const title = visibleOrderPart(page, 'purchase-order-title')
    await expect(title).toHaveText(/^Purchase order \d+$/)
    const number = /^Purchase order (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the purchase order title has no number')
    return number
}

// An order's search option title: "Purchase order <n> · <Vendor>" (server/search.go).
const ORDER_OPTION = /^Purchase order \d+ · \S/

// Core's search palette from the keys: `/`, the term, the arrow keys to the one order
// option, Enter. The focus must not be in a picker trigger, which takes `/` as a typed
// letter. Leaves the page on the order's route without waiting for it to load, for a
// test whose load is meant to fail.
export async function searchToPurchaseOrder(page: Page, term: string) {
    await page.keyboard.press('/')
    // The palette focuses its input a frame after it shows; keys typed before that frame
    // are lost.
    const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
    await expect(input).toBeFocused()
    const searched = page.waitForResponse(
        r =>
            r.url().includes('/api/search') &&
            r.status() === 200 &&
            new URL(r.url()).searchParams.get('q') === term
    )
    await page.keyboard.type(term)
    await searched
    await expect(page.getByRole('option').filter({ hasText: ORDER_OPTION })).toHaveCount(1)
    const selected = page.getByRole('option', { selected: true })
    for (let step = 0; step < 10; step++) {
        if (ORDER_OPTION.test(await selected.innerText())) break
        await page.keyboard.press('ArrowDown')
    }
    await expect(selected).toHaveText(ORDER_OPTION)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/books\/purchase-orders\/(?!new(?:[?#]|$))[^/?#]+/)
}

// Reopens an order through the search palette and waits for its visible form or read
// view.
export async function openPurchaseOrderBySearch(page: Page, term: string) {
    await searchToPurchaseOrder(page, term)
    await expect(
        page
            .getByTestId('purchase-order-form')
            .or(page.getByTestId('purchase-order-read-only'))
            .filter({ visible: true })
    ).toBeVisible()
}

export type MadePurchaseOrder = { id: string; number: string }

export type PurchaseOrderInput = {
    vendor: string
    // Account line 1's amount. Without one, account line 1 is removed and the order holds
    // product lines only.
    amount?: string
    // Account line 1's description.
    accountDescription?: string
    memo: string
    message?: string
    // One product line: a seeded product with purchasing on, and its quantity.
    product?: { name: string; quantity: string }
    // More product lines after `product`, in this order.
    products?: { name: string; quantity: string }[]
    // More account lines after line 1: the account's "<number> <name>" label and amount.
    accounts?: { account: string; amount: string }[]
}

async function removeLine(page: Page, table: PurchaseOrderTable, rowId: string) {
    const count = await purchaseOrderLineRows(page, table).count()
    await visibleOrderPart(page, `form-table-${table}-menu-${rowId}`).click()
    await page.getByTestId(`form-table-${table}-menu-remove`).click()
    await expect(purchaseOrderLineRows(page, table)).toHaveCount(count - 1)
}

async function addAccountLines(page: Page, lines: readonly { account: string; amount: string }[]) {
    for (const extra of lines) {
        const count = await purchaseOrderLineRows(page, 'account_lines').count()
        await visibleOrderPart(page, 'form-table-account_lines-add').click()
        await expect(purchaseOrderLineRows(page, 'account_lines')).toHaveCount(count + 1)
        const row = await purchaseOrderLineRowId(page, 'account_lines', count)
        await pickFromSearchPicker(
            page,
            billCellTestId('account_lines', row, 'account'),
            extra.account
        )
        await purchaseOrderCell(page, 'account_lines', row)('amount').fill(extra.amount)
    }
}

async function addProductLines(page: Page, lines: readonly { name: string; quantity: string }[]) {
    for (const product of lines) {
        const count = await purchaseOrderLineRows(page, 'item_lines').count()
        await visibleOrderPart(page, 'form-table-item_lines-add').click()
        await expect(purchaseOrderLineRows(page, 'item_lines')).toHaveCount(count + 1)
        const row = await purchaseOrderLineRowId(page, 'item_lines', count)
        await pickFromSearchPicker(page, billCellTestId('item_lines', row, 'product'), product.name)
        await purchaseOrderCell(page, 'item_lines', row)('quantity').fill(product.quantity)
    }
}

// Books must already be open. Makes an open order through the form (clicks allowed):
// the vendor, whose default expense account fills account line 1, that line's amount and
// description (or no account line 1), more account lines, the product lines, message and
// the memo; Save & close. Ends on the order's read view.
export async function makePurchaseOrder(
    page: Page,
    order: PurchaseOrderInput
): Promise<MadePurchaseOrder> {
    await openNewPurchaseOrder(page)
    await pickPurchaseOrderVendor(page, order.vendor)
    const line = await purchaseOrderLineRowId(page, 'account_lines', 0)
    const first = purchaseOrderCell(page, 'account_lines', line)
    if (order.amount === undefined) {
        await removeLine(page, 'account_lines', line)
    } else {
        if (order.accountDescription !== undefined) {
            await first('description').fill(order.accountDescription)
        }
        await first('amount').fill(order.amount)
    }
    await addAccountLines(page, order.accounts ?? [])
    const products = [...(order.product ? [order.product] : []), ...(order.products ?? [])]
    await addProductLines(page, products)
    if (order.message !== undefined) {
        await page.getByTestId('form-input-message').fill(order.message)
    }
    await page.getByTestId('form-input-memo').fill(order.memo)
    await visibleOrderPart(page, 'purchase-order-save-close').click()
    await expect(page).toHaveURL(PURCHASE_ORDER_URL)
    await expect(visibleOrderPart(page, 'purchase-order-read-only')).toBeVisible()
    const number = await purchaseOrderNumberOf(page)
    return { id: await purchaseOrderIdFromUrl(page), number }
}

// Copy to bill (purchase order spec §3.7, §3.8), checkpoint 4. The dialog is a core
// Dialog, a Sheet with no dialog role on a phone: it is found by its test id.

// The bill form started from an order: `books/bills/new?purchase_order=<id>`.
export const BILL_FROM_ORDER_URL = /\/books\/bills\/new\?purchase_order=[^&#]+$/

export function copyToBillDialog(page: Page): Locator {
    return visibleOrderPart(page, 'copy-to-bill-dialog')
}

// The dialog's rows in screen order; each row's order line id is in its test id.
export function copyToBillRowsOf(page: Page): Locator {
    return copyToBillDialog(page).locator('[data-testid^="copy-to-bill-row-"]')
}

// The dialog's row of the line named `name` (a product's name, or an account's
// "<number> <name>").
export function copyToBillRowNamed(page: Page, name: string): Locator {
    return copyToBillRowsOf(page).filter({ has: page.getByText(name, { exact: true }) })
}

export async function copyToBillLineId(row: Locator): Promise<string> {
    const testId = await row.getAttribute('data-testid')
    if (!testId) throw new Error('a Copy to bill row has no test id')
    return testId.slice('copy-to-bill-row-'.length)
}

// A part of a dialog row by its order line id: its tick box, its Qty or Amount to bill,
// or the hint under that input.
export function copyToBillPart(page: Page, part: 'tick' | 'input' | 'hint', lineId: string) {
    return page.getByTestId(`copy-to-bill-${part}-${lineId}`).filter({ visible: true })
}

// The order's read view must show, on an open order with an open line. Copy to bill
// from its button; waits for the dialog and for the focus in its first row's input.
export async function openCopyToBill(page: Page) {
    await visibleOrderPart(page, 'purchase-order-read-copy-to-bill').click()
    await expect(copyToBillDialog(page)).toBeVisible()
    const first = await copyToBillLineId(copyToBillRowsOf(page).first())
    await expect(copyToBillPart(page, 'input', first)).toBeFocused()
}

// The visible bill form (an order's read view can stay mounted under it).
export function visibleBillForm(page: Page): Locator {
    return visibleOrderPart(page, 'bill-form')
}

// The dialog must be open. Create bill by the dialog's submit key (⌘↵); waits for the
// bill form that shows "From purchase order <number>".
export async function submitCopyToBill(page: Page, number: string) {
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(copyToBillDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(BILL_FROM_ORDER_URL)
    await expect(visibleBillForm(page)).toBeVisible()
    await expect(visibleOrderPart(page, 'bill-from-purchase-order')).toHaveText(
        `From purchase order ${number}`
    )
}

// The order's read view must show, on an open order with an open line. Copies every row
// at its start value to a new bill; ends on the bill form.
export async function copyOrderToBill(page: Page, number: string) {
    await openCopyToBill(page)
    await submitCopyToBill(page, number)
}

// Whether a control cannot be used: it is not drawn, is disabled, or is no Tab stop (a
// picker drawn as plain text).
export async function isLocked(target: Locator): Promise<boolean> {
    if ((await target.count()) === 0) return true
    return target.first().evaluate(el => {
        const disabled = (el as HTMLButtonElement).disabled === true
        const ariaDisabled = el.getAttribute('aria-disabled') === 'true'
        return disabled || ariaDisabled || (el as HTMLElement).tabIndex < 0
    })
}
