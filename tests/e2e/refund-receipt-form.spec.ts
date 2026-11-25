import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { batchWriteIndex } from './document-batch-helpers'
import { lineCellTestId, localToday, uniqueMemo } from './invoice-helpers'
import { refuseBatchOperation } from './journal-entries-helpers'
import { expectNotRecordUrl, expectRecordUrl } from './record-key-helpers'
import {
    NEW_REFUND_RECEIPT_URL,
    openNewRefundReceipt,
    pickRefundCustomer,
    pickRefundLineProduct,
    pushPath,
    REFUND_RECEIPT_URL,
    refundLineRowId,
    refundLineRows,
    refundReceiptIdFromUrl,
    searchToRefundReceipt,
    visibleTestId,
} from './refund-receipt-helpers'
import { pickNoCustomer } from './sales-receipt-helpers'

// The refund receipt form and its read view (refund receipt spec §3.2–§3.10). Every
// refund is made by driving the form with a unique memo and the default date; refunds are
// found again through the URL a save lands on or by search (core's palette opens with
// `/`). No seeded refund, customer, product or account is changed. Refusals the server
// gives for state this spec cannot make (an inactive Refund from, a refused line, a root
// text) are forced with a 400 of the server's shape; the Go tests cover the server's own
// refusals. Desktop only: the phone path's own code (cards, More sheets) is the sales
// receipt's and the credit memo's, which their specs drive at phone size.

const MONEY = /-?\$[\d,]+\.\d{2}/
const CHECKING = '1000 Business Checking'
const NEED_ITEM_LINE = 'Add at least one product or service line'
const ZERO_TOTAL =
    'A refund receipt with a total of zero cannot be posted. Add an amount or keep it as a draft.'
const REFUND_FROM_REFUSAL = 'Choose an active bank or Undeposited funds account.'
const ROOT_REFUSAL = 'The date is on or before the close date.'

function customerName(id: string) {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    return row.display_name
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

const HARBORVIEW = customerName(CUSTOMER_IDS.harborview)
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
// The Item line is line 2: the refusals test's first Post drops the starting empty Item
// line, so its Description line is line 1 and the added Item line comes after it.
const LINE_REFUSAL = `Line 2: ${ACCESS_POINT} is inactive. Choose an active product or service.`

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

async function moneyIn(locator: Locator): Promise<string> {
    const amount = MONEY.exec(await locator.innerText())?.[0]
    if (!amount) throw new Error('no amount in the element')
    return amount
}

// Refuses every write of a refund receipt row the page sends with a 400 of `body`: a
// request of its own (the post's status update), or the refund's operation in a batch
// (a save's header write). Every other request passes.
async function refuseRefundWrites(page: Page, body: { message: string; data: object }) {
    await page.route('**/api/**', route => {
        const request = route.request()
        if (request.method() === 'GET') return route.fallback()
        const path = new URL(request.url()).pathname
        if (/^\/api\/collections\/books_refund_receipts\/records/.test(path)) {
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        }
        const index = Math.max(
            batchWriteIndex(request, 'books_refund_receipts', 'POST'),
            batchWriteIndex(request, 'books_refund_receipts', 'PATCH')
        )
        if (index < 0) return route.fallback()
        return refuseBatchOperation(route, index, { status: 400, ...body })
    })
}

test.describe('refund-receipt-form: form and read view', () => {
    test('a posted walk-in refund is corrected, copied and voided', async ({ page }) => {
        const memo = uniqueMemo('Refund walk-in correction')
        await openBooks(page)
        await openNewRefundReceipt(page)
        await pickNoCustomer(page)
        const rowId = await pickRefundLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill('100')
        // A reference on the original, so the copy's empty reference below is a real check.
        await page.getByTestId('form-input-reference_no').fill('Check 5521')
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('refund-receipt-post').click()
        await expect(page).toHaveURL(REFUND_RECEIPT_URL)
        await expect(page.getByTestId('refund-receipt-read-only')).toBeVisible()
        await expect(page.getByTestId('refund-receipt-detail-payment')).toContainText('Check 5521')
        const title = page.getByTestId('refund-receipt-title')
        await expect(title).toHaveText(/^Refund receipt \d+$/)
        const number = /^Refund receipt (\d+)$/.exec(await title.innerText())?.[1] ?? ''
        const id = await refundReceiptIdFromUrl(page)
        await expect(page.getByTestId('refund-receipt-detail-customer')).toContainText(
            'No customer'
        )

        // E opens the correction; a changed rate posts under the same number.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/refund-receipts/new\\?replaces=${id}$`))
        await expect(page.getByTestId('refund-receipt-title')).toHaveText(`Edit ${number}`)
        const correctionRow = await refundLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(correctionRow, 'rate')).fill('120')
        await page.getByTestId('refund-receipt-post').click()
        await expect(page).toHaveURL(REFUND_RECEIPT_URL)
        await expectNotRecordUrl(page, 'refund-receipts', id)
        await expect(visibleTestId(page, 'refund-receipt-read-only')).toBeVisible()
        await expect(visibleTestId(page, 'refund-receipt-title')).toHaveText(
            `Refund receipt ${number}`
        )
        await expect(visibleTestId(page, 'refund-receipt-total-subtotal')).toContainText('$120.00')
        const correctionId = await refundReceiptIdFromUrl(page)

        // The original (a walk-in has no customer, so search does not list it) is void and
        // names its correction.
        await pushPath(page, `/a/books/refund-receipts/${id}`)
        await expectRecordUrl(page, 'refund-receipts', id)
        await expect(visibleTestId(page, 'refund-receipt-badge')).toHaveText('Void')
        await expect(visibleTestId(page, 'refund-receipt-replaced-by')).toHaveText(
            `Replaced by ${number} (edited)`
        )

        // C: a new draft with the same line and Refund from, today's date, no reference
        // and no memo.
        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/books/refund-receipts/new\\?copy=${id}$`))
        await expect(page.getByTestId('refund-receipt-title')).toHaveText('New refund receipt')
        const copyRow = await refundLineRowId(page, 0)
        await expect(page.getByTestId(lineCellTestId(copyRow, 'product'))).toContainText(
            ACCESS_POINT
        )
        await expect(page.getByTestId(lineCellTestId(copyRow, 'rate'))).toHaveValue(/^100(\.00)?$/)
        await expect(page.getByTestId('form-input-refund_from')).toContainText(CHECKING)
        await expect(page.getByTestId('form-input-date')).toHaveValue(await localToday(page))
        await expect(page.getByTestId('form-input-reference_no')).toHaveValue('')
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')

        // Back on the correction, V voids it: the badge reads Void, and Edit and Void are
        // gone. Escape leaves the clean copy with no discard dialog (the copy replaced the
        // read view, so Back goes to the screen below it); the original's Replaced by link
        // opens the correction.
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(/\/books\/refund-receipts\/new\?copy=/)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await pushPath(page, `/a/books/refund-receipts/${id}`)
        await expectRecordUrl(page, 'refund-receipts', id)
        await visibleTestId(page, 'refund-receipt-replaced-by').click()
        await expectRecordUrl(page, 'refund-receipts', correctionId)
        await expect(visibleTestId(page, 'refund-receipt-badge')).toHaveText('Posted')
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(number)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(visibleTestId(page, 'refund-receipt-badge')).toHaveText('Void')
        await expect(visibleTestId(page, 'refund-receipt-voided-by')).toBeVisible()
        await expect(visibleTestId(page, 'refund-receipt-read-edit')).toHaveCount(0)
        await expect(visibleTestId(page, 'refund-receipt-read-void')).toHaveCount(0)
        await expect(visibleTestId(page, 'refund-receipt-read-copy')).toBeVisible()
    })

    test('a refused post shows each refusal in its place', async ({ page }) => {
        const memo = uniqueMemo('Refund refusals')
        await openBooks(page)
        await openNewRefundReceipt(page)
        await pickRefundCustomer(page, HARBORVIEW)
        const post = page.getByTestId('refund-receipt-post')
        const summary = page.getByTestId('refund-receipt-error-summary')

        // Post with the starting empty Item line: the save drops that trailing empty line
        // before validation, so the table rule reads Lines is required and the line has no
        // product refusal.
        await post.click()
        await expect(page.getByTestId('form-field-lines-error')).toHaveText('Lines is required')
        await expect(page.getByText('Product or service is required')).toHaveCount(0)
        await expect(page).toHaveURL(NEW_REFUND_RECEIPT_URL)

        // A Description line alone (the dropped Item line stays gone, so it is line 1):
        // Post's item-line rule shows under the table, not in the summary.
        await page.getByTestId('form-table-lines-add-more').click()
        await page.getByTestId('form-table-lines-add-description').click()
        await expect(refundLineRows(page)).toHaveCount(1)
        const descriptionRow = await refundLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(descriptionRow, 'description')).fill('Returned goods')
        await post.click()
        await expect(page.getByTestId('form-field-lines-error')).toHaveText(NEED_ITEM_LINE)
        await expect(summary).toHaveCount(0)
        await expect(page).toHaveURL(NEW_REFUND_RECEIPT_URL)

        // An Item line at rate 0: the zero-total text in the summary.
        await page.getByTestId('form-table-lines-add').click()
        const rowId = await pickRefundLineProduct(page, 1, ACCESS_POINT)
        const rate = page.getByTestId(lineCellTestId(rowId, 'rate'))
        await rate.fill('0')
        await page.getByTestId('form-input-memo').fill(memo)
        await post.click()
        await expect(summary).toContainText(ZERO_TOTAL)
        await expect(page.getByTestId('refund-receipt-form')).toBeVisible()
        await rate.fill('80')

        // Refund from refused: the text under Refund from, its Balance line still there.
        await refuseRefundWrites(page, {
            message: 'Failed to update record.',
            data: { refund_from: { code: 'validation_invalid', message: REFUND_FROM_REFUSAL } },
        })
        await post.click()
        await expect(page.getByTestId('form-field-refund_from-error')).toHaveText(
            REFUND_FROM_REFUSAL
        )
        await expect(page.getByTestId('refund-receipt-refund-from-balance')).toBeVisible()
        await expect(page.getByTestId('refund-receipt-form')).toBeVisible()
        await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(ACCESS_POINT)
        await expect(rate).toHaveValue(/^80(\.00)?$/)
        await expect(page.getByTestId('form-input-memo')).toHaveValue(memo)
        await page.unrouteAll({ behavior: 'wait' })

        // A "Line 2: …" refusal shows under line 2 (the Item line), once.
        await refuseRefundWrites(page, { message: LINE_REFUSAL, data: {} })
        await post.click()
        const row = page
            .getByTestId('refund-receipt-lines')
            .getByTestId(`form-table-lines-row-${rowId}`)
        await expect(row.getByText(LINE_REFUSAL, { exact: true })).toHaveCount(1)
        await expect(page.getByTestId(lineCellTestId(rowId, 'product'))).toContainText(ACCESS_POINT)
        await page.unrouteAll({ behavior: 'wait' })

        // A root text shows in the summary only.
        await refuseRefundWrites(page, { message: ROOT_REFUSAL, data: {} })
        await post.click()
        await expect(summary).toContainText(ROOT_REFUSAL)
        await expect(page.getByText(ROOT_REFUSAL, { exact: true })).toHaveCount(1)
        await expect(row.getByText(ROOT_REFUSAL)).toHaveCount(0)
        await expect(page.getByTestId('form-input-memo')).toHaveValue(memo)
        await page.unrouteAll({ behavior: 'wait' })

        // With the routes gone the same form posts.
        await post.click()
        await expect(page).toHaveURL(REFUND_RECEIPT_URL)
        await expect(page.getByTestId('refund-receipt-read-only')).toBeVisible()
        await expect(page.getByTestId('refund-receipt-badge')).toHaveText('Posted')
        await expect(page.getByTestId('refund-receipt-total-subtotal')).toContainText('$80.00')
        expect(await moneyIn(page.getByTestId('refund-receipt-total-refunded'))).toBe(
            await moneyIn(page.getByTestId('refund-receipt-total'))
        )
    })

    // A fresh page for the failing read: on a page that already showed the refund,
    // pbtsdb's grace window serves the held rows with no request, so the routed failure
    // never happens. Realtime is cut before login on each page (lesson 22).
    test('leaving, the PDF tab and a failed load', async ({ context }) => {
        const memo = uniqueMemo('Refund leave pdf retry')
        const page = await context.newPage()
        await page.route('**/api/realtime*', route => route.abort())
        await openBooks(page)
        await openNewRefundReceipt(page)

        // ⌥2 before a save: the PDF tab asks for a draft.
        await page.getByTestId('refund-receipt-title').click()
        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('refund-receipt-pdf-unsaved')).toContainText(
            'Save a draft to see the PDF'
        )
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('refund-receipt-form')).toBeVisible()

        await pickRefundCustomer(page, HARBORVIEW)
        await pickRefundLineProduct(page, 0, ACCESS_POINT)
        const memoInput = page.getByTestId('form-input-memo')
        await memoInput.fill(memo)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(REFUND_RECEIPT_URL)
        await expect(page.getByTestId('refund-receipt-title')).toHaveText('Draft refund receipt')
        const id = await refundReceiptIdFromUrl(page)

        // Saved: the PDF tab draws the stored draft.
        const pdf = page.waitForResponse(r =>
            new URL(r.url()).pathname.endsWith(`/api/books/pdf/refund_receipt/${id}`)
        )
        await page.getByTestId('refund-receipt-title').click()
        await page.keyboard.press('Alt+2')
        expect((await pdf).status()).toBe(200)
        await expect(page.getByTestId('refund-receipt-pdf')).toBeVisible()
        await expect(page.getByTestId('refund-receipt-pdf-stale')).toHaveCount(0)
        await page.keyboard.press('Alt+1')

        // One more edit: the PDF shows the last saved version.
        await memoInput.fill(`${memo} edited`)
        await page.getByTestId('refund-receipt-title').click()
        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('refund-receipt-pdf-stale')).toHaveText(
            'Shows the last saved version'
        )
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('refund-receipt-form')).toBeVisible()

        // Cancel on the dirty form asks first; Discard returns to the Journal Entries list
        // the form was opened from.
        await page.getByTestId('refund-receipt-cancel').click()
        const discard = page.getByTestId('discard-dialog')
        await expect(discard).toBeVisible()
        await expectRecordUrl(page, 'refund-receipts', id)
        await page.getByTestId('discard-confirm').click()
        await expect(discard).toHaveCount(0)
        await expect(page).not.toHaveURL(/\/books\/refund-receipts\//)
        await expect(visibleTestId(page, 'entries-screen')).toBeVisible()

        // A fresh page with the refund's read refused: the load error with Retry.
        const second = await context.newPage()
        await second.route('**/api/realtime*', route => route.abort())
        await second.route('**/api/collections/books_refund_receipts/records*', route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Something went wrong.', data: {} }),
            })
        )
        await openBooks(second)
        await searchToRefundReceipt(second, memo)
        await expectRecordUrl(second, 'refund-receipts', id)
        await expect(second.getByTestId('refund-receipt-error')).toContainText(
            'Books could not load this refund receipt.'
        )
        await expect(second.getByTestId('refund-receipt-retry')).toBeVisible()
        await expect(second.getByTestId('refund-receipt-form')).toHaveCount(0)
        await second.unrouteAll({ behavior: 'wait' })
        await second.route('**/api/realtime*', route => route.abort())
        await second.getByTestId('refund-receipt-retry').click()
        await expect(second.getByTestId('refund-receipt-form')).toBeVisible()
        await expect(second.getByTestId('form-input-memo')).toHaveValue(memo)
        const storedRow = await refundLineRowId(second, 0)
        await expect(second.getByTestId(lineCellTestId(storedRow, 'product'))).toContainText(
            ACCESS_POINT
        )
        await expect(second.getByTestId('form-input-customer')).toContainText(HARBORVIEW)

        // A fresh page with the products load refused: the draft's lines read its line's
        // product from books_products, so the load error shows with Retry, and Retry with
        // the route gone shows the stored product on line 1.
        const third = await context.newPage()
        await third.route('**/api/realtime*', route => route.abort())
        await third.route('**/api/collections/books_products/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openBooks(third)
        await searchToRefundReceipt(third, memo)
        await expectRecordUrl(third, 'refund-receipts', id)
        await expect(third.getByTestId('refund-receipt-error')).toContainText(
            'Books could not load this refund receipt.'
        )
        await expect(third.getByTestId('refund-receipt-retry')).toBeVisible()
        await third.unrouteAll({ behavior: 'wait' })
        await third.route('**/api/realtime*', route => route.abort())
        await third.getByTestId('refund-receipt-retry').click()
        await expect(third.getByTestId('refund-receipt-form')).toBeVisible()
        await expect(third.getByTestId('form-input-memo')).toHaveValue(memo)
        const productRow = await refundLineRowId(third, 0)
        await expect(third.getByTestId(lineCellTestId(productRow, 'product'))).toContainText(
            ACCESS_POINT
        )
    })
})
