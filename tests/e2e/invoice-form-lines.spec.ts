import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { documentTotals } from '../../tinycld/books/lib/document-lines'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { TAX_IDS, TAX_RATES } from '../../tinycld/books/lib/tax-rates-fixture'
import { PHONE } from './account-register-helpers'
import {
    DESKTOP,
    lineCellTestId,
    lineRowId,
    lineRows,
    NEW_INVOICE_URL,
    openNewInvoice,
    pickInvoiceCustomer,
    pickLineProduct,
} from './invoice-helpers'
import { createBundle } from './products-services-helpers'

// Every test makes its own unsaved invoice and never saves it; test 1 creates its own
// bundle (unique name) from two seeded taxable Non-inventory items.

const PERCENT_TARGET = 'A percent line applies to the item or subtotal right above it'
// INVOICE_MESSAGES' texts: lib/invoice-messages.ts imports modules Node cannot load.
const BUNDLE_LOAD_FAILED = "Books could not load this bundle's items."
const BUNDLE_EMPTY = 'This bundle has no active items'

function seededCustomer() {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the customer fixture')
    return row.display_name
}

function seededProduct(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row
}

const DENVER_COMPONENTS = [TAX_IDS.state, TAX_IDS.rtd, TAX_IDS.denverCity].map(id => {
    const rate = TAX_RATES.find(r => r.id === id)
    if (!rate) throw new Error(`no tax rate ${id}`)
    return { id, ppm: rate.rate_ppm }
})

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
}

function lineRow(page: Page, rowId: string) {
    return page.getByTestId('invoice-lines').getByTestId(`form-table-lines-row-${rowId}`)
}

function cell(page: Page, rowId: string, column: string) {
    return page.getByTestId(lineCellTestId(rowId, column))
}

async function rowIds(page: Page): Promise<string[]> {
    return lineRows(page).evaluateAll(els =>
        els.map(el => (el.getAttribute('data-testid') ?? '').slice('form-table-lines-row-'.length))
    )
}

// The right edge of the figure an amount cell draws: the glyphs' own box (a Range over
// the last text node holding a digit), not its element's, so alignment is what shows.
function figureRight(page: Page, rowId: string) {
    return cell(page, rowId, 'amount').evaluate(root => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        let last: Node | null = null
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (/\d/.test(node.textContent ?? '')) last = node
        }
        if (!last) return Number.NaN
        const range = document.createRange()
        range.selectNodeContents(last)
        return range.getBoundingClientRect().right
    })
}

// Picks a product on a line without expecting the trigger to show it: a bundle whose
// items cannot be read leaves the line with no product.
async function pickOnRow(page: Page, rowId: string, name: string) {
    const trigger = cell(page, rowId, 'product')
    await trigger.click()
    const search = page.getByTestId(`${lineCellTestId(rowId, 'product')}-search`)
    await expect(search).toBeFocused()
    await search.fill(name)
    const option = page.getByRole('menuitem').filter({ hasText: name }).first()
    await option.click()
    await expect(option).toHaveCount(0)
}

// The text core `formatHint(keys, isApple)` gives for `$mod+Alt+ArrowUp` (core
// lib/shortcuts/hint.ts + keys.ts). That module imports react-native, which Node cannot
// load, so the spec spells out its two outputs.
function moveUpHint(isApple: boolean) {
    return isApple ? '⌘⌥↑' : 'Ctrl+Alt+↑'
}

test.describe('invoice-form: lines', () => {
    test('a bundle expands into its items and a discount applies to their subtotal', async ({
        page,
    }) => {
        const accessPoint = seededProduct(PRODUCT_IDS.accessPoint)
        const patchCable = seededProduct(PRODUCT_IDS.patchCable)
        expect(accessPoint.taxable).toBe(true)
        expect(patchCable.taxable).toBe(true)
        const bundle = `Invoice kit ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

        await openBooks(page)
        await page.setViewportSize(DESKTOP)
        await createBundle(page, {
            name: bundle,
            items: [
                { name: accessPoint.name, quantity: '2' },
                { name: patchCable.name, quantity: '3' },
            ],
        })
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, seededCustomer())

        // The bundle pick: the cell is replaced, so the trigger is not read back.
        const first = await lineRowId(page, 0)
        const trigger = cell(page, first, 'product')
        await trigger.click()
        await expect(page.getByTestId(`${lineCellTestId(first, 'product')}-search`)).toBeFocused()
        await page.getByTestId(`${lineCellTestId(first, 'product')}-search`).fill(bundle)
        await page.getByRole('menuitem', { name: bundle, exact: true }).click()

        await expect(lineRows(page)).toHaveCount(3)
        const [itemA, itemB, subtotal] = await rowIds(page)
        expect(itemA).not.toBe(first)
        await expect(cell(page, itemA, 'product')).toContainText(accessPoint.name)
        await expect(cell(page, itemA, 'quantity')).toHaveValue('2')
        await expect(cell(page, itemB, 'product')).toContainText(patchCable.name)
        await expect(cell(page, itemB, 'quantity')).toHaveValue('3')
        await expect(cell(page, subtotal, 'quantity')).toHaveCount(0)
        await expect(cell(page, subtotal, 'amount')).toContainText('Subtotal')
        await expect(cell(page, subtotal, 'amount')).toContainText(
            money(2 * accessPoint.price + 3 * patchCable.price)
        )
        await expect(cell(page, itemA, 'quantity')).toBeFocused()
        // Focus moved there by the pick selects the value: typing replaces it.
        await page.keyboard.type('2')
        await expect(cell(page, itemA, 'quantity')).toHaveValue('2')

        // Totals aligned under Amount: the Subtotal's figure ends where the Items' do.
        await expect
            .poll(async () => {
                const subtotalRight = await figureRight(page, subtotal)
                const itemRights = [await figureRight(page, itemA), await figureRight(page, itemB)]
                return Math.max(...itemRights.map(right => Math.abs(right - subtotalRight)))
            })
            .toBeLessThanOrEqual(1)

        // Add… → Percent line from the Subtotal row's menu button.
        await page.getByTestId(`form-table-lines-menu-${subtotal}`).focus()
        await page.getByTestId('form-table-lines-add-more').click()
        await page.getByTestId('form-table-lines-add-percent').click()
        await expect(lineRows(page)).toHaveCount(4)
        const percentRow = (await rowIds(page))[3]
        await expect(cell(page, percentRow, 'percent')).toHaveCount(1)
        await pickLineProduct(page, 3, 'Discount')
        await cell(page, percentRow, 'percent').fill('-5')
        // A Percent cell that takes the focus again selects its value: typing replaces it.
        await cell(page, percentRow, 'description').focus()
        await cell(page, percentRow, 'percent').focus()
        await page.keyboard.type('-10')
        await expect(cell(page, percentRow, 'percent')).toHaveValue('-10')

        const totals = documentTotals(
            [
                {
                    kind: 'item',
                    quantity: 2,
                    rate: accessPoint.price,
                    percentPpm: 0,
                    taxable: true,
                },
                { kind: 'item', quantity: 3, rate: patchCable.price, percentPpm: 0, taxable: true },
                { kind: 'subtotal', quantity: 0, rate: 0, percentPpm: 0, taxable: false },
                { kind: 'percent', quantity: 0, rate: 0, percentPpm: -100_000, taxable: true },
            ],
            { components: DENVER_COMPONENTS }
        )
        await expect(cell(page, percentRow, 'amount')).toContainText(
            money(totals.amounts[3] ?? Number.NaN)
        )
        // Every line the Subtotal covers is taxable, so the discount is too.
        await expect(cell(page, percentRow, 'taxable').getByRole('switch')).toBeChecked()
        await expect(page.getByTestId('invoice-total-subtotal')).toContainText(
            money(totals.subtotal)
        )
        await expect(page.getByTestId('invoice-total')).toContainText(money(totals.total))

        // Enter in the last line's last editable cell adds an Item line.
        await cell(page, percentRow, 'percent').press('Enter')
        await expect(lineRows(page)).toHaveCount(5)
        const added = (await rowIds(page))[4]
        await expect(cell(page, added, 'product')).toBeFocused()

        // ⌥S: a Subtotal line after the focused line.
        await page.keyboard.press('Alt+s')
        await expect(lineRows(page)).toHaveCount(6)
        const secondSubtotal = (await rowIds(page))[5]
        await expect(cell(page, secondSubtotal, 'amount')).toContainText('Subtotal')

        // ⌥T on line 1: a Description line right after it.
        await cell(page, itemA, 'description').focus()
        await page.keyboard.press('Alt+t')
        await expect(lineRows(page)).toHaveCount(7)
        const description = (await rowIds(page))[1]
        expect([itemA, itemB, subtotal, percentRow, added, secondSubtotal]).not.toContain(
            description
        )
        await expect(cell(page, description, 'description')).toHaveCount(1)
        await expect(cell(page, description, 'product')).toHaveCount(0)

        // ⌥5 on the Description line: a Percent line under it has no line to apply to.
        await cell(page, description, 'description').focus()
        await page.keyboard.press('Alt+5')
        await expect(lineRows(page)).toHaveCount(8)
        const orphan = (await rowIds(page))[2]
        await expect(cell(page, orphan, 'percent')).toHaveCount(1)
        await expect(lineRow(page, orphan)).toContainText(PERCENT_TARGET)

        // A refused Save draft runs the schema, so every later edit re-validates the lines.
        await page.getByTestId('invoice-save-draft').click()
        await expect(lineRow(page, description)).toContainText('Description is required')
        await expect(lineRow(page, added)).toContainText('Product or service is required')
        await expect(page).toHaveURL(NEW_INVOICE_URL)

        // A bundle whose items cannot be read: the message stays through a re-validation.
        const items = '**/api/collections/books_bundle_items/records*'
        await page.route(items, route => route.fulfill({ status: 400 }))
        await pickOnRow(page, added, seededProduct(PRODUCT_IDS.officeNetwork).name)
        await expect(lineRow(page, added)).toContainText(BUNDLE_LOAD_FAILED)
        await cell(page, description, 'description').fill('Kit notes')
        await expect(lineRow(page, description)).not.toContainText('Description is required')
        await expect(lineRow(page, added)).toContainText(BUNDLE_LOAD_FAILED)
        await page.unrouteAll({ behavior: 'wait' })

        // A bundle with no active items.
        await page.route(items, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    page: 1,
                    perPage: 500,
                    totalItems: 0,
                    totalPages: 0,
                    items: [],
                }),
            })
        )
        await pickOnRow(page, added, seededProduct(PRODUCT_IDS.homeOffice).name)
        await expect(lineRow(page, added)).toContainText(BUNDLE_EMPTY)
        await page.unrouteAll({ behavior: 'wait' })

        // The next pick on the row clears it; a rate of 1,000.00 or more shows grouped
        // while the cell is not focused.
        const taxPrep = seededProduct(PRODUCT_IDS.taxPrep)
        expect(taxPrep.price).toBe(125_000)
        await pickOnRow(page, added, taxPrep.name)
        await expect(cell(page, added, 'product')).toContainText(taxPrep.name)
        await expect(lineRow(page, added)).not.toContainText(BUNDLE_EMPTY)
        await expect(cell(page, added, 'rate')).not.toBeFocused()
        await expect(cell(page, added, 'rate')).toHaveValue('1,250.00')
    })

    test('lines are entered and rearranged from the keyboard', async ({ page }) => {
        const product = seededProduct(PRODUCT_IDS.accessPoint)
        const second = seededProduct('prodremoteit001')
        await openBooks(page)
        await openNewInvoice(page)
        const customer = page.getByTestId('form-input-customer')
        const customerSearch = page.getByTestId('form-input-customer-search')
        await expect(customer).toBeFocused()

        // Type-to-open: the first character opens the picker and lands in its search.
        await page.keyboard.type('Harb')
        await expect(customerSearch).toBeFocused()
        await expect(customerSearch).toHaveValue('Harb')
        await page.keyboard.press('Escape')
        await expect(customerSearch).toHaveCount(0)
        await expect(customer).toBeFocused()

        await page.keyboard.press('ArrowDown')
        await expect(customerSearch).toBeFocused()
        await expect(customerSearch).toHaveValue('')
        await page.keyboard.type('Harb')
        await expect(
            page.getByRole('menuitem').filter({ hasText: 'Harborview' }).first()
        ).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(customerSearch).toHaveCount(0)
        await expect(customer).toContainText('Harborview')
        await expect(page.getByTestId('form-input-terms')).toBeFocused()

        // Tab order through the header: Bill to, Email and the totals are skipped. Each
        // date field's calendar button stays a Tab stop right after its own input, so the
        // calendar is reachable from the keyboard (spec §3.1).
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-input-date')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-input-date-open')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-input-due_date')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-input-due_date-open')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-input-tax_rate')).toBeFocused()
        await page.keyboard.press('Tab')
        const line1 = await lineRowId(page, 0)
        await expect(cell(page, line1, 'product')).toBeFocused()

        // Type-to-open a product; a pick moves on to the description.
        const productSearch = page.getByTestId(`${lineCellTestId(line1, 'product')}-search`)
        await page.keyboard.type(product.name)
        await expect(productSearch).toBeFocused()
        await expect(productSearch).toHaveValue(product.name)
        await expect(page.getByRole('menuitem', { name: product.name, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(cell(page, line1, 'product')).toContainText(product.name)
        await expect(cell(page, line1, 'description')).toBeFocused()

        // Tab into Qty and Rate selects each value: typing replaces it (the pick set 1 and
        // the product's rate).
        await page.keyboard.press('Tab')
        await expect(cell(page, line1, 'quantity')).toBeFocused()
        await expect(cell(page, line1, 'quantity')).toHaveValue('1')
        await page.keyboard.type('2')
        await expect(cell(page, line1, 'quantity')).toHaveValue('2')
        await page.keyboard.press('Tab')
        await expect(cell(page, line1, 'rate')).toBeFocused()
        await expect(cell(page, line1, 'rate')).not.toHaveValue('')
        await page.keyboard.type('50.00')
        await expect(cell(page, line1, 'rate')).toHaveValue('50.00')
        await page.keyboard.press('Tab')
        await expect(cell(page, line1, 'taxable').getByRole('switch')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId(`form-table-lines-menu-${line1}`)).toBeFocused()

        // Enter on Rate of the last line adds line 2 and focuses its product.
        await cell(page, line1, 'rate').press('Enter')
        await expect(lineRows(page)).toHaveCount(2)
        const line2 = await lineRowId(page, 1)
        await expect(cell(page, line2, 'product')).toBeFocused()
        await pickLineProduct(page, 1, second.name)

        // ⌥↵ adds line 3 after line 2; ⌘⌥⌫ removes it and focus goes to line 2's same cell.
        await page.keyboard.press('Alt+Enter')
        await expect(lineRows(page)).toHaveCount(3)
        const line3 = await lineRowId(page, 2)
        await expect(cell(page, line3, 'product')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Alt+Backspace')
        await expect(lineRows(page)).toHaveCount(2)
        expect(await rowIds(page)).toEqual([line1, line2])
        await expect(cell(page, line2, 'product')).toBeFocused()

        // ⌥T: a Description line after line 2.
        await page.keyboard.press('Alt+t')
        await expect(lineRows(page)).toHaveCount(3)
        const note = await lineRowId(page, 2)
        await expect(cell(page, note, 'description')).toBeFocused()
        const noteText = `Notes ${Date.now()}`
        await page.keyboard.type(noteText)

        // ⌘⌥↑ / ⌘⌥↓ move it and focus stays in its description cell.
        await page.keyboard.press('ControlOrMeta+Alt+ArrowUp')
        await expect.poll(() => rowIds(page)).toEqual([line1, note, line2])
        await expect(cell(page, note, 'description')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Alt+ArrowDown')
        await expect.poll(() => rowIds(page)).toEqual([line1, line2, note])
        await expect(cell(page, note, 'description')).toBeFocused()

        // ⌘⌥D duplicates it right below and focus goes to the copy's same cell.
        await page.keyboard.press('ControlOrMeta+Alt+d')
        await expect(lineRows(page)).toHaveCount(4)
        const copy = await lineRowId(page, 3)
        expect(await rowIds(page)).toEqual([line1, line2, note, copy])
        await expect(cell(page, copy, 'description')).toHaveValue(noteText)
        await expect(cell(page, copy, 'description')).toBeFocused()

        // ⌥M opens the focused row's menu; Move up shows its key.
        const isApple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform))
        await page.keyboard.press('Alt+m')
        const moveUp = page.getByTestId('form-table-lines-menu-up')
        await expect(moveUp).toBeVisible()
        await expect(moveUp).toContainText(moveUpHint(isApple))
        await page.keyboard.press('Escape')
        await expect(moveUp).toHaveCount(0)

        // From the last row's menu button on through the rest of the form.
        await page.getByTestId(`form-table-lines-menu-${copy}`).focus()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-table-lines-add')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-table-lines-add-more')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-input-message')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('form-input-memo')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('invoice-cancel')).toBeFocused()

        // Focus is on the Cancel button, not an input, so ⇧/ opens core's list. (Esc here
        // would be Cancel on this dirty form and open the Discard dialog.)
        await page.keyboard.press('Shift+?')
        const list = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(list).toBeVisible()
        const lines = list.getByText('Lines', { exact: true }).locator('..')
        for (const label of [
            'Remove line',
            'Move line up',
            'Duplicate line',
            'Add description line',
        ]) {
            await expect(lines.getByText(label, { exact: true })).toBeVisible()
        }
    })

    test('the row menu works on phone cards', async ({ page }) => {
        const first = seededProduct(PRODUCT_IDS.accessPoint)
        const second = seededProduct('prodremoteit001')
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, seededCustomer())
        const card1 = await pickLineProduct(page, 0, first.name)
        await page.getByTestId('form-table-lines-add').click()
        await expect(lineRows(page)).toHaveCount(2)
        const card2 = await pickLineProduct(page, 1, second.name)

        await expect(page.getByTestId('form-table-lines-cards')).toBeVisible()
        for (const rowId of [card1, card2]) {
            await expect(page.getByTestId(`form-table-lines-kind-${rowId}`)).toHaveText('Item')
        }

        const menuAction = async (rowId: string, action: string) => {
            await page.getByTestId(`form-table-lines-menu-${rowId}`).click()
            const item = page.getByTestId(`form-table-lines-menu-${action}`)
            await item.click()
            await expect(item).toHaveCount(0)
        }

        await menuAction(card1, 'insert-below')
        await expect(lineRows(page)).toHaveCount(3)
        const inserted = await lineRowId(page, 1)
        expect(await rowIds(page)).toEqual([card1, inserted, card2])
        await expect(page.getByTestId(`form-table-lines-kind-${inserted}`)).toHaveText('Item')
        await expect(cell(page, inserted, 'product')).not.toContainText(first.name)
        await expect(cell(page, inserted, 'product')).not.toContainText(second.name)

        await menuAction(inserted, 'remove')
        await expect(lineRows(page)).toHaveCount(2)
        expect(await rowIds(page)).toEqual([card1, card2])

        await menuAction(card1, 'duplicate')
        await expect(lineRows(page)).toHaveCount(3)
        const copy = await lineRowId(page, 1)
        expect(await rowIds(page)).toEqual([card1, copy, card2])
        await expect(cell(page, copy, 'product')).toContainText(first.name)

        await menuAction(card1, 'down')
        await expect.poll(() => rowIds(page)).toEqual([copy, card1, card2])

        await menuAction(copy, 'remove')
        await expect(lineRows(page)).toHaveCount(2)
        expect(await rowIds(page)).toEqual([card1, card2])
    })
})
