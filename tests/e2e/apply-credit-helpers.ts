import { expect, type Locator, type Page } from '@playwright/test'
import {
    CREDIT_MEMO_URL,
    createCreditMemoFromInvoice,
    creditMemoIdFromUrl,
    creditMemoLineRowId,
    openCreditMemoBySearch,
    postCreditMemo,
} from './credit-memo-helpers'
import { createCustomer, customerPath, uniqueName } from './customer-form-helpers'
import { lineCellTestId, uniqueMemo } from './invoice-helpers'
import { shown } from './pay-bills-helpers'
import { fillInvoice, localDay, nonTaxableService, postInvoice } from './receive-payment-helpers'

// Shared steps of the apply-credit specs (apply credit spec §4.6): every test makes its own
// customer, posts its own invoices and its own credit memo through the UI with unique memos,
// and opens them again through Books search. No seeded invoice, memo or setting changes.

export type PostedDocument = { id: string; number: string; memo: string }

export type InvoiceInput = {
    // The invoice's one non-taxable service line, as typed ("400.00").
    rate: string
    // Days from today to the due date; the invoice is dated today.
    dueDays: number
}

export type MemoInput = {
    // The credit memo's one line, as typed ("250.00").
    rate: string
    // The index in `invoices` of the invoice the memo is made from ("Create credit memo" on
    // its read view), or null for a memo of its own, made through New → Credit memo.
    fromInvoice: number | null
}

// The number in a read view's title, "<noun> <n>".
async function titleNumber(title: Locator, noun: string): Promise<string> {
    const pattern = new RegExp(`^${noun} (\\d+)$`)
    await expect(title).toHaveText(pattern)
    const number = pattern.exec(await title.innerText())?.[1]
    if (!number) throw new Error(`the ${noun} title has no number`)
    return number
}

// On the customer page: posts one invoice of the customer from the New transaction menu and
// leaves the page on the invoice's read view.
async function postCustomerInvoice(
    page: Page,
    customerId: string,
    input: InvoiceInput,
    memo: string
): Promise<PostedDocument> {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customerId}$`))
    await page.getByTestId('form-input-memo').fill(memo)
    await fillInvoice(page, { dueDate: await localDay(page, input.dueDays), rate: input.rate })
    const posted = await postInvoice(page)
    return { ...posted, memo }
}

// On a posted invoice's read view: Create credit memo, the memo's one line at `rate`, a
// unique memo, Post. Leaves the page on the memo's read view.
async function postMemoFromInvoice(page: Page, rate: string, memo: string) {
    await createCreditMemoFromInvoice(page)
    const rowId = await creditMemoLineRowId(page, 0)
    await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(rate)
    await page.getByTestId('form-input-memo').fill(memo)
    await page.getByTestId('credit-memo-post').click()
    await expect(page).toHaveURL(CREDIT_MEMO_URL)
    await expect(shown(page, 'credit-memo-read-only')).toBeVisible()
    const number = await titleNumber(shown(page, 'credit-memo-title'), 'Credit memo')
    return { id: await creditMemoIdFromUrl(page), number, memo }
}

/**
 * Books must be open at desktop width. Creates a customer with a unique name (it starts with
 * `label`), posts one invoice for each input (dated today, due `dueDays` from today, each
 * with a unique memo), then posts a credit memo of the customer: made from the invoice
 * `memo.fromInvoice` (that invoice is posted last, so the memo starts from its read view),
 * or a memo of its own. Leaves the page on the posted memo's read view. `invoices` keeps the
 * order of the input.
 */
export async function customerWithInvoiceAndMemo(
    page: Page,
    input: { label: string; invoices: readonly InvoiceInput[]; memo: MemoInput }
): Promise<{
    name: string
    customerId: string
    invoices: PostedDocument[]
    memo: PostedDocument
}> {
    const name = uniqueName(input.label)
    await createCustomer(page, { name })
    const customerId = new URL(page.url()).pathname.split('/').pop() ?? ''
    const source = input.memo.fromInvoice
    const order = input.invoices.map((_, index) => index)
    // The source invoice goes last, so its read view is on screen when the memo starts.
    const posting = source === null ? order : [...order.filter(i => i !== source), source]
    const invoices: PostedDocument[] = []
    for (const [step, index] of posting.entries()) {
        if (step > 0) {
            await page.goBack()
            await expect(page).toHaveURL(customerPath(customerId))
            await expect(page.getByTestId('customer-transactions')).toBeVisible()
        }
        const memo = uniqueMemo(`${input.label} invoice ${index + 1}`)
        invoices[index] = await postCustomerInvoice(page, customerId, input.invoices[index], memo)
    }
    const memoText = uniqueMemo(`${input.label} credit memo`)
    const memo =
        source === null
            ? {
                  ...(await postCreditMemo(page, {
                      customer: name,
                      product: nonTaxableService(),
                      rate: input.memo.rate,
                      memo: memoText,
                  })),
                  memo: memoText,
              }
            : await postMemoFromInvoice(page, input.memo.rate, memoText)
    return { name, customerId, invoices, memo }
}

// The apply dialog (apply credit spec §3.2): a core Dialog, a Sheet on a phone (no dialog
// role there), so it is found by its test id.
export function applyDialogOf(page: Page) {
    return page.getByTestId('apply-credit-dialog')
}

// A listed invoice's (or credit memo's) Credit to apply cell in the apply dialog, the
// grid's or the card's.
export function applyCell(page: Page, rowId: string) {
    return page.getByTestId(`apply-credit-row-amount-${rowId}`)
}

// On a posted credit memo's read view: presses the bar's Apply to invoices and waits for
// the dialog.
export async function openApplyFromMemo(page: Page) {
    await shown(page, 'credit-memo-read-apply').click()
    await expect(applyDialogOf(page)).toBeVisible()
}

// On a posted invoice's read view at desktop width: presses the bar's Apply credit and
// waits for the dialog (apply credit spec §3.3).
export async function openApplyFromInvoice(page: Page) {
    await shown(page, 'invoice-read-apply').click()
    await expect(applyDialogOf(page)).toBeVisible()
}

/**
 * Books must already be open. Applies `amount` of the credit memo whose unique memo is
 * `memo` to one invoice: reopens the memo by search unless its read view is on screen,
 * opens the dialog, clears the spread, types the amount in the invoice's cell and presses
 * Apply credit; waits for the dialog to close and the Applied to block to show.
 */
export async function applyMemoToInvoice(
    page: Page,
    input: { memo: string; invoiceId: string; amount: string }
) {
    const readView = shown(page, 'credit-memo-read-only')
    const isOnScreen =
        (await readView.count()) === 1 && (await readView.innerText()).includes(input.memo)
    if (!isOnScreen) await openCreditMemoBySearch(page, input.memo)
    await openApplyFromMemo(page)
    const cell = applyCell(page, input.invoiceId)
    await expect(cell).toBeVisible()
    await page.getByTestId('apply-credit-clear').click()
    await expect(cell).toHaveValue('')
    await cell.fill(input.amount)
    await page.getByTestId('apply-credit-submit').click()
    await expect(applyDialogOf(page)).toHaveCount(0)
    await expect(shown(page, 'credit-memo-applications')).toBeVisible()
}
