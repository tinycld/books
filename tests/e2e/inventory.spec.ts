import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { DESKTOP } from './account-register-helpers'
import {
    BILL_URL,
    billCellTestId,
    billLineRowId,
    itemLineRows,
    openNewBill,
    pickBillLineProduct,
    pickBillVendor,
    postBill,
    SETTINGS_ROW_PATH,
} from './bill-helpers'
import {
    INVOICE_URL,
    lineCellTestId,
    lineRowId,
    lineRows,
    localToday,
    openInvoiceBySearch,
    openNewInvoice,
    pickInvoiceCustomer,
    pickLineProduct,
    uniqueMemo,
} from './invoice-helpers'
import {
    openEntriesList,
    openOtherBooksPage,
    searchEntries,
    shownEntries,
} from './journal-entries-helpers'
import {
    createBundle,
    expectSavedToList,
    field,
    openNewProduct,
    openProduct,
    productSurface,
} from './products-services-helpers'
import { visibleTestId } from './sales-receipt-helpers'

// Inventory through the forms (books design, "Inventory"): the costing method changes in
// Settings while no inventory transaction has posted; an Inventory item is made on the
// Product/Service form, received on a bill, sold on an invoice, corrected, sold below zero
// with the form's warning, and sold as a part of a bundle; then Settings shows the costing
// method as locked. A second item is made with opening stock typed into the form: its
// opening entry posts, offers no Edit or Void, and its form keeps the asset account and
// shows the quantity on hand live.
//
// Phones: below the mobile breakpoint core's TableField draws each line as a card, but a
// card cell renders the same host component as a grid cell (LineProductCell, with its
// StockWarning), so a phone run would test the same code; this file runs at the desktop
// size only.
//
// The costing method test saves the shared books_settings row two times, so it runs alone
// in the one-worker `costing-method-setting` project of playwright.config.ts (its title
// ends in ": costing method setting"), before the `books` project. The other tests are one
// serial group: each test continues with the item of the test before it. Every record is
// made by driving the forms, with names unique to the run. Documents take the default date
// (today, after the close date books-settings.spec.ts holds). The item costs 20.00 on its
// one receipt, so FIFO and average cost give the same cost of goods sold: the tests hold
// under both methods.
//
// The database is shared and the lock never lifts. On a fresh database (CI) this file
// posts the first inventory transaction, so the costing method test finds the method open
// and changes it; on a database an earlier run locked, that test checks the locked text.
//
// What this does NOT cover: the server's refusal of a change after the lock (the select is
// gone then; the Go tests cover it), and an inventory adjustment, which has no screen.

const SUMMIT = 'Summit IT Services'

function seededCustomer() {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the customer fixture')
    return row.display_name
}

const HARBORVIEW = seededCustomer()
const LOCKED = 'The costing method cannot change after the first inventory transaction posts.'

// Unique to the run, and made when the file loads: test.info() has no test yet, so the
// names do not come from uniqueName. A worker loads the file once for the serial group.
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const ITEM = `E2E Stock item ${RUN}`
const BUNDLE = `E2E Stock kit ${RUN}`
const OPENING_ITEM = `E2E Opening stock item ${RUN}`

const FIFO = 'FIFO (first in, first out)'
const AVERAGE = 'Average cost'

// The label of the item's cost of goods sold account, read from its saved form.
let cogsAccount = ''
// The memo of the invoice that sells 2, so the next test finds it again.
let saleMemo = ''

function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(cents / 100)
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The entry read view's lines, in one snapshot: account label, debit and credit.
function readEntryLines(page: Page) {
    return entryView(page).evaluate(root => {
        const text = (id: string) =>
            (root.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim()
        const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
        return Array.from({ length: count }, (_, i) => ({
            account: text(`entry-line-account-${i}`),
            debit: text(`entry-line-debit-${i}`),
            credit: text(`entry-line-credit-${i}`),
        }))
    })
}

// J on a posted document's read view opens its journal entry.
async function openEntryOfDocument(page: Page) {
    await page.keyboard.press('j')
    await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
    await expect(entryView(page)).toBeVisible()
}

// The journal entry read view on screen. A screen the stack covers stays mounted and
// hidden, so a second entry opened in one test finds two of them without the filter.
function entryView(page: Page) {
    return page.getByTestId('entry-read-only').filter({ visible: true })
}

// Opens the form of the item `name`. The products list opens from the Lists hub: a
// document or journal entry screen has no way to it of its own.
async function openItem(page: Page, name: string) {
    await visibleTestId(page, 'books-nav-lists').click()
    await openProduct(page, name)
}

// Opens the item's form and checks the quantity on hand it shows.
async function expectOnHand(page: Page, quantity: string) {
    await openItem(page, ITEM)
    await expect(field(page, 'quantity_on_hand')).toHaveText(quantity)
}

// A new invoice for the seeded customer with the item on line 1; returns the line's row id.
async function newInvoiceWithItem(page: Page, memo: string) {
    await openNewInvoice(page)
    await pickInvoiceCustomer(page, HARBORVIEW)
    const rowId = await pickLineProduct(page, 0, ITEM)
    await page.getByTestId('form-input-memo').fill(memo)
    return rowId
}

async function openAccountingSettings(page: Page) {
    await visibleTestId(page, 'books-nav-settings').click()
    await expect(page).toHaveURL(/\/books\/settings$/)
    await visibleTestId(page, 'books-settings-section-accounting').click()
    await expect(page).toHaveURL(/\/books\/settings\/accounting$/)
}

// Picks the method `label` in the Inventory card and saves it; waits for the stored row.
async function saveCostingMethod(page: Page, label: string) {
    const select = visibleTestId(page, 'books-settings-costing-method')
    await select.click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(select).toContainText(label)
    const save = visibleTestId(page, 'books-settings-costing-method-save')
    await expect(save).toBeEnabled()
    const answered = page.waitForResponse(
        response =>
            response.request().method() === 'PATCH' &&
            new URL(response.url()).pathname === SETTINGS_ROW_PATH
    )
    await save.click()
    expect((await answered).status()).toBe(200)
    await expect(save).toBeDisabled()
    await expect(select).toContainText(label)
}

async function postInvoice(page: Page) {
    await page.getByTestId('invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
}

test('the costing method changes in Settings until inventory has posted: costing method setting', async ({
    page,
}) => {
    await openBooks(page)
    await openAccountingSettings(page)
    const select = visibleTestId(page, 'books-settings-costing-method')
    const locked = visibleTestId(page, 'books-settings-costing-method-locked')
    await expect(select.or(locked)).toBeVisible()
    if (await locked.isVisible()) {
        // An earlier run on this database posted inventory.
        await expect(locked).toHaveText(LOCKED)
        return
    }
    // Change the method and put the stored one back, so the book keeps its method.
    const stored = (await select.innerText()).trim()
    expect([FIFO, AVERAGE]).toContain(stored)
    const other = stored === AVERAGE ? FIFO : AVERAGE
    await saveCostingMethod(page, other)
    await saveCostingMethod(page, stored)
})

test.describe
    .serial('inventory: an item through the forms', () => {
        test('the Product/Service form makes an Inventory item', async ({ page }) => {
            await openBooks(page)
            await openNewProduct(page, 'inventory')

            // The type is fixed, the item is always purchased, and the expense account is
            // its cost of goods sold account.
            await expect(productSurface(page).getByTestId('form-input-type')).toContainText(
                'Inventory'
            )
            await expect(page.getByTestId('form-field-purchases')).toHaveCount(0)
            await expect(page.getByTestId('form-field-items')).toHaveCount(0)
            await expect(page.getByTestId('form-field-expense_account')).toContainText(
                'Cost of goods sold account'
            )
            for (const key of [
                'asset_account',
                'preferred_vendor',
                'opening_quantity',
                'opening_value',
                'opening_date',
                'reorder_point',
            ]) {
                await expect(page.getByTestId(`form-field-${key}`)).toBeVisible()
            }
            // A new item has no quantity on hand to show yet.
            await expect(page.getByTestId('form-field-quantity_on_hand')).toHaveCount(0)

            await field(page, 'name').fill(ITEM)
            await field(page, 'price').fill('50.00')
            await field(page, 'price').press('Tab')
            await field(page, 'cost').fill('20.00')
            await field(page, 'cost').press('Tab')
            await page.getByTestId('product-save').click()
            await expectSavedToList(page)

            await expectOnHand(page, '0')
            // The e2e chart has no Cost of goods sold account, so the new form names none and
            // the save gives the item the one the server makes (ensureCostOfGoodsSold). The
            // saved item's select names it by number and name, as the entry lines do.
            const cogsSelect = field(page, 'expense_account')
            await expect(cogsSelect).toHaveText(/^\d+ \S/)
            cogsAccount = (await cogsSelect.innerText()).trim()
        })

        test('a bill receives the item and an invoice sells it at its cost', async ({ page }) => {
            expect(cogsAccount, 'the first test made the item').not.toBe('')
            await openBooks(page)

            // Receive 5 at 20.00 on a bill with the product line alone.
            await openNewBill(page)
            await pickBillVendor(page, SUMMIT)
            const accountLine = await billLineRowId(page, 'account_lines', 0)
            await page.getByTestId(`form-table-account_lines-menu-${accountLine}`).click()
            await page.getByRole('menuitem', { name: /^Remove/ }).click()
            await page.getByTestId('form-table-item_lines-add').click()
            await expect(itemLineRows(page)).toHaveCount(1)
            const billLine = await pickBillLineProduct(page, 0, ITEM)
            const billCell = (column: string) =>
                page.getByTestId(billCellTestId('item_lines', billLine, column))
            await expect(billCell('rate')).toHaveValue('20.00')
            await billCell('quantity').fill('5')
            await expect(page.getByTestId('bill-total')).toContainText(money(10_000))
            await page.getByTestId('form-input-memo').fill(uniqueMemo('Stock receipt'))
            await postBill(page)
            await expect(page).toHaveURL(BILL_URL)

            // The bill debits the inventory asset account, not an expense.
            await openEntryOfDocument(page)
            await expect
                .poll(async () => {
                    const lines = await readEntryLines(page)
                    const asset = lines.find(l => /Inventory asset$/.test(l.account))
                    const payable = lines.find(l => /Accounts payable$/.test(l.account))
                    return {
                        count: lines.length,
                        assetDebit: asset?.debit,
                        payableCredit: payable?.credit,
                    }
                })
                .toEqual({ count: 2, assetDebit: money(10_000), payableCredit: money(10_000) })
            await expectOnHand(page, '5')

            // Sell 2: the stock covers the sale, so the line shows no warning.
            saleMemo = uniqueMemo('Stock sale')
            const row = await newInvoiceWithItem(page, saleMemo)
            await page.getByTestId(lineCellTestId(row, 'quantity')).fill('2')
            await expect(page.getByTestId(lineCellTestId(row, 'stock-warning'))).toHaveCount(0)
            await postInvoice(page)

            // The invoice's own entry holds the cost: 2 at 20.00 from the asset account to
            // cost of goods sold.
            await openEntryOfDocument(page)
            await expect
                .poll(async () => {
                    const lines = await readEntryLines(page)
                    const cogs = lines.find(l => l.account === cogsAccount)
                    const asset = lines.find(l => /Inventory asset$/.test(l.account))
                    return { cogsDebit: cogs?.debit, assetCredit: asset?.credit }
                })
                .toEqual({ cogsDebit: money(4_000), assetCredit: money(4_000) })
            await expectOnHand(page, '3')
        })

        test('a correction of the sale counts the stock the sale already took', async ({
            page,
        }) => {
            expect(saleMemo, 'the test before posted the sale').not.toBe('')
            await openBooks(page)
            await openInvoiceBySearch(page, saleMemo)
            await expect(page.getByTestId('invoice-read-only')).toBeVisible()
            await page.keyboard.press('e')
            await expect(page).toHaveURL(/\/books\/invoices\/new\?replaces=[^/?#]+$/)
            await expect(page.getByTestId('invoice-title')).toHaveText(/^Edit \d+$/)

            // 3 on hand and the 2 this invoice already took: up to 5 fit.
            const row = await lineRowId(page, 0)
            const quantity = page.getByTestId(lineCellTestId(row, 'quantity'))
            const warning = page.getByTestId(lineCellTestId(row, 'stock-warning'))
            await expect(quantity).toHaveValue('2')
            await expect(warning).toHaveCount(0)
            await quantity.fill('5')
            await expect(warning).toHaveCount(0)
            await quantity.fill('6')
            await expect(warning).toContainText('Quantity on hand is 3.')
            await quantity.fill('3')
            await expect(warning).toHaveCount(0)
            await postInvoice(page)

            // The correction's entry holds the cost of 3; the first sale's stock is back.
            await openEntryOfDocument(page)
            await expect
                .poll(async () => {
                    const lines = await readEntryLines(page)
                    const cogs = lines.find(l => l.account === cogsAccount)
                    const asset = lines.find(l => /Inventory asset$/.test(l.account))
                    return { cogsDebit: cogs?.debit, assetCredit: asset?.credit }
                })
                .toEqual({ cogsDebit: money(6_000), assetCredit: money(6_000) })
            await expectOnHand(page, '2')
        })

        test('a sale of more than the quantity on hand warns and still posts', async ({ page }) => {
            await openBooks(page)
            const row = await newInvoiceWithItem(page, uniqueMemo('Stock oversold'))
            const quantity = page.getByTestId(lineCellTestId(row, 'quantity'))
            const warning = page.getByTestId(lineCellTestId(row, 'stock-warning'))

            await quantity.fill('2')
            await expect(warning).toHaveCount(0)
            await quantity.fill('3')
            await expect(warning).toHaveText(
                'Quantity on hand is 2. You can post this sale; the quantity on hand goes below zero.'
            )

            // A second line of the same item counts too: both lines warn.
            await page.getByTestId('form-table-lines-add').click()
            await expect(lineRows(page)).toHaveCount(2)
            await quantity.fill('2')
            await expect(warning).toHaveCount(0)
            const second = await pickLineProduct(page, 1, ITEM)
            await expect(page.getByTestId(lineCellTestId(second, 'quantity'))).toHaveValue('1')
            await expect(warning).toBeVisible()
            await expect(page.getByTestId(lineCellTestId(second, 'stock-warning'))).toBeVisible()

            // The warning does not block Post.
            await postInvoice(page)
            await expectOnHand(page, '-1')
        })

        test('a bundle with the item takes the stock of its part', async ({ page }) => {
            await openBooks(page)
            await createBundle(page, { name: BUNDLE, items: [{ name: ITEM, quantity: '2' }] })

            await openNewInvoice(page)
            await pickInvoiceCustomer(page, HARBORVIEW)
            // The bundle pick replaces the line with its item lines and a Subtotal line.
            const first = await lineRowId(page, 0)
            await page.getByTestId(lineCellTestId(first, 'product')).click()
            const search = page.getByTestId(`${lineCellTestId(first, 'product')}-search`)
            await expect(search).toBeFocused()
            await search.fill(BUNDLE)
            await page.getByRole('menuitem', { name: BUNDLE, exact: true }).click()
            await expect(lineRows(page)).toHaveCount(2)
            const part = await lineRowId(page, 0)
            await expect(page.getByTestId(lineCellTestId(part, 'product'))).toContainText(ITEM)
            await expect(page.getByTestId(lineCellTestId(part, 'quantity'))).toHaveValue('2')
            // The item is at -1 already, so its line warns.
            await expect(page.getByTestId(lineCellTestId(part, 'stock-warning'))).toContainText(
                'Quantity on hand is -1.'
            )
            await page.getByTestId('form-input-memo').fill(uniqueMemo('Stock kit sale'))
            await postInvoice(page)

            await expectOnHand(page, '-3')
        })

        test('Settings shows the costing method as locked', async ({ page }) => {
            await openBooks(page)
            await openAccountingSettings(page)

            await expect(visibleTestId(page, 'books-settings-costing-method-locked')).toHaveText(
                LOCKED
            )
            await expect(visibleTestId(page, 'books-settings-costing-method-readonly')).toHaveText(
                /FIFO \(first in, first out\)|Average cost/
            )
            // No select and no Save: the method cannot change from here.
            await expect(visibleTestId(page, 'books-settings-costing-method')).toHaveCount(0)
            await expect(visibleTestId(page, 'books-settings-costing-method-save')).toHaveCount(0)
        })

        test('an item with opening stock posts its opening entry and shows its stock live', async ({
            page,
        }) => {
            await openBooks(page)
            await openNewProduct(page, 'inventory')
            await field(page, 'name').fill(OPENING_ITEM)
            await field(page, 'cost').fill('20.00')
            await field(page, 'cost').press('Tab')
            await field(page, 'opening_quantity').fill('12')
            await field(page, 'opening_quantity').press('Tab')
            await field(page, 'opening_value').fill('240.00')
            await field(page, 'opening_value').press('Tab')
            await field(page, 'opening_date').fill(await localToday(page))
            // A thousands comma is read as a separator and shown plain after the blur.
            const reorder = field(page, 'reorder_point')
            await reorder.fill('1,250')
            await reorder.press('Tab')
            await expect(reorder).toHaveValue('1250')
            await page.getByTestId('product-save').click()
            await expectSavedToList(page)

            await openItem(page, OPENING_ITEM)
            await expect(field(page, 'quantity_on_hand')).toHaveText('12')
            await expect(field(page, 'reorder_point')).toHaveValue('1250')
            // The item has stock moves, so the server keeps its asset account: the form
            // offers no change and says why.
            await expect(field(page, 'asset_account')).toHaveAttribute('aria-disabled', 'true')
            await expect(page.getByTestId('form-note-asset_account')).toHaveText(
                'The inventory asset account cannot change after the item has stock transactions.'
            )

            // The opening entry debits the inventory asset and credits Opening Balance Equity.
            // Books keeps it in step with the item, so it offers no Edit and no Void.
            await openEntriesList(page)
            await searchEntries(page, `Opening stock of ${OPENING_ITEM}`)
            const rows = shownEntries(page).locator('[data-testid^="entries-row-menu-"]')
            await expect(rows).toHaveCount(1)
            await rows.click()
            await expect(page.getByTestId('entries-menu-open')).toBeVisible()
            await expect(page.getByTestId('entries-menu-edit')).toHaveCount(0)
            await expect(page.getByTestId('entries-menu-void')).toHaveCount(0)
            await page.getByTestId('entries-menu-open').click()
            await expect(entryView(page)).toBeVisible()
            await expect
                .poll(async () => {
                    const lines = await readEntryLines(page)
                    const asset = lines.find(l => /Inventory asset$/.test(l.account))
                    const equity = lines.find(l => /Opening Balance Equity$/.test(l.account))
                    return {
                        count: lines.length,
                        assetDebit: asset?.debit,
                        equityCredit: equity?.credit,
                    }
                })
                .toEqual({ count: 2, assetDebit: money(24_000), equityCredit: money(24_000) })
            await expect(entryView(page).getByTestId('entry-edit')).toHaveCount(0)
            await expect(entryView(page).getByRole('button', { name: 'Void' })).toHaveCount(0)
            await expect(entryView(page).getByTestId('entry-change-note')).toBeVisible()
            await page.goBack()

            // Quantity on hand follows the stored item while its form is open: another tab
            // changes the opening quantity, and this form shows the new count.
            await openItem(page, OPENING_ITEM)
            await expect(field(page, 'quantity_on_hand')).toHaveText('12')
            const other = await openOtherBooksPage(page, ['products'])
            await openProduct(other, OPENING_ITEM)
            await field(other, 'opening_quantity').fill('15')
            await field(other, 'opening_quantity').press('Tab')
            await other.getByTestId('product-save').click()
            await expectSavedToList(other)
            await other.close()
            await expect(field(page, 'quantity_on_hand')).toHaveText('15')
        })
    })
