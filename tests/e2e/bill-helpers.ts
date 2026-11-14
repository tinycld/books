import { expect, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'
import { openEntriesList } from './journal-entries-helpers'

// A bill's own screen: `books/bills/<id>`, never `books/bills/new`.
export const BILL_URL = /\/books\/bills\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_BILL_URL = /\/books\/bills\/new(?:[?#].*)?$/

export type BillTable = 'account_lines' | 'item_lines'

export function billIdFromUrl(page: Page): string {
    const match = /\/books\/bills\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved bill: ${page.url()}`)
    return id
}

// Books must already be open. From the Journal Entries list through the New menu (the
// phone FAB, or the desktop header's New text) → Bill. A new bill's Vendor picker has
// focus (web, every width).
export async function openNewBill(page: Page) {
    await openEntriesList(page)
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-bill').click()
    await expect(page).toHaveURL(NEW_BILL_URL)
    await expect(page.getByTestId('bill-form')).toBeVisible()
    await expect(page.getByTestId('bill-title')).toHaveText('New bill')
    await expect(page.getByTestId('form-input-vendor')).toBeFocused()
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

export async function pickBillVendor(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-vendor', name)
}

// Each table's rows (cards on a phone) in screen order; each row's id is in its test id.
function tableRows(page: Page, table: BillTable) {
    const section = table === 'account_lines' ? 'bill-account-lines' : 'bill-item-lines'
    return page.getByTestId(section).locator(`[data-testid^="form-table-${table}-row-"]`)
}

export function accountLineRows(page: Page) {
    return tableRows(page, 'account_lines')
}

export function itemLineRows(page: Page) {
    return tableRows(page, 'item_lines')
}

export async function billLineRowId(page: Page, table: BillTable, index: number): Promise<string> {
    const testId = await tableRows(page, table).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no ${table} line ${index + 1}`)
    return testId.slice(`form-table-${table}-row-`.length)
}

// A bill line cell's test id (core TableField): `form-table-<table>-<row id>-<column>`.
export function billCellTestId(table: BillTable, rowId: string, column: string) {
    return `form-table-${table}-${rowId}-${column}`
}

export async function pickLineAccount(page: Page, index: number, label: string) {
    const rowId = await billLineRowId(page, 'account_lines', index)
    await pickFromSearchPicker(page, billCellTestId('account_lines', rowId, 'account'), label)
    return rowId
}

export async function pickBillLineProduct(page: Page, index: number, name: string) {
    const rowId = await billLineRowId(page, 'item_lines', index)
    await pickFromSearchPicker(page, billCellTestId('item_lines', rowId, 'product'), name)
    return rowId
}

// The number in a posted bill's read view title, "Bill <n>".
export async function billNumberOf(page: Page): Promise<string> {
    const title = page.getByTestId('bill-title')
    await expect(title).toHaveText(/^Bill \d+$/)
    const number = /^Bill (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the bill title has no number')
    return number
}

// The bill form must be open with a postable bill. Posts it with the bar's Post and
// returns the number the read view's title shows.
export async function postBill(page: Page): Promise<string> {
    await page.getByTestId('bill-post').click()
    await expect(page).toHaveURL(BILL_URL)
    await expect(page.getByTestId('bill-read-only')).toBeVisible()
    return billNumberOf(page)
}

// A bill's search option title: "Draft bill · <Vendor>", or "Bill <n> · <Vendor>" ("Bill
// <n> (void) · <Vendor>" for a void one). A bill always has a vendor.
const BILL_OPTION_TITLE = /^(Draft bill|Bill \d+( \(void\))?) · \S.*$/

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The palette's options whose title line is the whole title: "Bill 12 · …" never
// matches "Bill 112 · …", and an option's subtitle never counts.
function optionsTitled(page: Page, title: RegExp) {
    return page.getByRole('option').filter({ has: page.getByText(title) })
}

// Opens core's search palette (`/`) and searches the term. Waits for the search answer.
async function searchPalette(page: Page, term: string) {
    await page.keyboard.press('/')
    // The palette focuses its input a frame after it shows; keys typed before that frame
    // are lost.
    const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
    await expect(input).toBeFocused()
    const searched = page.waitForResponse(
        r =>
            r.url().includes('/api/search') &&
            r.status() === 200 &&
            new URL(r.url()).searchParams.get('q') === term
    )
    await page.keyboard.type(term)
    await searched
}

// Searches the term and picks the one option whose title is exactly `title`. Waits only
// for the bill's route, not for it to load.
export async function searchToBill(page: Page, term: string, title: string) {
    await searchPalette(page, term)
    const option = optionsTitled(page, new RegExp(`^${escapeRegExp(title)}$`))
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(page).toHaveURL(BILL_URL)
}

// Reopens a bill through core's search palette (`/`), by a term only one bill matches
// (a unique memo): a draft in the form, a posted or void bill in the read view.
export async function openBillBySearch(page: Page, term: string) {
    await searchPalette(page, term)
    const option = optionsTitled(page, BILL_OPTION_TITLE)
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(page).toHaveURL(BILL_URL)
    await expect(page.getByTestId('bill-form').or(page.getByTestId('bill-read-only'))).toBeVisible()
}

// Desktop. Reopens the saved draft on screen without search: leaves through the sidebar's
// Journal Entries item (not the form's back link, which leaves through the layer's own
// route), then Back (a same-document popstate) returns to the draft's form.
export async function reopenByBack(page: Page) {
    const url = page.url()
    const navItem = page.getByTestId('books-nav-entries')
    if (!(await navItem.isVisible())) {
        await page.getByTestId('books-nav-accounting-toggle').click()
    }
    await navItem.click()
    // A sidebar push leaves the earlier screen mounted and hidden, so the list may be
    // mounted twice: the pushed one is the last.
    await expect(page.getByTestId('entries-screen').last()).toBeVisible()
    await expect(page.getByTestId('bill-form')).not.toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(url)
    await expect(page.getByTestId('bill-form')).toBeVisible()
}
