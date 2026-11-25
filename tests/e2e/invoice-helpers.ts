import { expect, type Page } from '@playwright/test'
import { openEntriesList } from './journal-entries-helpers'
import { openNewAction } from './new-menu-helpers'
import { recordIdFromUrl } from './record-key-helpers'
import { pickFromSearchPicker } from './search-picker-helpers'

export { DESKTOP } from './account-register-helpers'

// An invoice's own screen: `books/invoices/<id>`, never `books/invoices/new`.
export const INVOICE_URL = /\/books\/invoices\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_INVOICE_URL = /\/books\/invoices\/new(?:[?#].*)?$/

export async function invoiceIdFromUrl(page: Page): Promise<string> {
    return recordIdFromUrl(page, 'invoices')
}

// The DB is shared by every spec file, so each invoice a spec makes carries its own memo.
export function uniqueMemo(label: string): string {
    return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Today in the browser's time zone, as the form's default date (todayIso).
export function localToday(page: Page): Promise<string> {
    return page.evaluate(() => {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    })
}

// Books must already be open. From the Journal Entries list through the New menu
// (tests/e2e/new-menu-helpers.ts) → Invoice.
export async function openNewInvoice(page: Page) {
    await openEntriesList(page)
    await openNewAction(page, 'invoice')
    await expect(page).toHaveURL(NEW_INVOICE_URL)
    await expect(page.getByTestId('invoice-title')).toHaveText('New invoice')
}

export async function pickInvoiceCustomer(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-customer', name)
}

// The lines' rows in screen order; each row's id is in its test id.
export function lineRows(page: Page) {
    return page.getByTestId('invoice-lines').locator('[data-testid^="form-table-lines-row-"]')
}

export async function lineRowId(page: Page, index: number): Promise<string> {
    const testId = await lineRows(page).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no line ${index + 1}`)
    return testId.slice('form-table-lines-row-'.length)
}

export function lineCellTestId(rowId: string, column: string) {
    return `form-table-lines-${rowId}-${column}`
}

export async function pickLineProduct(page: Page, index: number, name: string) {
    const rowId = await lineRowId(page, index)
    await pickFromSearchPicker(page, lineCellTestId(rowId, 'product'), name)
    return rowId
}

// Reopens an invoice through core's search palette (`/`): drafts are found there by
// their memo, as the option titled "Draft invoice · <Customer>" or "Invoice <n> · <Customer>".
// The search pushes the invoice over the screen open before it, which stays mounted but
// hidden (another invoice view, when the stack already holds one), so only a visible view
// is the pushed one. Exactly one invoice view may be visible: two mean the hidden one
// did not hide.
export async function openInvoiceBySearch(page: Page, memo: string) {
    await searchToInvoice(page, memo)
    const view = page
        .getByTestId('invoice-form')
        .or(page.getByTestId('invoice-read-only'))
        .filter({ visible: true })
    await expect(view).toHaveCount(1)
    await expect(view).toBeVisible()
}

// Leaves the page on the invoice's route without waiting for it to load, for a test
// whose load is meant to fail.
export async function searchToInvoice(page: Page, memo: string) {
    await page.keyboard.press('/')
    // The palette focuses its input a frame after it shows; keys typed before that
    // frame are lost.
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
    await page
        .getByRole('option')
        .filter({ hasText: /(Draft invoice|Invoice \d+) · / })
        .click()
    await expect(page).toHaveURL(INVOICE_URL)
}

// Books must already be open. Leaves the page on the saved draft's form.
export async function saveInvoiceDraft(
    page: Page,
    input: { customer: string; product: string; memo: string }
): Promise<string> {
    await openNewInvoice(page)
    await pickInvoiceCustomer(page, input.customer)
    await pickLineProduct(page, 0, input.product)
    await page.getByTestId('form-input-memo').fill(input.memo)
    await page.getByTestId('invoice-save-draft').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')
    return await invoiceIdFromUrl(page)
}
