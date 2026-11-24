import { expect, type Locator, type Page } from '@playwright/test'
import { lineCellTestId } from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'
import { openNewAction } from './new-menu-helpers'
import { pickFromSearchPicker } from './search-picker-helpers'

// A refund receipt's own screen: `books/refund-receipts/<id>`, never `.../new`.
export const REFUND_RECEIPT_URL = /\/books\/refund-receipts\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_REFUND_RECEIPT_URL = /\/books\/refund-receipts\/new(?:[?#].*)?$/

export function refundReceiptUrlOf(id: string) {
    return new RegExp(`/books/refund-receipts/${id}$`)
}

export function refundReceiptIdFromUrl(page: Page): string {
    const match = /\/books\/refund-receipts\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved refund receipt: ${page.url()}`)
    return id
}

// The in-app move a link with no button makes: the app's router reads the pushed URL,
// with no page load.
export async function pushPath(page: Page, path: string) {
    await page.evaluate(url => {
        window.history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
}

// A screen covered in the navigation stack stays mounted but hidden, so only the visible
// match counts.
export function visibleTestId(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

// Books must already be open. From the Journal Entries list through the New menu
// (tests/e2e/new-menu-helpers.ts) → Refund receipt.
export async function openNewRefundReceipt(page: Page) {
    await openEntriesList(page)
    await openNewAction(page, 'refund_receipt')
    await expect(page).toHaveURL(NEW_REFUND_RECEIPT_URL)
    await expect(page.getByTestId('refund-receipt-title')).toHaveText('New refund receipt')
}

export async function pickRefundCustomer(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-customer', name)
}

// The refund's line rows in screen order; each row's id is in its test id.
export function refundLineRows(page: Page) {
    return page
        .getByTestId('refund-receipt-lines')
        .locator('[data-testid^="form-table-lines-row-"]')
}

export async function refundLineRowId(page: Page, index: number): Promise<string> {
    const testId = await refundLineRows(page).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no line ${index + 1}`)
    return testId.slice('form-table-lines-row-'.length)
}

export async function pickRefundLineProduct(page: Page, index: number, name: string) {
    const rowId = await refundLineRowId(page, index)
    await pickFromSearchPicker(page, lineCellTestId(rowId, 'product'), name)
    return rowId
}

// A core SelectInput of the form, by its built-in key: opens it and picks the option.
export async function chooseRefundSelect(page: Page, key: string, label: string) {
    await page.getByTestId(`form-input-${key}`).click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(page.getByTestId(`form-input-${key}`)).toContainText(label)
}

// A refund's search option: "Draft refund receipt" (a draft has no entry, so its title is
// unique), or "Refund receipt <n>" / "Refund receipt <n> (void)" with " · <Customer>".
// The journal entry hits of a refund share its number but never name a customer, so a
// posted refund is found by search only when it has one.
const REFUND_OPTION = /^(Draft refund receipt|Refund receipt \d+( \(void\))? · )/

// Leaves the page on the refund's route without waiting for it to load, for a test whose
// load is meant to fail. Core's search palette opens with `/`.
export async function searchToRefundReceipt(page: Page, memo: string, title = REFUND_OPTION) {
    await page.keyboard.press('/')
    // The palette focuses its input a frame after it shows; keys typed before that frame
    // are lost.
    const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
    await expect(input).toBeFocused()
    const searched = page.waitForResponse(
        r =>
            r.url().includes('/api/search') &&
            r.status() === 200 &&
            new URL(r.url()).searchParams.get('q') === memo
    )
    await page.keyboard.type(memo)
    await searched
    await page.getByRole('option').filter({ hasText: title }).click()
    await expect(page).toHaveURL(REFUND_RECEIPT_URL)
}

// Reopens a refund receipt through core's search palette, by its memo.
export async function openRefundReceiptBySearch(page: Page, memo: string) {
    await searchToRefundReceipt(page, memo)
    await expect(
        page.getByTestId('refund-receipt-form').or(page.getByTestId('refund-receipt-read-only'))
    ).toBeVisible()
}

type RefundInput = {
    customer?: string
    product: string
    qty?: string
    rate?: string
    memo: string
}

// Fills a new refund of one line: the customer when given, the product, Qty and Rate when
// given, and the memo.
async function fillNewRefund(page: Page, input: RefundInput): Promise<string> {
    await openNewRefundReceipt(page)
    if (input.customer !== undefined) await pickRefundCustomer(page, input.customer)
    const rowId = await pickRefundLineProduct(page, 0, input.product)
    if (input.qty !== undefined) {
        await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill(input.qty)
    }
    if (input.rate !== undefined) {
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.rate)
    }
    await page.getByTestId('form-input-memo').fill(input.memo)
    return rowId
}

// Books must already be open. Leaves the page on the saved draft's form; returns its id.
export async function saveRefundDraft(page: Page, input: RefundInput): Promise<string> {
    await fillNewRefund(page, input)
    await page.getByTestId('refund-receipt-save-draft').click()
    await expect(page).toHaveURL(REFUND_RECEIPT_URL)
    await expect(page.getByTestId('refund-receipt-title')).toHaveText('Draft refund receipt')
    return refundReceiptIdFromUrl(page)
}

// Books must already be open. Posts a new refund of one line and leaves the page on its
// read view; returns its id and number.
export async function postRefundReceipt(
    page: Page,
    input: RefundInput
): Promise<{ id: string; number: string }> {
    await fillNewRefund(page, input)
    await page.getByTestId('refund-receipt-post').click()
    await expect(page).toHaveURL(REFUND_RECEIPT_URL)
    await expect(page.getByTestId('refund-receipt-read-only')).toBeVisible()
    const title = page.getByTestId('refund-receipt-title')
    await expect(title).toHaveText(/^Refund receipt \d+$/)
    const number = /^Refund receipt (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return { id: refundReceiptIdFromUrl(page), number }
}
