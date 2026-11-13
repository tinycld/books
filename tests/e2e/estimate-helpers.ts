import { expect, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'
import { lineCellTestId } from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'

// An estimate's own screen: `books/estimates/<id>`, never `books/estimates/new`.
export const ESTIMATE_URL = /\/books\/estimates\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_ESTIMATE_URL = /\/books\/estimates\/new(?:[?#].*)?$/

export function estimateUrlOf(id: string) {
    return new RegExp(`/books/estimates/${id}$`)
}

export function estimateIdFromUrl(page: Page): string {
    const match = /\/books\/estimates\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved estimate: ${page.url()}`)
    return id
}

// Books must already be open. From the Journal Entries list through the New menu (the
// phone FAB, or the desktop header's New text) → Estimate.
export async function openNewEstimate(page: Page) {
    await openEntriesList(page)
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-estimate').click()
    await expect(page).toHaveURL(NEW_ESTIMATE_URL)
    await expect(page.getByTestId('estimate-title')).toHaveText('New estimate')
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

export async function pickEstimateCustomer(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-customer', name)
}

// The estimate's line rows (cards on a phone) in screen order; each row's id is in its
// test id.
export function estimateLineRows(page: Page) {
    return page.getByTestId('estimate-lines').locator('[data-testid^="form-table-lines-row-"]')
}

export async function estimateLineRowId(page: Page, index: number): Promise<string> {
    const testId = await estimateLineRows(page).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no line ${index + 1}`)
    return testId.slice('form-table-lines-row-'.length)
}

export async function pickEstimateLineProduct(page: Page, index: number, name: string) {
    const rowId = await estimateLineRowId(page, index)
    await pickFromSearchPicker(page, lineCellTestId(rowId, 'product'), name)
    return rowId
}

// A core SelectInput of the form with focus, from the keyboard: Enter opens its menu (core
// SelectInput opens on Enter or Space, not on a typed letter), the letter key moves to the
// next option that starts with it, Enter picks the focused option.
export async function pickSelectByLetters(page: Page, key: string, letter: string, label: string) {
    const trigger = page.getByTestId(`form-input-${key}`)
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await expect(item).toBeVisible()
    for (let press = 0; press < 8; press++) {
        await page.keyboard.press(letter)
        if (await item.evaluate(el => el === document.activeElement)) break
    }
    await expect(item).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(item).toHaveCount(0)
    await expect(trigger).toContainText(label)
    // Core's layer focus gives focus back to the trigger one animation frame after the
    // menu closes; a Tab before that frame starts from the body.
    await expect(trigger).toBeFocused()
}

// An estimate's search option: "Estimate <n> · <Customer>" (spec §3.11). An estimate
// has no journal entry, so no other hit carries its memo.
const ESTIMATE_OPTION = /^Estimate \d+ · /

// Core's search palette from the keyboard: its key (core binds the palette to `/`), the
// memo, arrow keys to the estimate's option, Enter. Leaves the page on the estimate's
// route without waiting for it to load, for a test whose load is meant to fail. The
// focus must not be in a picker trigger, which takes `/` as a typed letter.
export async function searchToEstimate(page: Page, memo: string) {
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
    await expect(page.getByRole('option').filter({ hasText: ESTIMATE_OPTION })).toHaveCount(1)
    const selected = page.getByRole('option', { selected: true })
    for (let step = 0; step < 10; step++) {
        if (ESTIMATE_OPTION.test(await selected.innerText())) break
        await page.keyboard.press('ArrowDown')
    }
    await expect(selected).toHaveText(ESTIMATE_OPTION)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(ESTIMATE_URL)
}

// Reopens an estimate through the search palette, by its memo, and waits for its screen.
// A lower screen of the same estimate may stay mounted, hidden, in the Books stack, so
// the wait is for the visible (top) screen.
export async function openEstimateBySearch(page: Page, memo: string) {
    await searchToEstimate(page, memo)
    await expect(
        page
            .getByTestId('estimate-form')
            .or(page.getByTestId('estimate-read-only'))
            .filter({ visible: true })
    ).toBeVisible()
}

// The invoice form started from an estimate: `books/invoices/new?estimate=<id>`.
export const INVOICE_FROM_ESTIMATE_URL = /\/books\/invoices\/new\?estimate=([^&#]+)$/

// The estimate id of the invoice form started from it.
export function estimateIdOfInvoiceUrl(page: Page): string {
    const id = new URL(page.url()).searchParams.get('estimate')
    if (!id) throw new Error(`Not on an invoice from an estimate: ${page.url()}`)
    return id
}

// Convert to invoice from the estimate's Save bar: the wide bar's button, or its row in
// the phone bar's More menu. Leaves the page on the invoice route without waiting for the
// invoice form, for a test whose load is meant to fail; returns the estimate's id.
export async function convertEstimate(page: Page): Promise<string> {
    if (isPhone(page)) await page.getByTestId('estimate-more').click()
    await page.getByTestId('estimate-convert').click()
    await expect(page).toHaveURL(INVOICE_FROM_ESTIMATE_URL)
    return estimateIdOfInvoiceUrl(page)
}

// The "From estimate <n>" link of an invoice made from an estimate (its form's band or
// its read view) opens the estimate's screen.
export async function openInvoiceFromEstimateLink(page: Page) {
    await page.getByTestId('invoice-from-estimate').click()
    await expect(page).toHaveURL(ESTIMATE_URL)
    await expect(
        page.getByTestId('estimate-form').or(page.getByTestId('estimate-read-only'))
    ).toBeVisible()
}

// The number in a saved estimate's title, "Estimate <n>".
export async function estimateNumberOf(page: Page): Promise<string> {
    const title = page.getByTestId('estimate-title')
    await expect(title).toHaveText(/^Estimate \d+$/)
    const number = /^Estimate (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the estimate title has no number')
    return number
}
