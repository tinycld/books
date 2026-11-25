import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import {
    applyCell,
    applyDialogOf,
    applyMemoToInvoice,
    customerWithInvoiceAndMemo,
} from './apply-credit-helpers'
import { creditMemoLineRowId, openCreditMemoBySearch, postCreditMemo } from './credit-memo-helpers'
import { createCustomer, uniqueName } from './customer-form-helpers'
import { batchWriteIndex } from './document-batch-helpers'
import { lineCellTestId, localToday, uniqueMemo } from './invoice-helpers'
import { BATCH_WRITE, refuseBatchOperation, settleFrames } from './journal-entries-helpers'
import { shown } from './pay-bills-helpers'
import { nonTaxableService } from './receive-payment-helpers'
import { expectRecordUrl, recordIdFromUrl } from './record-key-helpers'

// Applying a posted credit memo to its customer's open invoices (apply credit spec §3.1,
// §3.2, §3.4, §3.5, §3.7), checkpoint 3: the memo's Apply to invoices action (A) and
// notice, the shared apply dialog, the Applied row, the badge, the Applied to block, Remove,
// and the void and correction refusals of an applied memo. Every test makes its own
// customer, invoices and memo through the UI (`customerWithInvoiceAndMemo`), so no other
// worker's invoice is in its dialog and no seeded balance moves.
//
// Not driven here: the phone Sheet and cards (checkpoint 4's phone run, the same dialog),
// the grid's shared keys and the calendar (tests/e2e/vendor-credit-form-apply.spec.ts, the
// same code), a create refusal of the server (the dialog's live figures make the client
// rule fire first; Go tests pin the server texts), the offline and loading states and each
// text (tests/apply-credit-schema.test.ts, tests/credit-application-kinds.test.ts).

const MINUS = '−'
const MEMO_VOID_REFUSED = 'This credit is applied to invoices. Remove it from those invoices first.'
const INVOICES_LOAD_FAILED = 'Books could not load the open invoices.'
const APPLICATIONS_LOAD_FAILED = 'Books could not load where this credit is applied.'
const APPLICATIONS = 'books_credit_memo_applications'
const REMOVE_BUTTONS = '[data-testid^="credit-memo-application-remove-"]'
const APPLICATION_ROWS =
    '[data-testid^="credit-memo-application-"]:not([data-testid^="credit-memo-application-remove-"])'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

function noticeText(customer: string, invoices: number) {
    const count = invoices === 1 ? '1 open invoice' : `${invoices} open invoices`
    return `${customer} has ${count}. Apply this credit to lower what they owe.`
}

function removeText(invoiceNumber: string, amount: string) {
    return `Remove this credit from Invoice ${invoiceNumber}? The invoice's balance goes up by ${amount} and the credit is unapplied again.`
}

// The Applied to block's rows (not their Remove buttons).
function applicationRows(block: Locator) {
    return block.locator(APPLICATION_ROWS)
}

// The open-invoices read of useOutstandingInvoices (the dialog's list and the notice's
// count): `customer = X && status = "posted" && balance > 0`. The memo's own reads of
// books_invoices (its "For invoice" row, `id = ...`) do not match.
const OPEN_INVOICES_FILTER = /balance\s*>\s*0/

// The request's PocketBase filter, decoded ('' when it has none).
function filterOf(url: string) {
    return new URL(url).searchParams.get('filter') ?? ''
}

// A refused GET of a collection's records whose filter matches `filter` (every GET when
// none is given); every other request passes.
async function refuseReads(page: Page, collection: string, filter?: RegExp) {
    await page.route(`**/api/collections/${collection}/records*`, route =>
        route.request().method() === 'GET' &&
        (!filter || filter.test(filterOf(route.request().url())))
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify({ status: 400, message: 'Refused.', data: {} }),
              })
            : route.fallback()
    )
}

// A second page of the same context, with realtime cut before login (lesson 1) and the
// collection's reads refused (those whose filter matches `filter`, when given). Its store
// holds nothing yet, so the reads are made.
async function pageWithRefusedReads(page: Page, collection: string, filter?: RegExp) {
    const other = await page.context().newPage()
    await other.route('**/api/realtime*', route => route.abort())
    await refuseReads(other, collection, filter)
    await openBooks(other)
    return other
}

// Lifts the page's refusals and cuts realtime again (rows other workers write must not
// reach the page through it).
async function liftRefusals(page: Page) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.route('**/api/realtime*', route => route.abort())
}

// Refuses every delete of an application with a message-only 400, as PocketBase answers
// the ledger's close-date refusal: a batch's refused operation or a delete of its own.
async function refuseApplicationDelete(page: Page, message: string) {
    const response = { status: 400, message, data: {} }
    await page.route(BATCH_WRITE, route => {
        const index = batchWriteIndex(route.request(), APPLICATIONS, 'DELETE')
        if (index < 0) return route.continue()
        return refuseBatchOperation(route, index, response)
    })
    await page.route(`**/api/collections/${APPLICATIONS}/records/*`, route =>
        route.request().method() === 'DELETE'
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify(response),
              })
            : route.fallback()
    )
}

test.describe('apply-credit: from a credit memo', () => {
    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('applies the whole credit to its invoice with one key, no click', async ({ page }) => {
        await openBooks(page)
        const { invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Apply one key',
            invoices: [{ rate: '400.00', dueDays: 30 }],
            memo: { rate: '250.00', fromInvoice: 0 },
        })
        const [invoice] = invoices
        const today = formatDay(await localToday(page))

        // From the memo's read view on, no click. A: the dialog with the credit spread on
        // the invoice and the focus in its Credit to apply cell.
        await page.keyboard.press('a')
        const dialog = applyDialogOf(page)
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Apply credit memo ${memo.number}`)
        await expect(dialog).toContainText('Unapplied credit')
        await expect(page.getByTestId('apply-credit-figure')).toContainText('$250.00')
        const cell = applyCell(page, invoice.id)
        await expect(cell).toBeFocused()
        await expect(cell).toHaveValue('250.00')

        // ⌘↵: Apply credit.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog).toHaveCount(0)
        await expect(page.getByText('Applied $250.00 to 1 invoice', { exact: true })).toBeVisible()
        await expect(shown(page, 'credit-memo-total-applied')).toContainText(`${MINUS}$250.00`)
        await expect(shown(page, 'credit-memo-badge')).toHaveText('Applied')
        const block = shown(page, 'credit-memo-applications')
        await expect(applicationRows(block)).toHaveCount(1)
        await expect(applicationRows(block)).toContainText(
            `Invoice ${invoice.number} · ${today} · $250.00`
        )

        // Applied in full: no Apply to invoices, and A opens nothing.
        await expect(page.getByTestId('credit-memo-read-apply')).toHaveCount(0)
        await page.keyboard.press('a')
        await settleFrames(page)
        await expect(dialog).toHaveCount(0)
    })

    test('applies a part of an invoice by a typed amount', async ({ page }) => {
        await openBooks(page)
        // The memo is made from the invoice due later, so only its "made from" rule puts it
        // first in the list.
        const { name, invoices } = await customerWithInvoiceAndMemo(page, {
            label: 'Apply part',
            invoices: [
                { rate: '400.00', dueDays: 10 },
                { rate: '400.00', dueDays: 30 },
            ],
            memo: { rate: '250.00', fromInvoice: 1 },
        })
        const [other, source] = invoices
        const today = formatDay(await localToday(page))

        const notice = shown(page, 'credit-memo-apply-notice')
        await expect(notice).toContainText(noticeText(name, 2))
        await shown(page, 'credit-memo-apply-notice-action').click()
        const dialog = applyDialogOf(page)
        await expect(dialog).toBeVisible()

        // The invoice the memo was made from is the first row.
        const cells = page.locator('[data-testid^="apply-credit-row-amount-"]')
        await expect(cells).toHaveCount(2)
        await expect(cells.first()).toHaveAttribute(
            'data-testid',
            `apply-credit-row-amount-${source.id}`
        )
        const sourceCell = applyCell(page, source.id)
        const otherCell = applyCell(page, other.id)

        // The client rule: above the invoice's open balance, under its cell; the dialog
        // stays.
        await sourceCell.fill('500.00')
        await page.getByTestId('apply-credit-submit').click()
        await expect(page.getByTestId(`apply-credit-row-error-${source.id}`)).toHaveText(
            'More than the open balance of $400.00'
        )
        await expect(dialog).toBeVisible()

        // $150.00 typed on the first invoice; the second ticked (the credit left, $100.00)
        // and cleared again by its tick box.
        await sourceCell.fill('150.00')
        const otherTick = page.getByTestId(`apply-credit-row-tick-${other.id}`)
        await otherTick.click()
        await expect(otherCell).toHaveValue('100.00')
        await otherTick.click()
        await expect(otherCell).toHaveValue('')
        await expect(page.getByTestId('apply-credit-summary')).toHaveText(
            'Applying $150.00 to 1 invoice · $100.00 stays unapplied'
        )
        await page.getByTestId('apply-credit-submit').click()
        await expect(dialog).toHaveCount(0)

        await expect(shown(page, 'credit-memo-badge')).toHaveText('Partly applied')
        await expect(shown(page, 'credit-memo-total-applied')).toContainText(`${MINUS}$150.00`)
        await expect(shown(page, 'credit-memo-total-unapplied')).toContainText('$100.00')

        // The row's link opens the invoice: $250.00 still due, and not Paid.
        const row = applicationRows(shown(page, 'credit-memo-applications'))
        await expect(row).toHaveCount(1)
        await expect(row).toContainText(`Invoice ${source.number} · ${today} · $150.00`)
        await row.getByText(new RegExp(`^Invoice ${source.number} · `)).click()
        await expectRecordUrl(page, 'invoices', source.id)
        await expect(shown(page, 'invoice-total-balance')).toContainText('$250.00')
        await expect(shown(page, 'invoice-badge')).toHaveText('Partly paid')
    })

    test('Remove gives the credit back to the memo', async ({ page }) => {
        await openBooks(page)
        const { invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Apply remove',
            invoices: [{ rate: '400.00', dueDays: 30 }],
            memo: { rate: '250.00', fromInvoice: 0 },
        })
        const [invoice] = invoices
        await applyMemoToInvoice(page, { memo: memo.memo, invoiceId: invoice.id, amount: '150.00' })
        const block = shown(page, 'credit-memo-applications')
        await expect(applicationRows(block)).toHaveCount(1)

        await block.locator(REMOVE_BUTTONS).first().click()
        const confirm = page.getByTestId('remove-application-dialog')
        await expect(confirm).toBeVisible()
        await expect(confirm).toContainText(removeText(invoice.number, '$150.00'))
        await page.getByTestId('remove-application-confirm').click()
        await expect(confirm).toHaveCount(0)

        await expect(shown(page, 'credit-memo-applications')).toHaveCount(0)
        await expect(shown(page, 'credit-memo-badge')).toHaveText('Posted')
        await expect(shown(page, 'credit-memo-total-applied')).toHaveCount(0)
        await expect(shown(page, 'credit-memo-read-apply')).toBeVisible()
    })

    test('an applied memo refuses a void and a correction below what is applied; a memo with no open invoice shows the empty dialog', async ({
        page,
    }) => {
        await openBooks(page)
        const { invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Apply void',
            invoices: [{ rate: '400.00', dueDays: 30 }],
            memo: { rate: '250.00', fromInvoice: 0 },
        })
        const [invoice] = invoices
        await applyMemoToInvoice(page, { memo: memo.memo, invoiceId: invoice.id, amount: '150.00' })
        await expect(shown(page, 'credit-memo-badge')).toHaveText('Partly applied')

        // Void: refused in the void dialog; the memo stays posted.
        await page.keyboard.press('v')
        const voidDialog = page.getByTestId('void-dialog')
        await expect(voidDialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(voidDialog.getByTestId('entry-error-summary')).toContainText(MEMO_VOID_REFUSED)
        await page.keyboard.press('Escape')
        await expect(voidDialog).toHaveCount(0)
        await expect(shown(page, 'credit-memo-badge')).toHaveText('Partly applied')

        // A second customer with no open invoice and its posted credit memo, on a fresh page
        // of the same context: this page's stack holds the first customer's whole journey,
        // and the Books helpers start from a shallow stack (the dashboard, the Lists hub, then Customers, then
        // Journal Entries). Nothing is refused there; realtime stays on. A opens the dialog
        // with the empty text and no Apply credit to press.
        const fresh = await page.context().newPage()
        await openBooks(fresh)
        const lone = uniqueName('Apply empty')
        await createCustomer(fresh, { name: lone })
        const loneId = await recordIdFromUrl(fresh, 'customers')
        await postCreditMemo(fresh, {
            customer: lone,
            product: nonTaxableService(),
            rate: '120.00',
            memo: uniqueMemo('Apply empty credit memo'),
        })
        await fresh.keyboard.press('a')
        const dialog = applyDialogOf(fresh)
        await expect(dialog).toBeVisible()
        await expect(fresh.getByTestId('apply-credit-empty')).toContainText(
            `${lone} has no open invoices. The credit stays on the customer until you post an invoice or refund it.`
        )
        await expect(dialog.getByTestId('apply-credit-submit')).toBeDisabled()

        // New invoice closes the dialog and opens the invoice form with the customer filled.
        await fresh.getByTestId('apply-credit-new-invoice').click()
        await expect(dialog).toHaveCount(0)
        await expect(fresh).toHaveURL(
            new RegExp(`/books/invoices/new\\?(?:.*&)?customer=${loneId}(?:&.*)?$`)
        )
        await expect(shown(fresh, 'invoice-form')).toBeVisible()
        await expect(shown(fresh, 'form-input-customer')).toContainText(lone)

        // The `?customer=` prefill is the form's start value, not an edit: Escape leaves
        // the new invoice with no Discard question.
        await fresh.keyboard.press('Escape')
        await expect(fresh.getByTestId('invoice-form')).toHaveCount(0)
        await expect(fresh.getByTestId('discard-dialog')).toHaveCount(0)
        await fresh.close()

        // A correction of the applied memo with a total below the $150.00 applied: refused
        // in the form's summary, and the form stays.
        await openCreditMemoBySearch(page, memo.memo)
        await expect(shown(page, 'credit-memo-read-only')).toBeVisible()
        await page.keyboard.press('e')
        const correctionUrl = new RegExp(`/books/credit-memos/new\\?replaces=${memo.id}$`)
        await expect(page).toHaveURL(correctionUrl)
        const rowId = await creditMemoLineRowId(page, 0)
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill('100.00')
        await page.getByTestId('credit-memo-post').click()
        await expect(page.getByTestId('credit-memo-error-summary')).toContainText(
            '$150.00 of this credit is applied to invoices. Its total cannot be below that.'
        )
        await expect(page).toHaveURL(correctionUrl)
        await expect(page.getByTestId('credit-memo-form')).toBeVisible()
    })

    test('failed reads show Retry, and a refused Remove keeps the row', async ({ page }) => {
        await openBooks(page)
        const { invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Apply failed reads',
            invoices: [{ rate: '400.00', dueDays: 30 }],
            memo: { rate: '250.00', fromInvoice: null },
        })
        const [invoice] = invoices
        const today = await localToday(page)
        await applyMemoToInvoice(page, { memo: memo.memo, invoiceId: invoice.id, amount: '150.00' })

        // A refused open-invoices read: the dialog shows its load error with Apply credit
        // disabled; Retry, with the refusal lifted, lists the invoice.
        const refused = await pageWithRefusedReads(page, 'books_invoices', OPEN_INVOICES_FILTER)
        await openCreditMemoBySearch(refused, memo.memo)
        await expect(shown(refused, 'credit-memo-read-only')).toBeVisible()
        await refused.keyboard.press('a')
        await expect(applyDialogOf(refused)).toBeVisible()
        await expect(refused.getByTestId('apply-credit-load-error')).toContainText(
            INVOICES_LOAD_FAILED
        )
        await expect(refused.getByTestId('apply-credit-submit')).toBeDisabled()
        await liftRefusals(refused)
        await refused.getByTestId('apply-credit-load-retry').click()
        await expect(applyCell(refused, invoice.id)).toBeVisible()
        await expect(refused.getByTestId('apply-credit-load-error')).toHaveCount(0)
        await refused.unrouteAll({ behavior: 'wait' })
        await refused.close()

        // A refused applications read: the block shows its notice with Retry and no rows;
        // Retry, with the refusal lifted, shows the row.
        const failed = await pageWithRefusedReads(page, APPLICATIONS)
        await openCreditMemoBySearch(failed, memo.memo)
        await expect(shown(failed, 'credit-memo-read-only')).toBeVisible()
        const failedBlock = shown(failed, 'credit-memo-applications')
        const banner = failedBlock.getByTestId('credit-memo-applications-banner')
        const retry = failedBlock.getByTestId('credit-memo-applications-retry')
        await expect(banner).toContainText(APPLICATIONS_LOAD_FAILED)
        await expect(retry).toBeVisible()
        await expect(applicationRows(failedBlock)).toHaveCount(0)
        await liftRefusals(failed)
        await retry.click()
        await expect(applicationRows(failedBlock)).toHaveCount(1)
        await expect(banner).toHaveCount(0)
        await expect(failedBlock).toContainText(
            `Invoice ${invoice.number} · ${formatDay(today)} · $150.00`
        )
        await failed.unrouteAll({ behavior: 'wait' })
        await failed.close()

        // A delete refused as the ledger refuses a closed day: the text in the dialog, the
        // dialog stays, and the row is still in the block.
        const closed = `The books are closed through ${today}. Ask a Books admin for a close-date override to post on ${today}.`
        await refuseApplicationDelete(page, closed)
        const block = shown(page, 'credit-memo-applications')
        await block.locator(REMOVE_BUTTONS).first().click()
        const confirm = page.getByTestId('remove-application-dialog')
        await expect(confirm).toBeVisible()
        await page.getByTestId('remove-application-confirm').click()
        await expect(confirm).toContainText(closed)
        await expect(confirm).toBeVisible()
        await expect(applicationRows(block)).toHaveCount(1)
        await expect(block).toContainText(`Invoice ${invoice.number} · ${formatDay(today)}`)
    })
})
