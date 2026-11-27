import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { PRODUCT_IDS } from '../../tinycld/books/lib/products-services-fixture'
import { PURCHASE_ORDER_PRODUCTS } from '../../tinycld/books/lib/purchase-orders-fixture'
import { VENDOR_IDS, VENDORS } from '../../tinycld/books/lib/vendor-form-fixture'
import { DESKTOP, PHONE } from './account-register-helpers'
import {
    accountLineRows,
    BILL_URL,
    billCellTestId,
    billIdFromUrl,
    billLineRowId,
    billNumberOf,
    itemLineRows,
    postBill,
} from './bill-helpers'
import { dashboardScreen, openDashboard } from './dashboard-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import { settleFrames } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'
import {
    BILL_FROM_ORDER_URL,
    copyToBillDialog,
    copyToBillLineId,
    copyToBillPart,
    copyToBillRowNamed,
    copyToBillRowsOf,
    isLocked,
    makePurchaseOrder,
    openCopyToBill,
    openPurchaseOrderBySearch,
    PURCHASE_ORDER_EDIT_URL,
    PURCHASE_ORDER_URL,
    purchaseOrderCell,
    purchaseOrderLineRowId,
    purchaseOrderLineRows,
    submitCopyToBill,
    visibleBillForm,
    visibleOrderPart,
} from './purchase-order-helpers'
import { expectRecordUrl } from './record-key-helpers'

// Copy to bill (purchase order spec §3.2, §3.6–§3.8, §3.12), checkpoint 4: the dialog
// (its rows, tick boxes, inputs, hint, total and keys), the bill form started from the
// order (the "From purchase order" link, the read-only Vendor and the read-only pickers of
// its linked lines), the bill's read view stamp, the order's Bills section, the draft-bill
// note, and the order form's linked lines. Every order and bill is made by the spec
// through the forms with a unique memo; no seeded order is billed or changed, and numbers
// are read from the titles. Every bill posts on today's date.
//
// Not driven here, and why (cp4 brief, E2E budget): the cannot-start notice (it needs a
// closed order under an open bill form, which needs Close: checkpoint 5's test 2; here
// unit cases of useDocumentScreen(BILL_DOCUMENT) and gate 2's built URL), the zod rules of
// the dialog (unit: tests/copy-to-bill.test.ts), the dialog's load error (transient, the
// hook's unit cases), and the "Bill lines" setting (the setting's specs run in the serial
// purchase-lines-setting project; the bill's table rule is unit-tested).

function vendorOf(id: string) {
    const row = VENDORS.find(vendor => vendor.id === id)
    if (!row?.address?.line1) throw new Error(`no address for ${id}`)
    return { name: row.display_name, line1: row.address.line1 }
}

// A seeded product with a Vendor part no. (spec §3.4).
function productOf(id: string) {
    const row = PURCHASE_ORDER_PRODUCTS.find(product => product.id === id)
    if (!row?.vendor_part_no) throw new Error(`no vendor part no. for ${id}`)
    return {
        name: row.name,
        partNo: row.vendor_part_no,
        description: row.purchase_description,
    }
}

// Office Supply World: Net 15, default expense account 6210 Design Tools
// (lib/vendor-form-fixture.ts).
const OFFICE_SUPPLY = vendorOf(VENDOR_IDS.officeSupply)
const OFFICE_SUPPLY_ACCOUNT = '6210 Design Tools'
const RENT = '6100 Rent'
// $121.40 each.
const ACCESS_POINT = productOf(PRODUCT_IDS.accessPoint)
// $3.10 each.
const PATCH_CABLE = productOf(PRODUCT_IDS.patchCable)

function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(cents / 100)
}

// A day `days` after an ISO day.
function addDays(day: string, days: number): string {
    const date = new Date(`${day}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function readView(page: Page): Locator {
    return visibleOrderPart(page, 'purchase-order-read-only')
}

// A line of the order's read view, found by the text it holds.
function readLine(page: Page, text: string): Locator {
    return readView(page)
        .locator('[data-testid^="purchase-order-read-line-"]')
        .filter({ hasText: text })
}

// The visible bill form's line cell.
function billCell(page: Page, table: 'account_lines' | 'item_lines', rowId: string) {
    return (column: string) =>
        visibleBillForm(page).getByTestId(billCellTestId(table, rowId, column))
}

// The bill form's product line that names `name`.
function billItemRowNamed(page: Page, name: string): Locator {
    return itemLineRows(page).filter({ has: page.getByText(name, { exact: true }) })
}

async function billRowIdOf(row: Locator, table: 'account_lines' | 'item_lines') {
    const testId = await row.getAttribute('data-testid')
    if (!testId) throw new Error(`a ${table} row has no test id`)
    return testId.slice(`form-table-${table}-row-`.length)
}

// From the bill's form or read view to the order its "From purchase order" link names.
async function openOrderFromBill(page: Page, orderId: string) {
    await visibleOrderPart(page, 'bill-from-purchase-order').click()
    await expect(page).toHaveURL(PURCHASE_ORDER_URL)
    await expectRecordUrl(page, 'purchase-orders', orderId)
    await expect(readView(page)).toBeVisible()
}

// A row of the order's Bills section, by its bill's id.
function billsRow(page: Page, billId: string): Locator {
    return visibleOrderPart(page, `purchase-order-bill-${billId}`)
}

// Opens a row's menu of the order form and reports whether it offers Remove; closes it.
async function rowMenuOffersRemove(page: Page, table: 'account_lines' | 'item_lines', id: string) {
    await visibleOrderPart(page, `form-table-${table}-menu-${id}`).click()
    await expect(page.getByRole('menuitem').first()).toBeVisible()
    const offers =
        (await page.getByTestId(`form-table-${table}-menu-remove`).count()) > 0 ||
        (await page.getByRole('menuitem', { name: /^Remove/ }).count()) > 0
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem')).toHaveCount(0)
    return offers
}

test.describe('purchase-orders: copy to bill', () => {
    test('an order is copied to a bill in full from the keyboard', async ({ page }) => {
        const memo = uniqueMemo('Copy to bill full')
        await openBooks(page)
        const today = await localToday(page)

        // Setup through the form (clicks allowed): $45.00 on 6210, three access points.
        const order = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            amount: '45.00',
            accountDescription: 'Freight to the annex',
            product: { name: ACCESS_POINT.name, quantity: '3' },
            memo,
        })
        // No bill names the order yet: no Bills section.
        await expect(visibleOrderPart(page, 'purchase-order-read-copy-to-bill')).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-bills')).toHaveCount(0)

        // From here on, keys only. B opens the dialog; focus is in the first row's input.
        await page.keyboard.press('b')
        const dialog = copyToBillDialog(page)
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(
            `Choose what this bill covers. Purchase order ${order.number} · ${OFFICE_SUPPLY.name}`
        )
        await expect(copyToBillRowsOf(page)).toHaveCount(2)
        const productRow = copyToBillRowNamed(page, ACCESS_POINT.name)
        const accountRow = copyToBillRowNamed(page, OFFICE_SUPPLY_ACCOUNT)
        const productLine = await copyToBillLineId(productRow)
        const accountLine = await copyToBillLineId(accountRow)
        await expect(copyToBillPart(page, 'input', productLine)).toBeFocused()
        await expect(copyToBillPart(page, 'input', productLine)).toHaveValue('3')
        await expect(copyToBillPart(page, 'input', accountLine)).toHaveValue('45.00')
        // The product row shows its Vendor part no.; the account row shows none.
        await expect(productRow).toContainText(ACCESS_POINT.partNo)
        await expect(accountRow).not.toContainText(ACCESS_POINT.partNo)
        await expect(productRow).toContainText('Open 3')
        await expect(accountRow).toContainText(`Open ${money(4_500)}`)
        await expect(page.getByTestId('copy-to-bill-count')).toHaveText('2 of 2 lines')
        // 3 × 121.40 + 45.00.
        await expect(page.getByTestId('copy-to-bill-total')).toHaveText(
            `Bill total ${money(40_920)}`
        )
        // Tab goes on to the next row's input.
        await tabTo(page, copyToBillPart(page, 'input', accountLine), { max: 6 })
        await expect(copyToBillPart(page, 'input', accountLine)).toBeFocused()

        // The dialog's submit key (⌘↵) creates the bill form from the order.
        await submitCopyToBill(page, order.number)
        const bill = visibleBillForm(page)
        await expect(bill.getByTestId('form-field-vendor')).toContainText(OFFICE_SUPPLY.name)
        await expect.poll(() => isLocked(bill.getByTestId('form-input-vendor'))).toBe(true)
        await expect(bill.getByTestId('bill-mailing-address')).toContainText(OFFICE_SUPPLY.line1)
        await expect(bill.getByTestId('form-input-terms')).toContainText('Net 15')
        await expect(bill.getByTestId('form-input-date')).toHaveValue(today)
        await expect(bill.getByTestId('form-input-due_date')).toHaveValue(addDays(today, 15))
        await expect(bill.getByTestId('form-input-memo')).toHaveValue('')

        // Both lines from the order, each with a read-only picker and the order's
        // description, rate and quantity.
        await expect(accountLineRows(page)).toHaveCount(1)
        await expect(itemLineRows(page)).toHaveCount(1)
        const billAccount = billCell(
            page,
            'account_lines',
            await billLineRowId(page, 'account_lines', 0)
        )
        const billItem = billCell(page, 'item_lines', await billLineRowId(page, 'item_lines', 0))
        await expect(accountLineRows(page).nth(0)).toContainText(OFFICE_SUPPLY_ACCOUNT)
        await expect.poll(() => isLocked(billAccount('account'))).toBe(true)
        await expect(billAccount('description')).toHaveValue('Freight to the annex')
        await expect(billAccount('amount')).toHaveValue('45.00')
        await expect(itemLineRows(page).nth(0)).toContainText(ACCESS_POINT.name)
        await expect.poll(() => isLocked(billItem('product'))).toBe(true)
        await expect(billItem('description')).toHaveValue(ACCESS_POINT.description)
        await expect(billItem('quantity')).toHaveValue('3')
        await expect(billItem('rate')).toHaveValue('121.40')

        // The link is a Tab stop after Vendor: back from the band's fields to it, and on
        // to Terms.
        const link = bill.getByTestId('bill-from-purchase-order')
        const terms = bill.getByTestId('form-input-terms')
        await tabTo(page, link, { key: 'Shift+Tab', max: 10 })
        await expect(link).toBeFocused()
        await tabTo(page, terms, { max: 3 })
        await expect(terms).toBeFocused()

        // ⌥↵ adds an account line of the bill's own, with a free picker.
        await page.keyboard.press('Alt+Enter')
        await expect(accountLineRows(page)).toHaveCount(2)
        const added = billCell(page, 'account_lines', await billLineRowId(page, 'account_lines', 1))
        await page.keyboard.type('Rent')
        await expect(page.getByRole('menuitem', { name: RENT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(added('account')).toContainText(RENT)
        await expect.poll(() => isLocked(added('account'))).toBe(false)
        await expect(added('description')).toBeFocused()
        await tabTo(page, added('amount'))
        await page.keyboard.type('20.00')

        // ⌘↵ posts the bill.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
        const billNumber = await billNumberOf(page)
        const billId = await billIdFromUrl(page)
        await expect(page.getByTestId('bill-total').filter({ visible: true })).toContainText(
            money(42_920)
        )

        // The bill's read view stamp links the order.
        await expect(visibleOrderPart(page, 'bill-from-purchase-order')).toHaveText(
            `From purchase order ${order.number}`
        )
        await openOrderFromBill(page, order.id)

        // Every line is received: the order closed by itself.
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Closed')
        await expect(readView(page).getByTestId('purchase-order-closed')).toHaveText(
            /^Closed on .+: every line is received$/
        )
        // Ordered 3 · Received 3 · Open —.
        await expect(readLine(page, ACCESS_POINT.name)).toContainText(/\b3\s+3\s+—/, {
            useInnerText: true,
        })
        // Amount $45.00 · Billed $45.00 · Open —.
        await expect(readLine(page, 'Freight to the annex')).toContainText(
            /\$45\.00\s+\$45\.00\s+—/,
            { useInnerText: true }
        )

        // No Copy to bill on a closed order, and B does nothing.
        await expect(visibleOrderPart(page, 'purchase-order-read-copy-to-bill')).toHaveCount(0)
        await page.keyboard.press('b')
        await settleFrames(page)
        await expect(page.getByTestId('copy-to-bill-dialog')).toHaveCount(0)
        await expectRecordUrl(page, 'purchase-orders', order.id)

        // The Bills section lists the posted bill with the amount of its lines from this
        // order: 45.00 + 364.20, not the added $20.00 line.
        const row = billsRow(page, billId)
        await expect(row).toContainText(`Bill ${billNumber}`)
        await expect(row).toContainText(money(40_920))
        await expect(row).not.toContainText(money(42_920))
        await expect(row).toContainText('Posted')
    })

    test('a part of an order, a draft bill, the hint and a void', async ({ page }) => {
        const memo = uniqueMemo('Copy to bill part')
        await openBooks(page)

        // 10 access points, $300.00 on 6210 and $50.00 on 6100 Rent.
        const order = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            amount: '300.00',
            accountDescription: 'Annex fit-out',
            accounts: [{ account: RENT, amount: '50.00' }],
            product: { name: ACCESS_POINT.name, quantity: '10' },
            memo,
        })

        await openCopyToBill(page)
        await expect(copyToBillRowsOf(page)).toHaveCount(3)
        const product = await copyToBillLineId(copyToBillRowNamed(page, ACCESS_POINT.name))
        const fitOut = await copyToBillLineId(copyToBillRowNamed(page, OFFICE_SUPPLY_ACCOUNT))
        const rent = await copyToBillLineId(copyToBillRowNamed(page, RENT))
        const input = (lineId: string) => copyToBillPart(page, 'input', lineId)

        // Qty to bill selects its value on focus, so typing replaces the 10.
        await expect(input(product)).toHaveValue('10')
        await page.keyboard.type('4')
        await expect(input(product)).toHaveValue('4')
        // Amount to bill selects its value on focus too (lesson 25: no ⌘A a user would not
        // press), so the typed amount replaces the $300.00.
        await expect(input(fitOut)).toHaveValue('300.00')
        await tabTo(page, input(fitOut), { max: 6 })
        await expect(input(fitOut)).toBeFocused()
        await page.keyboard.type('120.00')
        await expect(input(fitOut)).toHaveValue('120.00')

        // Space on the focused tick box unticks the rent row: its input is disabled and
        // keeps its value.
        const rentTick = copyToBillPart(page, 'tick', rent)
        await tabTo(page, rentTick, { max: 6 })
        await expect(rentTick).toBeFocused()
        await page.keyboard.press('Space')
        await expect(rentTick).toHaveAttribute('aria-checked', 'false')
        await expect(input(rent)).not.toBeEditable()
        await expect(input(rent)).toHaveValue('50.00')
        await expect(page.getByTestId('copy-to-bill-count')).toHaveText('2 of 3 lines')
        await expect(page.getByTestId('copy-to-bill-all')).toHaveAttribute('aria-checked', 'mixed')
        // 4 × 121.40 + 120.00.
        await expect(page.getByTestId('copy-to-bill-total')).toHaveText(
            `Bill total ${money(60_560)}`
        )
        await submitCopyToBill(page, order.number)

        // The bill holds the two ticked rows at the typed values; nothing is removed.
        await expect(accountLineRows(page)).toHaveCount(1)
        await expect(itemLineRows(page)).toHaveCount(1)
        const billAccount = billCell(
            page,
            'account_lines',
            await billLineRowId(page, 'account_lines', 0)
        )
        const billItem = billCell(page, 'item_lines', await billLineRowId(page, 'item_lines', 0))
        await expect(billAccount('amount')).toHaveValue('120.00')
        await expect(billItem('quantity')).toHaveValue('4')

        // Saved as a draft.
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-title').filter({ visible: true })).toHaveText(
            'Draft bill'
        )
        const billId = await billIdFromUrl(page)

        // On the order: the draft is listed, its quantity is noted under Open, and nothing
        // is received.
        await openOrderFromBill(page, order.id)
        const draftRow = billsRow(page, billId)
        await expect(draftRow).toContainText('Draft bill')
        await expect(draftRow).toContainText(money(60_560))
        await expect(readLine(page, ACCESS_POINT.name)).toContainText('4 on a draft bill')
        await expect(readLine(page, ACCESS_POINT.name)).toContainText(/\b10\s+0\s+10\b/, {
            useInnerText: true,
        })
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Open')

        // The dialog now starts at what the draft does not hold.
        await openCopyToBill(page)
        await expect(input(product)).toHaveValue('6')
        await expect(input(fitOut)).toHaveValue('180.00')
        await expect(input(rent)).toHaveValue('50.00')
        // More than is still open is allowed, with a hint.
        await page.keyboard.type('7')
        await expect(input(product)).toHaveValue('7')
        await expect(copyToBillPart(page, 'hint', product)).toHaveText(
            'More than the 6 still open.'
        )
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('copy-to-bill-dialog')).toHaveCount(0)

        // Post the draft, opened from the Bills section.
        await draftRow.getByText('Draft bill', { exact: true }).click()
        await expectRecordUrl(page, 'bills', billId)
        await expect(visibleBillForm(page)).toBeVisible()
        const billNumber = await postBill(page)

        await openOrderFromBill(page, order.id)
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Partly received')
        // Ordered 10 · Received 4 · Open 6.
        await expect(readLine(page, ACCESS_POINT.name)).toContainText(/\b10\s+4\s+6\b/, {
            useInnerText: true,
        })
        await expect(readLine(page, ACCESS_POINT.name)).not.toContainText('on a draft bill')
        await expect(readView(page).getByTestId('purchase-order-total-billed')).toContainText(
            money(60_560)
        )
        await expect(billsRow(page, billId)).toContainText(`Bill ${billNumber}`)

        // The edit form: the linked lines show what is received and billed, keep their
        // pickers and have no Remove; the rent line no bill names keeps both.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(PURCHASE_ORDER_EDIT_URL)
        const form = visibleOrderPart(page, 'purchase-order-form')
        await expect(form).toBeVisible()
        const itemId = await purchaseOrderLineRowId(page, 'item_lines', 0)
        const fitOutId = await purchaseOrderLineRowId(page, 'account_lines', 0)
        const rentId = await purchaseOrderLineRowId(page, 'account_lines', 1)
        await expect(purchaseOrderLineRows(page, 'item_lines').nth(0)).toContainText(
            'Received 4 of 10'
        )
        await expect(purchaseOrderLineRows(page, 'account_lines').nth(0)).toContainText(
            'Billed $120.00 of $300.00'
        )
        await expect(purchaseOrderLineRows(page, 'account_lines').nth(1)).not.toContainText(
            'Billed'
        )
        const orderItem = purchaseOrderCell(page, 'item_lines', itemId)
        await expect.poll(() => isLocked(orderItem('product'))).toBe(true)
        await expect
            .poll(() => isLocked(purchaseOrderCell(page, 'account_lines', fitOutId)('account')))
            .toBe(true)
        await expect
            .poll(() => isLocked(purchaseOrderCell(page, 'account_lines', rentId)('account')))
            .toBe(false)
        await expect.poll(() => isLocked(form.getByTestId('form-input-vendor'))).toBe(true)
        expect(await rowMenuOffersRemove(page, 'item_lines', itemId)).toBe(false)
        expect(await rowMenuOffersRemove(page, 'account_lines', fitOutId)).toBe(false)
        expect(await rowMenuOffersRemove(page, 'account_lines', rentId)).toBe(true)

        // A quantity below what is received is refused under its line.
        await orderItem('quantity').fill('3')
        await visibleOrderPart(page, 'purchase-order-save').click()
        await expect(
            purchaseOrderLineRows(page, 'item_lines')
                .nth(0)
                .getByText('Product line 1: 4 are received. The quantity cannot be below 4.', {
                    exact: true,
                })
        ).toBeVisible()
        await expect(page).toHaveURL(PURCHASE_ORDER_EDIT_URL)

        // Leave the refused edit; Delete of an order with bills is refused.
        await visibleOrderPart(page, 'purchase-order-cancel').click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expect(readView(page)).toBeVisible()
        await visibleOrderPart(page, 'purchase-order-read-more').click()
        await page.getByTestId('purchase-order-read-delete').click()
        await expect(page.getByTestId('purchase-order-delete-dialog')).toBeVisible()
        await page.getByTestId('purchase-order-delete-confirm').click()
        await expect(
            page.getByTestId('purchase-order-delete-refusal').filter({ visible: true })
        ).toContainText(`Purchase order ${order.number} has bills. Close it instead.`)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('purchase-order-delete-dialog')).toHaveCount(0)
        await expectRecordUrl(page, 'purchase-orders', order.id)

        // Void the bill: the order is open again with nothing received, and the Bills
        // section is gone.
        await billsRow(page, billId).getByText(`Bill ${billNumber}`, { exact: true }).click()
        await expectRecordUrl(page, 'bills', billId)
        await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
        await page.getByTestId('bill-read-void').filter({ visible: true }).click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('bill-badge').filter({ visible: true })).toHaveText('Void')
        await openOrderFromBill(page, order.id)
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Open')
        await expect(readLine(page, ACCESS_POINT.name)).toContainText(/\b10\s+0\s+10\b/, {
            useInnerText: true,
        })
        await expect(visibleOrderPart(page, 'purchase-order-bills')).toHaveCount(0)
        await expect(readView(page).getByTestId('purchase-order-total-billed')).toHaveCount(0)
    })

    test('a reload starts from every open line, a linked line may go, and the Bills section recovers', async ({
        context,
    }) => {
        const memo = uniqueMemo('Copy to bill reload')
        const page = await context.newPage()
        await openBooks(page)

        // Two product lines: 5 access points and 20 patch cables; no account line.
        const order = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            product: { name: ACCESS_POINT.name, quantity: '5' },
            products: [{ name: PATCH_CABLE.name, quantity: '20' }],
            memo,
        })

        // A lower quantity in the dialog.
        await openCopyToBill(page)
        await expect(copyToBillRowsOf(page)).toHaveCount(2)
        const accessPoint = await copyToBillLineId(copyToBillRowNamed(page, ACCESS_POINT.name))
        await page.keyboard.type('2')
        await expect(copyToBillPart(page, 'input', accessPoint)).toHaveValue('2')
        await submitCopyToBill(page, order.number)
        const pointRow = billItemRowNamed(page, ACCESS_POINT.name)
        const cableRow = billItemRowNamed(page, PATCH_CABLE.name)
        await expect(
            billCell(page, 'item_lines', await billRowIdOf(pointRow, 'item_lines'))('quantity')
        ).toHaveValue('2')

        // A reload empties the store: the form starts from every open line at its open
        // quantity.
        await page.reload()
        await expect(page).toHaveURL(BILL_FROM_ORDER_URL)
        await expect(visibleBillForm(page)).toBeVisible()
        await expect(visibleOrderPart(page, 'bill-from-purchase-order')).toHaveText(
            `From purchase order ${order.number}`
        )
        await expect(itemLineRows(page)).toHaveCount(2)
        await expect(
            billCell(page, 'item_lines', await billRowIdOf(pointRow, 'item_lines'))('quantity')
        ).toHaveValue('5')
        const cableId = await billRowIdOf(cableRow, 'item_lines')
        await expect(billCell(page, 'item_lines', cableId)('quantity')).toHaveValue('20')

        // A line from the order may be removed from the bill.
        await visibleBillForm(page).getByTestId(`form-table-item_lines-menu-${cableId}`).click()
        await page.getByTestId('form-table-item_lines-menu-remove').click()
        await expect(itemLineRows(page)).toHaveCount(1)
        const billNumber = await postBill(page)
        const billId = await billIdFromUrl(page)

        // The removed line stays open on the order; the other is received.
        await openOrderFromBill(page, order.id)
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Partly received')
        await expect(readLine(page, PATCH_CABLE.name)).toContainText(/\b20\s+0\s+20\b/, {
            useInnerText: true,
        })
        await expect(readLine(page, ACCESS_POINT.name)).toContainText(/\b5\s+5\s+—/, {
            useInnerText: true,
        })
        await expect(visibleOrderPart(page, 'purchase-order-read-copy-to-bill')).toBeVisible()
        await expect(billsRow(page, billId)).toContainText(`Bill ${billNumber}`)

        // The order was opened from this bill, so the bill's screen is below it: the Bills
        // row goes back to that screen (useOpenDocument keeps one copy of a screen in the
        // stack), and the order's screen leaves the stack.
        await billsRow(page, billId).getByText(`Bill ${billNumber}`, { exact: true }).click()
        await expectRecordUrl(page, 'bills', billId)
        await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
        await expect(page.getByTestId('purchase-order-read-only')).toHaveCount(0)

        // The Bills section's read fails on a fresh page (a row already in the store sends
        // no request): its own error row, the rest of the read view shows, and Retry lists
        // the bill. The pages share the context's storage, and the rail reopens Books at
        // its last route, so this page opens the dashboard first: the second page then
        // lands on the dashboard, not on this bill, and opens the order from search with
        // no bill's screen below it.
        await openDashboard(page)
        const second = await context.newPage()
        await second.route('**/api/collections/books_bills/records*', route => {
            const filter = new URL(route.request().url()).searchParams.get('filter') ?? ''
            if (!filter.includes('purchase_order')) return route.fallback()
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: 'Read failed.', data: {} }),
            })
        })
        await openBooks(second)
        await expect(second).toHaveURL(/\/books\/dashboard\/?$/)
        await expect(dashboardScreen(second)).toBeVisible()
        await openPurchaseOrderBySearch(second, memo)
        const section = visibleOrderPart(second, 'purchase-order-bills')
        await expect(section.getByRole('alert')).toBeVisible()
        await expect(billsRow(second, billId)).toHaveCount(0)
        await expect(readView(second)).toContainText(memo)
        await expect(readLine(second, PATCH_CABLE.name)).toBeVisible()
        await second.unrouteAll({ behavior: 'wait' })
        await section.getByRole('button', { name: 'Retry' }).click()
        await expect(billsRow(second, billId)).toContainText(`Bill ${billNumber}`)
        await expect(section.getByRole('alert')).toHaveCount(0)

        // No bill's screen is below the order here, so the Bills row pushes the posted bill
        // over the order, which stays mounted under it; the bill's read view names the order.
        await billsRow(second, billId).getByText(`Bill ${billNumber}`, { exact: true }).click()
        await expectRecordUrl(second, 'bills', billId)
        await expect(second.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
        await expect(second.getByTestId('purchase-order-read-only')).toHaveCount(1)
        await expect(visibleOrderPart(second, 'bill-from-purchase-order')).toHaveText(
            `From purchase order ${order.number}`
        )

        // E opens the correction of the posted bill; it keeps the order, and its band names
        // the order's number (spec §3.8 "From purchase order 1004"). The correction
        // replaces the bill's read view, so Cancel goes to the order below it (lesson 6).
        const correctionUrl = new RegExp(`/books/bills/new\\?replaces=${billId}$`)
        await second.keyboard.press('e')
        await expect(second).toHaveURL(correctionUrl)
        await expect(visibleBillForm(second)).toBeVisible()
        await expect(visibleOrderPart(second, 'bill-from-purchase-order')).toHaveText(
            `From purchase order ${order.number}`
        )
        await visibleOrderPart(second, 'bill-cancel').click()
        await expectRecordUrl(second, 'purchase-orders', order.id)
        await expect(readView(second)).toBeVisible()

        // A copy of the posted bill carries no order link.
        await billsRow(second, billId).getByText(`Bill ${billNumber}`, { exact: true }).click()
        await expectRecordUrl(second, 'bills', billId)
        await expect(second.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
        await second.keyboard.press('c')
        await expect(second).toHaveURL(/\/books\/bills\/new\?copy=[^&#]+$/)
        await expect(visibleBillForm(second)).toBeVisible()
        await expect(visibleBillForm(second).getByTestId('form-field-vendor')).toContainText(
            OFFICE_SUPPLY.name
        )
        await expect(visibleOrderPart(second, 'bill-from-purchase-order')).toHaveCount(0)
        await expect
            .poll(() => isLocked(visibleBillForm(second).getByTestId('form-input-vendor')))
            .toBe(false)
        await second.close()
    })

    test('the Copy to bill sheet at 390', async ({ page }) => {
        const memo = uniqueMemo('Copy to bill phone')
        await openBooks(page)
        const order = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            amount: '45.00',
            accountDescription: 'Freight to the annex',
            product: { name: ACCESS_POINT.name, quantity: '3' },
            memo,
        })

        // The phone read bar: Copy to bill is its primary button; Edit is a More row.
        await page.setViewportSize(PHONE)
        const copyButton = visibleOrderPart(page, 'purchase-order-read-copy-to-bill')
        await expect(copyButton).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-read-more')).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-read-edit')).toHaveCount(0)
        await copyButton.click()
        const sheet = copyToBillDialog(page)
        await expect(sheet).toBeVisible()
        await expect(copyToBillRowsOf(page)).toHaveCount(2)

        // Focus starts on the first row's Qty to bill (spec line 31) and stays there once the
        // sheet's first layout pass picks the stacked rows; typing replaces the selected 3.
        const firstLine = await copyToBillLineId(copyToBillRowsOf(page).first())
        const firstInput = copyToBillPart(page, 'input', firstLine)
        await expect(firstInput).toBeFocused()
        await settleFrames(page)
        await expect(firstInput).toBeFocused()
        await expect(firstInput).toHaveValue('3')
        await page.keyboard.type('2')
        await expect(firstInput).toHaveValue('2')

        // Each row is two lines: the tick box and the name; then Open on the left and the
        // input on the right.
        for (const name of [ACCESS_POINT.name, OFFICE_SUPPLY_ACCOUNT]) {
            const row = copyToBillRowNamed(page, name)
            const lineId = await copyToBillLineId(row)
            const tick = copyToBillPart(page, 'tick', lineId)
            const label = row.getByText(name, { exact: true })
            const open = row.getByText(/^Open /)
            const input = copyToBillPart(page, 'input', lineId)
            await expect
                .poll(async () => {
                    const [t, l, o, i] = await Promise.all(
                        [tick, label, open, input].map(part => part.boundingBox())
                    )
                    if (!t || !l || !o || !i) return null
                    return {
                        nameBesideTick: l.x >= t.x + t.width - 1 && l.y < t.y + t.height,
                        openBelowTick: o.y >= t.y + t.height - 1,
                        inputBelowTick: i.y >= t.y + t.height - 1,
                        inputRightOfOpen: i.x >= o.x + o.width - 1,
                        openBesideInput: o.y < i.y + i.height && i.y < o.y + o.height,
                    }
                })
                .toEqual({
                    nameBesideTick: true,
                    openBelowTick: true,
                    inputBelowTick: true,
                    inputRightOfOpen: true,
                    openBesideInput: true,
                })
        }

        // Nothing scrolls sideways.
        await expect.poll(() => sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <= document.documentElement.clientWidth
                )
            )
            .toBe(true)

        // One untick: the all-rows tick box shows the mixed state.
        const all = page.getByTestId('copy-to-bill-all').filter({ visible: true })
        await expect(all).toHaveAttribute('aria-checked', 'true')
        const account = await copyToBillLineId(copyToBillRowNamed(page, OFFICE_SUPPLY_ACCOUNT))
        await copyToBillPart(page, 'tick', account).click()
        await expect(copyToBillPart(page, 'tick', account)).toHaveAttribute('aria-checked', 'false')
        await expect(all).toHaveAttribute('aria-checked', 'mixed')
        await expect(page.getByTestId('copy-to-bill-count').filter({ visible: true })).toHaveText(
            '1 of 2 lines'
        )

        // Create bill opens the bill form, whose band shows the link.
        await page.getByTestId('copy-to-bill-submit').filter({ visible: true }).click()
        await expect(page).toHaveURL(BILL_FROM_ORDER_URL)
        await expect(visibleBillForm(page)).toBeVisible()
        await expect(visibleOrderPart(page, 'bill-from-purchase-order')).toHaveText(
            `From purchase order ${order.number}`
        )
        await expect(accountLineRows(page)).toHaveCount(0)
        await expect(itemLineRows(page)).toHaveCount(1)
    })
})
