import { expect, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'
import { lineCellTestId } from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'
import { pickFromSearchPicker } from './search-picker-helpers'

// A credit memo's own screen: `books/credit-memos/<id>`, never `.../new`.
export const CREDIT_MEMO_URL = /\/books\/credit-memos\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_CREDIT_MEMO_URL = /\/books\/credit-memos\/new(?:[?#].*)?$/

export function creditMemoUrlOf(id: string) {
    return new RegExp(`/books/credit-memos/${id}$`)
}

export function creditMemoIdFromUrl(page: Page): string {
    const match = /\/books\/credit-memos\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved credit memo: ${page.url()}`)
    return id
}

// Books must already be open. From the Journal Entries list through the New menu (the
// phone FAB, or the desktop header's New text) → Credit memo.
export async function openNewCreditMemo(page: Page) {
    await openEntriesList(page)
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-credit-memo').click()
    await expect(page).toHaveURL(NEW_CREDIT_MEMO_URL)
    await expect(page.getByTestId('credit-memo-title')).toHaveText('New credit memo')
}

export async function pickCreditMemoCustomer(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-customer', name)
}

// The memo's line rows in screen order; each row's id is in its test id.
export function creditMemoLineRows(page: Page) {
    return page.getByTestId('credit-memo-lines').locator('[data-testid^="form-table-lines-row-"]')
}

export async function creditMemoLineRowId(page: Page, index: number): Promise<string> {
    const testId = await creditMemoLineRows(page).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no line ${index + 1}`)
    return testId.slice('form-table-lines-row-'.length)
}

export async function pickCreditMemoLineProduct(page: Page, index: number, name: string) {
    const rowId = await creditMemoLineRowId(page, index)
    await pickFromSearchPicker(page, lineCellTestId(rowId, 'product'), name)
    return rowId
}

// A memo's search option: "Draft credit memo" (a draft has no entry), or "Credit memo
// <n>" / "Credit memo <n> (void)" with " · <Customer>". The journal entry hits of a memo
// share its number but never name a customer.
const CREDIT_MEMO_OPTION = /^(Draft credit memo|Credit memo \d+( \(void\))? · )/

// Leaves the page on the memo's route without waiting for it to load, for a test whose
// load is meant to fail. Core's search palette opens with `/`.
export async function searchToCreditMemo(page: Page, memo: string, title = CREDIT_MEMO_OPTION) {
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
    await expect(page).toHaveURL(CREDIT_MEMO_URL)
}

// Reopens a credit memo through core's search palette, by its memo.
export async function openCreditMemoBySearch(page: Page, memo: string) {
    await searchToCreditMemo(page, memo)
    await expect(
        page.getByTestId('credit-memo-form').or(page.getByTestId('credit-memo-read-only'))
    ).toBeVisible()
}

// A new credit memo started from an invoice: `books/credit-memos/new?invoice=<id>`.
export const CREDIT_MEMO_FROM_INVOICE_URL = /\/books\/credit-memos\/new\?(?:[^#]*&)?invoice=[^&#]+/

// On a posted invoice's read view: presses "Create credit memo" (a bar button on a wide
// screen, a More row on a phone) and waits for the new form started from the invoice.
export async function createCreditMemoFromInvoice(page: Page) {
    if (isPhone(page)) {
        await page.locator('[data-testid="invoice-read-more"]:visible').click()
    }
    await page.locator('[data-testid="invoice-read-credit-memo"]:visible').click()
    await expect(page).toHaveURL(NEW_CREDIT_MEMO_URL)
    await expect(page).toHaveURL(CREDIT_MEMO_FROM_INVOICE_URL)
    await expect(page.getByTestId('credit-memo-form')).toBeVisible()
}

// Books must already be open. Leaves the page on the saved draft's form.
export async function saveCreditMemoDraft(
    page: Page,
    input: { customer: string; product: string; memo: string; rate?: string }
): Promise<string> {
    await openNewCreditMemo(page)
    await pickCreditMemoCustomer(page, input.customer)
    const rowId = await pickCreditMemoLineProduct(page, 0, input.product)
    if (input.rate !== undefined) {
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.rate)
    }
    await page.getByTestId('form-input-memo').fill(input.memo)
    await page.getByTestId('credit-memo-save-draft').click()
    await expect(page).toHaveURL(CREDIT_MEMO_URL)
    await expect(page.getByTestId('credit-memo-title')).toHaveText('Draft credit memo')
    return creditMemoIdFromUrl(page)
}

// Books must already be open. Posts a new memo of one line and leaves the page on its
// read view; returns its id and number.
export async function postCreditMemo(
    page: Page,
    input: {
        customer: string
        product: string
        qty?: string
        rate?: string
        memo: string
        message?: string
    }
): Promise<{ id: string; number: string }> {
    await openNewCreditMemo(page)
    await pickCreditMemoCustomer(page, input.customer)
    const rowId = await pickCreditMemoLineProduct(page, 0, input.product)
    if (input.qty !== undefined) {
        await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill(input.qty)
    }
    if (input.rate !== undefined) {
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.rate)
    }
    if (input.message !== undefined) {
        await page.getByTestId('form-input-message').fill(input.message)
    }
    await page.getByTestId('form-input-memo').fill(input.memo)
    await page.getByTestId('credit-memo-post').click()
    await expect(page).toHaveURL(CREDIT_MEMO_URL)
    await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
    const title = page.getByTestId('credit-memo-title')
    await expect(title).toHaveText(/^Credit memo \d+$/)
    const number = /^Credit memo (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return { id: creditMemoIdFromUrl(page), number }
}
