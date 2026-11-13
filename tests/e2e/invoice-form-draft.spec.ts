import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { dueDateFor } from '../../tinycld/books/lib/document-dates'
import { documentTotals } from '../../tinycld/books/lib/document-lines'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { TAX_IDS, TAX_RATES } from '../../tinycld/books/lib/tax-rates-fixture'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    lineCellTestId,
    lineRowId,
    lineRows,
    localToday,
    NEW_INVOICE_URL,
    openInvoiceBySearch,
    openNewInvoice,
    pickInvoiceCustomer,
    pickLineProduct,
    saveInvoiceDraft,
    searchToInvoice,
    uniqueMemo,
} from './invoice-helpers'
import { createProduct, makeProductInactiveElsewhere } from './products-services-helpers'
import { isDisabled } from './record-form-helpers'

// The seeded customer whose terms are Net 30 (CUSTOMER_TERMS_PATCHES) and whose default
// tax is Denver combined (CUSTOMER_TAX_PATCHES), and a taxable seeded product: the seed
// has no taxable Service, so the Non-inventory "Wireless access point" (taxable by
// default) stands for it.
function seededCustomer() {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row?.billing_address) throw new Error('no Harborview billing address in the fixture')
    return { name: row.display_name, email: row.email, line1: row.billing_address.line1 }
}

function seededProduct() {
    const row = PRODUCTS.find(p => p.id === PRODUCT_IDS.accessPoint)
    if (!row) throw new Error('no Wireless access point in the product fixture')
    expect(row.taxable).toBe(true)
    return { name: row.name, price: row.price }
}

const DENVER_COMPONENTS = [TAX_IDS.state, TAX_IDS.rtd, TAX_IDS.denverCity].map(id => {
    const rate = TAX_RATES.find(r => r.id === id)
    if (!rate) throw new Error(`no tax rate ${id}`)
    return { id, ppm: rate.rate_ppm }
})

const DRAFT_URL_OF = (id: string) => new RegExp(`/books/invoices/${id}$`)

function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(cents / 100)
}

// Core's NARROW_BELOW (core/ui/forms/widths.ts): a lines container this wide or wider
// draws the grid. The UI module is not importable in Node.
const NARROW_BELOW = 640
const WIDE_VIEWPORT = { width: 1280, height: 900 }
// Measured: on the tablet layout the lines container is the viewport minus 271 px.
const NARROWEST_WIDE_VIEWPORT = { width: 911, height: 900 }

// The right edge of the last money figure drawn inside an element: the glyphs' own
// box, so it does not depend on how wide the text's box is.
function figureRight(page: Page, testId: string): Promise<number> {
    return page.getByTestId(testId).evaluate(el => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        let figure: Text | null = null
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (/\d/.test(node.textContent ?? '')) figure = node as Text
        }
        if (!figure) return Number.NaN
        const range = document.createRange()
        range.selectNodeContents(figure)
        return range.getBoundingClientRect().right
    })
}

// The wide grid's header slot widths, by column key.
function headerWidths(page: Page): Promise<Record<string, number>> {
    const prefix = 'form-table-lines-head-'
    return page
        .getByTestId('invoice-lines')
        .locator(`[data-testid^="${prefix}"]`)
        .evaluateAll(
            (els, p) =>
                Object.fromEntries(
                    els.map(el => [
                        (el.getAttribute('data-testid') ?? '').slice(p.length),
                        el.getBoundingClientRect().width,
                    ])
                ),
            prefix
        )
}

// One grid row's slot widths, by column key (core's `form-table-lines-slot-<rowId>-<key>`).
function rowSlotWidths(page: Page, rowId: string): Promise<Record<string, number>> {
    const prefix = `form-table-lines-slot-${rowId}-`
    return page
        .getByTestId('invoice-lines')
        .locator(`[data-testid^="${prefix}"]`)
        .evaluateAll(
            (els, p) =>
                Object.fromEntries(
                    els.map(el => [
                        (el.getAttribute('data-testid') ?? '').slice(p.length),
                        el.getBoundingClientRect().width,
                    ])
                ),
            prefix
        )
}

// What the element draws around itself: its outline, shadow and border. Read two frames
// late, so a ring a focus handler draws through a re-render has landed.
function focusLook(target: Locator): Promise<string> {
    return target.evaluate(
        el =>
            new Promise<string>(resolve => {
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                        const s = getComputedStyle(el)
                        resolve(
                            [
                                s.outlineStyle,
                                s.outlineWidth,
                                s.outlineColor,
                                s.boxShadow,
                                s.borderColor,
                                s.borderWidth,
                            ].join(' | ')
                        )
                    })
                )
            })
    )
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// Core SelectInput: the menu items exist only while the menu is open.
async function chooseSelect(page: Page, key: string, name: string | RegExp) {
    await page.getByTestId(`form-input-${key}`).click()
    const item = page.getByRole('menuitem', { name, exact: typeof name === 'string' })
    await item.click()
    await expect(item).toHaveCount(0)
}

test.describe('invoice-form: draft invoice', () => {
    test('new invoice fills from the customer and saves a draft', async ({ page }) => {
        const customer = seededCustomer()
        const product = seededProduct()
        await openBooks(page)
        await openNewInvoice(page)
        const customerPicker = page.getByTestId('form-input-customer')
        await expect(customerPicker).toBeFocused()
        // The focus shows: New Invoice is chosen with the pointer, and the browser draws no
        // focus ring for a focus set by script after a pointer press.
        const focusedLook = await focusLook(customerPicker)
        await page.getByTestId('form-input-memo').focus()
        await expect(customerPicker).not.toBeFocused()
        expect(focusedLook).not.toBe(await focusLook(customerPicker))
        // Spec §3.2: the status badge shows on a new invoice too.
        await expect(page.getByTestId('invoice-badge')).toHaveText('Draft')

        const today = await localToday(page)
        const dueDate = page.getByTestId('form-input-due_date')
        await pickInvoiceCustomer(page, customer.name)
        await expect(page.getByTestId('invoice-terms')).toContainText('Net 30')
        await expect(dueDate).toHaveValue(dueDateFor(today, 'net_30') ?? '')
        await expect(page.getByTestId('invoice-tax')).toContainText('Denver combined')
        await expect(page.getByTestId('invoice-bill-to')).toContainText(customer.line1)
        await expect(page.getByTestId('invoice-email')).toContainText(customer.email)
        await expect(page.getByTestId('form-input-email')).toHaveCount(0)

        await chooseSelect(page, 'terms', 'Net 15')
        await expect(dueDate).toHaveValue(dueDateFor(today, 'net_15') ?? '')

        const rowId = await pickLineProduct(page, 0, product.name)
        await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill('2')

        // Esc in a line cell opens the Discard dialog; Keep editing gives focus back to
        // that same cell, so typing goes on where it stopped.
        const description = page.getByTestId(lineCellTestId(rowId, 'description'))
        await description.fill('Rack install')
        await page.keyboard.press('Escape')
        const discard = page.getByTestId('discard-dialog')
        await expect(discard).toBeVisible()
        await discard.getByRole('button', { name: 'Keep editing' }).click()
        await expect(discard).toHaveCount(0)
        await expect(description).toBeFocused()
        await page.keyboard.type(' and cabling')
        await expect(description).toHaveValue('Rack install and cabling')

        const taxed = documentTotals(
            [{ kind: 'item', quantity: 2, rate: product.price, percentPpm: 0, taxable: true }],
            { components: DENVER_COMPONENTS }
        )
        await expect(page.getByTestId(lineCellTestId(rowId, 'amount'))).toContainText(
            money(taxed.amounts[0] ?? Number.NaN)
        )
        await expect(page.getByTestId('invoice-total-subtotal')).toContainText(
            money(taxed.subtotal)
        )
        const taxLine = page.getByTestId('invoice-total-tax')
        await expect(taxLine).toContainText('Denver combined (8.71%)')
        await expect(taxLine).toContainText(money(taxed.taxTotal))
        await expect(page.getByTestId('invoice-total')).toContainText(money(taxed.total))
        await expect(page.getByTestId('invoice-balance-due')).toContainText(money(taxed.total))

        await chooseSelect(page, 'tax_rate', 'None')
        await expect(taxLine).toHaveCount(0)
        await expect(page.getByTestId('invoice-total')).toContainText(money(taxed.subtotal))
        await expect(page.getByTestId('invoice-balance-due')).toContainText(money(taxed.subtotal))
        await chooseSelect(page, 'tax_rate', /^Denver combined\b/)
        await expect(taxLine).toContainText(money(taxed.taxTotal))

        await page.getByTestId('invoice-edit-address').click()
        await expect(page.getByTestId('form-input-bill_to-line1')).toHaveValue(customer.line1)
        const email = page.getByTestId('form-input-email')
        await expect(email).toBeVisible()
        const newEmail = `billing+${Date.now()}@harborview.example`
        await email.fill(newEmail)
        const memo = uniqueMemo('Invoice draft fills')
        await page.getByTestId('form-input-memo').fill(memo)

        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(INVOICE_URL)
        const draftUrl = DRAFT_URL_OF(invoiceIdFromUrl(page))
        await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')
        await expect(page.getByTestId('invoice-badge')).toHaveText('Draft')

        // Edit customer pushes the customer form; Back returns to the draft.
        await page.getByTestId('invoice-edit-customer').click()
        await expect(page).toHaveURL(/\/books\/customers\/(?!new$)[^/?#]+$/)
        await expect(page.getByTestId('form-input-display_name')).toHaveValue(customer.name)
        await page.goBack()
        await expect(page).toHaveURL(draftUrl)
        await expect(page.getByTestId('invoice-form')).toBeVisible()

        await page.getByTestId('entry-back').click()
        await expect(page).not.toHaveURL(draftUrl)
        await openInvoiceBySearch(page, memo)
        await expect(page).toHaveURL(draftUrl)
        await expect(page.getByTestId('form-input-customer')).toContainText(customer.name)
        await expect(lineRows(page)).toHaveCount(1)
        const reopenedRow = await lineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(reopenedRow, 'product'))).toContainText(
            product.name
        )
        await expect(page.getByTestId(lineCellTestId(reopenedRow, 'quantity'))).toHaveValue('2')
        await expect(page.getByTestId('invoice-email')).toContainText(newEmail)
        await expect(page.getByTestId('form-input-memo')).toHaveValue(memo)
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
    })

    test('errors show under their fields and keys respect the open dialog', async ({ page }) => {
        await openBooks(page)
        await openNewInvoice(page)
        const save = page.getByTestId('invoice-save-draft')

        await page.context().setOffline(true)
        await expect.poll(() => isDisabled(save)).toBe(true)
        await page.context().setOffline(false)
        await expect.poll(() => isDisabled(save)).toBe(false)

        const today = await localToday(page)
        const yesterday = new Date(`${today}T00:00:00Z`)
        yesterday.setUTCDate(yesterday.getUTCDate() - 1)
        await page.getByTestId('form-input-due_date').fill(yesterday.toISOString().slice(0, 10))

        await page.keyboard.press('ControlOrMeta+s')
        await expect(page.getByTestId('form-field-customer-error')).toHaveText(
            'Customer is required'
        )
        await expect(page.getByTestId('form-field-due_date-error')).toHaveText(
            'The due date cannot be before the invoice date'
        )
        // The empty trailing Item line was dropped before validation.
        await expect(page.getByTestId('form-field-lines-error')).toHaveText('Lines is required')
        await expect(page.getByText('Product or service is required')).toHaveCount(0)
        await expect(page).toHaveURL(NEW_INVOICE_URL)

        // Post needs an Item line: a customer and a Description line alone are refused.
        await pickInvoiceCustomer(page, seededCustomer().name)
        await page.getByTestId('form-table-lines-add-more').click()
        await page.getByTestId('form-table-lines-add-description').click()
        await expect(lineRows(page)).toHaveCount(1)
        const descriptionRow = await lineRowId(page, 0)
        await page
            .getByTestId(lineCellTestId(descriptionRow, 'description'))
            .fill('Site survey notes')
        await page.getByTestId('invoice-post').click()
        await expect(page.getByTestId('form-field-lines-error')).toHaveText(
            'Add at least one product or service line'
        )
        await expect(page.getByTestId('form-field-customer-error')).toHaveCount(0)
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await expect(page.getByTestId('invoice-title')).toHaveText('New invoice')
        await expect(page.getByTestId('invoice-badge')).toHaveText('Draft')

        const dialog = page.getByTestId('discard-dialog')
        await page.getByTestId('invoice-cancel').click()
        await expect(dialog).toBeVisible()
        // The screen's keys do nothing while a dialog is open.
        await page.keyboard.press('ControlOrMeta+s')
        await expect(dialog).toBeVisible()
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        // Esc closes only the open layer.
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('invoice-form')).toBeVisible()
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        // Esc on the dirty form is Cancel: the Discard dialog again.
        await page.keyboard.press('Escape')
        await expect(dialog).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).not.toHaveURL(NEW_INVOICE_URL)
        await expect(page.getByTestId('invoice-form')).toHaveCount(0)
    })

    test('cancel without edits leaves at once and a saved draft is deleted with its key', async ({
        page,
    }) => {
        await openBooks(page)
        await openNewInvoice(page)
        await page.getByTestId('invoice-cancel').click()
        await expect(page).not.toHaveURL(NEW_INVOICE_URL)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(page.getByTestId('invoice-form')).toHaveCount(0)

        const id = await saveInvoiceDraft(page, {
            customer: seededCustomer().name,
            product: seededProduct().name,
            memo: uniqueMemo('Invoice draft delete'),
        })
        const draftUrl = DRAFT_URL_OF(id)
        await expect(page.getByTestId('invoice-badge')).toHaveText('Draft')

        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(page.getByTestId('delete-draft-dialog')).toBeVisible()
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page).not.toHaveURL(draftUrl)
        await expect(page.getByTestId('invoice-form')).toHaveCount(0)

        await page.goForward()
        await expect(page).toHaveURL(draftUrl)
        await expect(page.getByTestId('invoice-not-found')).toContainText(
            'This invoice does not exist'
        )
    })

    test('a refused delete keeps the draft and its unsaved edits', async ({ page }) => {
        await openBooks(page)
        const id = await saveInvoiceDraft(page, {
            customer: seededCustomer().name,
            product: seededProduct().name,
            memo: uniqueMemo('Invoice draft refused delete'),
        })
        const draftUrl = DRAFT_URL_OF(id)
        const edited = uniqueMemo('Invoice draft unsaved memo')
        const memo = page.getByTestId('form-input-memo')
        await memo.fill(edited)
        // Out of the memo, so the delete key is the screen's, not the text field's.
        await page.getByTestId('invoice-title').click()

        // pbtsdb's delete is optimistic: the row leaves the store before this answer.
        const refusal = 'This draft cannot be deleted right now.'
        await page.route(`**/api/collections/books_invoices/records/${id}*`, route =>
            route.request().method() === 'DELETE'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({ status: 400, message: refusal, data: {} }),
                  })
                : route.fallback()
        )
        await page.keyboard.press('ControlOrMeta+Backspace')
        const dialog = page.getByTestId('delete-draft-dialog')
        await expect(dialog).toBeVisible()
        const refused = page.waitForResponse(
            r => r.request().method() === 'DELETE' && r.url().includes(id) && r.status() === 400
        )
        await page.getByTestId('delete-draft-confirm').click()
        await refused

        await expect(dialog).toContainText(refusal)
        await expect(page.getByTestId('invoice-not-found')).toHaveCount(0)
        await expect(page).toHaveURL(draftUrl)
        await page.unrouteAll({ behavior: 'wait' })
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('invoice-form')).toBeVisible()
        await expect(memo).toHaveValue(edited)
    })

    test('a refused line on a new invoice stays under its row and a second save makes no second invoice', async ({
        page,
    }) => {
        // The test's own product: another tab makes it inactive after the line chose it
        // (the product picker offers no inactive product), so the server refuses the line.
        const product = { name: uniqueMemo('Line refusal product') }
        // Every invoice insert and delete this page makes; the difference is the invoices
        // that exist.
        let created = 0
        let deleted = 0
        page.on('response', r => {
            const url = new URL(r.url())
            if (!r.ok()) return
            const method = r.request().method()
            if (method === 'POST' && url.pathname === '/api/collections/books_invoices/records') {
                created += 1
            }
            if (
                method === 'DELETE' &&
                url.pathname.startsWith('/api/collections/books_invoices/records/')
            ) {
                deleted += 1
            }
        })
        // The server's own refusal of a line (server/sales_documents.go msgLineProductInactive).
        const refusal = `Line 1: ${product.name} is inactive. Choose an active product or service.`
        const refusalText = `${product.name} is inactive. Choose an active product or service.`
        const lineRefused = page.waitForResponse(
            r =>
                r.url().includes('/api/collections/books_invoice_lines/records') &&
                r.request().method() === 'POST' &&
                r.status() === 400
        )

        await openBooks(page)
        await createProduct(page, { type: 'service', name: product.name, price: '25.00' })
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, seededCustomer().name)
        await pickLineProduct(page, 0, product.name)
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Invoice line refusal'))
        await page.getByTestId('invoice-title').click()
        const elsewhere = await makeProductInactiveElsewhere(page, product.name)

        await page.keyboard.press('ControlOrMeta+s')
        await lineRefused
        await expect(lineRows(page)).toHaveCount(1)
        const rowId = await lineRowId(page, 0)
        const row = page.getByTestId('invoice-lines').getByTestId(`form-table-lines-row-${rowId}`)
        // The server's text names its line once: the row shows exactly that text, once,
        // with no second "Line 1:" label put in front of it.
        await expect(row.getByText(refusal, { exact: true })).toHaveCount(1)
        await expect(row).not.toContainText('Line 1: Line 1:')
        await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(product.name)
        await expect(page.getByTestId('invoice-form')).toBeVisible()
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        // The refused save took its invoice back.
        await expect.poll(() => ({ created, deleted })).toEqual({ created: 1, deleted: 1 })

        // The other tab makes the product active again, so the next save is accepted.
        await elsewhere.makeActive()
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')
        const savedId = await lineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(savedId, 'product'))).toContainText(
            product.name
        )
        await expect(page.getByText(refusalText)).toHaveCount(0)
        // The second save inserted the invoice once: one invoice exists.
        await expect.poll(() => created - deleted).toBe(1)
        expect(created).toBe(2)
    })

    test('line cells show their values and the totals sit under Amount at every wide width', async ({
        page,
    }) => {
        const product = seededProduct()
        await openBooks(page)
        await openNewInvoice(page)
        await pickInvoiceCustomer(page, seededCustomer().name)
        const rowId = await pickLineProduct(page, 0, product.name)
        const quantity = page.getByTestId(lineCellTestId(rowId, 'quantity'))
        await quantity.fill('1000')
        // A 4-digit rate: the widest Rate value the cell is sized for.
        const rate = page.getByTestId(lineCellTestId(rowId, 'rate'))
        await rate.fill('1890.00')
        await quantity.click()
        const amountId = lineCellTestId(rowId, 'amount')
        const amountText = money(1000 * 189000)
        await expect(page.getByTestId(amountId)).toContainText(amountText)
        await expect(page.getByTestId('invoice-total-subtotal')).toContainText(amountText)

        const totalRightGap = async () => {
            const line = await figureRight(page, amountId)
            const total = await figureRight(page, 'invoice-total')
            return Math.abs(line - total)
        }

        await page.setViewportSize(WIDE_VIEWPORT)
        await expect(page.getByTestId('form-table-lines-grid')).toBeVisible()
        // Spec §7: the totals' figures end where the line amounts end.
        await expect.poll(totalRightGap).toBeLessThanOrEqual(2)
        // Spec §3.3 and the reference at 1280: a product name shows whole in a slot of at
        // least 200 px, and Description, the widest slot, holds its 3 lines in 260 px.
        await expect
            .poll(async () => {
                const widths = await rowSlotWidths(page, rowId)
                const others = Object.entries(widths)
                    .filter(([key]) => key !== 'description')
                    .map(([, width]) => width)
                return {
                    product: widths.product >= 200,
                    description: widths.description >= 260,
                    widest: others.length > 0 && others.every(w => widths.description > w),
                }
            })
            .toEqual({ product: true, description: true, widest: true })

        // Tablet layout (rail + 175 px sidebar + padding): this viewport gives the lines
        // table a 640 px container, core's NARROW_BELOW, so the narrowest wide grid.
        await page.setViewportSize(NARROWEST_WIDE_VIEWPORT)
        await expect
            .poll(async () => (await page.getByTestId('invoice-lines').boundingBox())?.width)
            .toBe(NARROW_BELOW)
        await expect(page.getByTestId('form-table-lines-grid')).toBeVisible()
        await expect.poll(totalRightGap).toBeLessThanOrEqual(2)

        // A 4-digit quantity shows whole in its cell.
        await expect(quantity).toHaveValue('1000')
        await expect
            .poll(() => quantity.evaluate(el => el.scrollWidth - el.clientWidth))
            .toBeLessThanOrEqual(0)
        // A 4-digit rate shows whole in its cell (the blurred cell groups it as "1,890.00").
        await expect(rate).toHaveValue(/^1,?890\.00$/)
        await expect
            .poll(() => rate.evaluate(el => el.scrollWidth - el.clientWidth))
            .toBeLessThanOrEqual(0)
        // The amount figure ends before the Tax cell starts.
        const taxable = page.getByTestId(lineCellTestId(rowId, 'taxable'))
        await expect
            .poll(async () => {
                const tax = await taxable.boundingBox()
                if (!tax) return Number.NaN
                return tax.x - (await figureRight(page, amountId))
            })
            .toBeGreaterThanOrEqual(0)
        // The Tax switch lies whole inside its slot.
        const taxSlot = page.getByTestId(`form-table-lines-slot-${rowId}-taxable`)
        const taxSwitch = taxSlot.getByRole('switch')
        await expect
            .poll(async () => {
                const slot = await taxSlot.boundingBox()
                const box = await taxSwitch.boundingBox()
                if (!slot || !box) return false
                return box.x >= slot.x - 0.5 && box.x + box.width <= slot.x + slot.width + 0.5
            })
            .toBe(true)
        // Description stays the widest column and Product the next.
        await expect
            .poll(async () => {
                const widths = await headerWidths(page)
                const others = Object.entries(widths)
                    .filter(([key]) => key !== 'description' && key !== 'product')
                    .map(([, width]) => width)
                return (
                    widths.description > widths.product &&
                    others.every(width => widths.product > width)
                )
            })
            .toBe(true)
    })

    test('a load failure shows Retry and Retry loads the draft', async ({ context }) => {
        const product = seededProduct()
        const memo = uniqueMemo('Invoice draft retry')
        const first = await context.newPage()
        await openBooks(first)
        const id = await saveInvoiceDraft(first, {
            customer: seededCustomer().name,
            product: product.name,
            memo,
        })

        // A fresh page has never loaded the draft's lines, so the reopen must request them;
        // on the saving page pbtsdb's grace window would serve the held rows with no request.
        const page = await context.newPage()
        // pbtsdb reports a load error only for a 4xx other than 401/408/429.
        await page.route('**/api/collections/books_invoice_lines/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(page)
        await searchToInvoice(page, memo)
        await expect(page).toHaveURL(DRAFT_URL_OF(id))
        await expect(page.getByTestId('invoice-error')).toContainText(
            'Books could not load this invoice.'
        )
        await expect(page.getByTestId('invoice-form')).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('invoice-retry').click()
        await expect(page.getByTestId('invoice-form')).toBeVisible()
        await expect(page.getByTestId('invoice-error')).toHaveCount(0)
        await expect(lineRows(page)).toHaveCount(1)
        const rowId = await lineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(product.name)
    })
})
