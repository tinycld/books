import { type Browser, expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { batchAnswered } from './document-batch-helpers'
import {
    ESTIMATE_URL,
    estimateLineRowId,
    openEstimateBySearch,
    openNewEstimate,
    pickEstimateCustomer,
    pickEstimateLineProduct,
} from './estimate-helpers'
import {
    lineCellTestId,
    lineRowId,
    openInvoiceBySearch,
    saveInvoiceDraft,
    uniqueMemo,
} from './invoice-helpers'
import { DESKTOP, PHONE } from './journal-entries-helpers'

// Two sessions on one sales document (general ledger review, GL-01, for documents). The
// first session's view goes stale when the second one saves. Its save or post must be
// refused, must keep what was typed, and must go through only after it loaded the
// current document.
//
// Every write goes through the form; nothing is written raw. The stale session changes
// ONLY a line (a quantity), never a header field: a save that sends only lines carries no
// revision, so the server cannot refuse it and the form itself must see that the stored
// document moved on. The document form follows the stored row while nothing is typed in
// it, so the first session makes its change BEFORE the second one saves: from then on its
// view is fixed. One test shuts realtime off for the first session, so its store stays
// behind and the server's own refusal is the one that shows.

const INVOICE_CONFLICT = 'This invoice changed after you opened it.'
const ESTIMATE_CONFLICT = 'This estimate changed after you opened it.'

function seededCustomer() {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the customer fixture')
    return row.display_name
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const MONEY = /-?\$[\d,]+\.\d{2}/

// The amount a totals row shows. The row's text is its label and the amount; only the
// amount is compared, so the row's layout (one line or two) does not matter.
async function amountIn(row: Locator): Promise<string> {
    const amount = MONEY.exec(await row.innerText())?.[0]
    if (!amount) throw new Error('no amount in the totals row')
    return amount
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

async function secondSession(browser: Browser): Promise<Page> {
    const context = await browser.newContext()
    const page = await context.newPage()
    await openBooks(page)
    return page
}

// The second session sets line 1's rate to 50.00 and saves the draft.
async function saveOtherRate(other: Page, memo: string) {
    await openInvoiceBySearch(other, memo)
    await expect(other.getByTestId('form-input-memo')).toHaveValue(memo)
    const rowId = await lineRowId(other, 0)
    await other.getByTestId(lineCellTestId(rowId, 'rate')).fill('50.00')
    await other.getByTestId('invoice-title').click()
    await expect(other.getByTestId('invoice-total-subtotal')).toContainText('50.00')
    const saved = batchAnswered(other, 'books_invoices', 'PATCH', 200)
    await other.getByTestId('invoice-save-draft').click()
    await saved
}

for (const [name, size] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const) {
    test(`a stale invoice save that changes only a line is refused and overwrites nothing (${name})`, async ({
        page,
        browser,
    }) => {
        const memo = uniqueMemo(`Invoice conflict ${name}`)
        await openBooks(page)
        await saveInvoiceDraft(page, {
            customer: seededCustomer(),
            product: ACCESS_POINT,
            memo,
        })

        // The first session changes only line 1's quantity: its view is fixed from here.
        // Typed at the wide layout, where the cell has this test id; the form keeps the
        // value when the viewport changes.
        const rowId = await lineRowId(page, 0)
        await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill('2')
        await page.getByTestId('invoice-title').click()
        const subtotal = page.getByTestId('invoice-total-subtotal')
        const own = await amountIn(subtotal)
        await page.setViewportSize(size)
        await expect(subtotal).toContainText(own)

        const other = await secondSession(browser)
        await saveOtherRate(other, memo)

        await page.getByTestId('invoice-save-draft').click()
        await expect(page.getByTestId('invoice-conflict')).toContainText(INVOICE_CONFLICT)
        // What was typed is still on the screen.
        await expect(subtotal).toContainText(own)
        await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')

        // Load the current invoice: the other session's line is the stored one (quantity 1
        // at 50.00), so the refused save wrote nothing over it.
        await page.getByTestId('invoice-conflict-reload').click()
        await expect(page.getByTestId('invoice-conflict')).toHaveCount(0)
        await expect(subtotal).toContainText('50.00')
        await expect(subtotal).not.toContainText('100.00')

        // Now the post is a reviewed one.
        await page.getByTestId('invoice-post').click()
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
        await other.context().close()
    })
}

test('with realtime off, the server refuses the stale save and the reload reads the invoice again', async ({
    page,
    browser,
}) => {
    const memo = uniqueMemo('Invoice conflict no realtime')
    // No realtime message reaches this session: its store stays as it loaded.
    await page.route('**/api/realtime*', route => route.abort())
    await openBooks(page)
    await saveInvoiceDraft(page, { customer: seededCustomer(), product: ACCESS_POINT, memo })

    const other = await secondSession(browser)
    await saveOtherRate(other, memo)

    // This session's store did not move, so the form's own check passes and the batch
    // goes out: the line, then the header with the revision this form saw. The server
    // refuses it.
    const subtotal = page.getByTestId('invoice-total-subtotal')
    const rowId = await lineRowId(page, 0)
    await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill('2')
    await page.getByTestId('invoice-title').click()
    const own = await amountIn(subtotal)
    const refused = batchAnswered(page, 'books_invoices', 'PATCH', 400)
    await page.getByTestId('invoice-save-draft').click()
    await refused
    await expect(page.getByTestId('invoice-conflict')).toContainText(INVOICE_CONFLICT)
    await expect(subtotal).toContainText(own)

    // The reload reads the rows from the server: the other session's line shows.
    await page.getByTestId('invoice-conflict-reload').click()
    await expect(page.getByTestId('invoice-conflict')).toHaveCount(0)
    await expect(subtotal).toContainText('50.00')
    await expect(subtotal).not.toContainText('100.00')

    await page.getByTestId('invoice-post').click()
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
    await other.context().close()
})

test('a stale estimate save that changes only a line is refused and overwrites nothing', async ({
    page,
    browser,
}) => {
    const memo = uniqueMemo('Estimate conflict')
    await openBooks(page)
    await openNewEstimate(page)
    await pickEstimateCustomer(page, seededCustomer())
    await pickEstimateLineProduct(page, 0, ACCESS_POINT)
    await page.getByTestId('form-input-memo').fill(memo)
    await page.getByTestId('estimate-save').click()
    await expect(page).toHaveURL(ESTIMATE_URL)
    await expect(page.getByTestId('estimate-badge')).toHaveText('Pending')

    // The first session changes only line 1's quantity: its view is fixed from here.
    const subtotal = page.getByTestId('estimate-total-subtotal')
    const ownRow = await estimateLineRowId(page, 0)
    await page.getByTestId(lineCellTestId(ownRow, 'quantity')).fill('2')
    await page.getByTestId('estimate-title').click()
    const own = await amountIn(subtotal)

    // The second session sets line 1's rate to 50.00 and saves.
    const other = await secondSession(browser)
    await openEstimateBySearch(other, memo)
    await expect(other.getByTestId('form-input-memo')).toHaveValue(memo)
    const rowId = await estimateLineRowId(other, 0)
    await other.getByTestId(lineCellTestId(rowId, 'rate')).fill('50.00')
    await other.getByTestId('estimate-title').click()
    await expect(other.getByTestId('estimate-total-subtotal')).toContainText('50.00')
    const saved = batchAnswered(other, 'books_estimates', 'PATCH', 200)
    await other.getByTestId('estimate-save').click()
    await saved

    await page.getByTestId('estimate-save').click()
    await expect(page.getByTestId('estimate-conflict')).toContainText(ESTIMATE_CONFLICT)
    await expect(subtotal).toContainText(own)

    // The other session's line is the stored one: the refused save wrote nothing over it.
    await page.getByTestId('estimate-conflict-reload').click()
    await expect(page.getByTestId('estimate-conflict')).toHaveCount(0)
    await expect(subtotal).toContainText('50.00')
    await expect(subtotal).not.toContainText('100.00')

    // The reviewed save goes through: quantity 2 at the other session's rate.
    const reloadedRow = await estimateLineRowId(page, 0)
    await page.getByTestId(lineCellTestId(reloadedRow, 'quantity')).fill('2')
    await page.getByTestId('estimate-title').click()
    await expect(subtotal).toContainText('100.00')
    const stored = batchAnswered(page, 'books_estimates', 'PATCH', 200)
    await page.getByTestId('estimate-save').click()
    await stored
    await expect(page.getByTestId('estimate-conflict')).toHaveCount(0)
    await other.context().close()
})
