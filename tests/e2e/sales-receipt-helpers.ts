import { expect, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'
import { lineCellTestId } from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'

// A sales receipt's own screen: `books/sales-receipts/<id>`, never `.../new`.
export const SALES_RECEIPT_URL = /\/books\/sales-receipts\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_SALES_RECEIPT_URL = /\/books\/sales-receipts\/new(?:[?#].*)?$/

export function salesReceiptUrlOf(id: string) {
    return new RegExp(`/books/sales-receipts/${id}$`)
}

export function salesReceiptIdFromUrl(page: Page): string {
    const match = /\/books\/sales-receipts\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved sales receipt: ${page.url()}`)
    return id
}

// Books must already be open. From the Journal Entries list through the New menu (the
// phone FAB, or the desktop header's New text) → Sales receipt.
export async function openNewSalesReceipt(page: Page) {
    await openEntriesList(page)
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-sales-receipt').click()
    await expect(page).toHaveURL(NEW_SALES_RECEIPT_URL)
    await expect(page.getByTestId('sales-receipt-title')).toHaveText('New sales receipt')
}

// A Books SearchPicker: the trigger opens a menu whose search field takes the term, and
// each option is a menu item named by its label.
async function pickFromSearchPicker(page: Page, triggerTestId: string, label: string) {
    const trigger = page.getByTestId(triggerTestId)
    await trigger.click()
    const search = page.getByTestId(`${triggerTestId}-search`)
    await expect(search).toBeFocused()
    await search.fill(label)
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toHaveCount(0)
    await expect(trigger).toContainText(label)
}

export async function pickReceiptCustomer(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-customer', name)
}

// The Customer picker's clear choice, offered first and with no search.
export async function pickNoCustomer(page: Page) {
    const trigger = page.getByTestId('form-input-customer')
    await trigger.click()
    await expect(page.getByTestId('form-input-customer-search')).toBeFocused()
    const choice = page.getByRole('menuitem', { name: 'No customer', exact: true })
    await choice.click()
    await expect(choice).toHaveCount(0)
}

// The receipt's line rows in screen order; each row's id is in its test id.
export function receiptLineRows(page: Page) {
    return page.getByTestId('sales-receipt-lines').locator('[data-testid^="form-table-lines-row-"]')
}

export async function receiptLineRowId(page: Page, index: number): Promise<string> {
    const testId = await receiptLineRows(page).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no line ${index + 1}`)
    return testId.slice('form-table-lines-row-'.length)
}

export async function pickReceiptLineProduct(page: Page, index: number, name: string) {
    const rowId = await receiptLineRowId(page, index)
    await pickFromSearchPicker(page, lineCellTestId(rowId, 'product'), name)
    return rowId
}

// A core SelectInput of the form, by its built-in key: opens it and picks the option.
export async function chooseReceiptSelect(page: Page, key: string, label: string) {
    await page.getByTestId(`form-input-${key}`).click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(page.getByTestId(`form-input-${key}`)).toContainText(label)
}

// A receipt's search option: "Draft sales receipt" (a draft has no entry, so its title is
// unique), or "Sales receipt <n>" / "Sales receipt <n> (void)" with " · <Customer>". The
// journal entry hits of a receipt share its number but never name a customer, so a
// posted receipt is found by search only when it has one.
const RECEIPT_OPTION = /^(Draft sales receipt|Sales receipt \d+( \(void\))? · )/

// Leaves the page on the receipt's route without waiting for it to load, for a test
// whose load is meant to fail.
export async function searchToSalesReceipt(page: Page, memo: string, title = RECEIPT_OPTION) {
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
    await expect(page).toHaveURL(SALES_RECEIPT_URL)
}

// Reopens a sales receipt through core's search palette (`/`), by its memo.
export async function openSalesReceiptBySearch(page: Page, memo: string) {
    await searchToSalesReceipt(page, memo)
    await expect(
        page.getByTestId('sales-receipt-form').or(page.getByTestId('sales-receipt-read-only'))
    ).toBeVisible()
}
