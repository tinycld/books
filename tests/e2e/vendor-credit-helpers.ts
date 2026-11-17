import { expect, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'
import { openEntriesList } from './journal-entries-helpers'
import { pickFromSearchPicker } from './search-picker-helpers'

// A vendor credit's own screen: `books/vendor-credits/<id>`, never
// `books/vendor-credits/new`.
export const VENDOR_CREDIT_URL = /\/books\/vendor-credits\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_VENDOR_CREDIT_URL = /\/books\/vendor-credits\/new(?:[?#].*)?$/

export type CreditTable = 'account_lines' | 'item_lines'

export function vendorCreditIdFromUrl(page: Page): string {
    const match = /\/books\/vendor-credits\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved vendor credit: ${page.url()}`)
    return id
}

// Books must already be open. From the Journal Entries list through the New menu (the
// phone FAB, or the desktop header's New text) to the Vendor credit item. A new vendor
// credit's Vendor picker has focus (web, every width).
export async function openNewVendorCredit(page: Page) {
    await openEntriesList(page)
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-vendor-credit').click()
    await expect(page).toHaveURL(NEW_VENDOR_CREDIT_URL)
    await expect(page.getByTestId('vendor-credit-form')).toBeVisible()
    await expect(page.getByTestId('vendor-credit-title')).toHaveText('New vendor credit')
    await expect(page.getByTestId('form-input-vendor')).toBeFocused()
}

export async function pickCreditVendor(page: Page, name: string) {
    await pickFromSearchPicker(page, 'form-input-vendor', name)
}

// Each table's rows (cards on a phone) in screen order; each row's id is in its test id.
function creditTableRows(page: Page, table: CreditTable) {
    const section =
        table === 'account_lines' ? 'vendor-credit-account-lines' : 'vendor-credit-item-lines'
    return page.getByTestId(section).locator(`[data-testid^="form-table-${table}-row-"]`)
}

export function creditAccountLineRows(page: Page) {
    return creditTableRows(page, 'account_lines')
}

export function creditItemLineRows(page: Page) {
    return creditTableRows(page, 'item_lines')
}

export async function creditLineRowId(
    page: Page,
    table: CreditTable,
    index: number
): Promise<string> {
    const testId = await creditTableRows(page, table).nth(index).getAttribute('data-testid')
    if (!testId) throw new Error(`no ${table} line ${index + 1}`)
    return testId.slice(`form-table-${table}-row-`.length)
}

// A vendor credit line cell's test id (core TableField):
// `form-table-<table>-<row id>-<column>`.
export function creditCellTestId(table: CreditTable, rowId: string, column: string) {
    return `form-table-${table}-${rowId}-${column}`
}

export async function pickCreditLineAccount(page: Page, index: number, label: string) {
    const rowId = await creditLineRowId(page, 'account_lines', index)
    await pickFromSearchPicker(page, creditCellTestId('account_lines', rowId, 'account'), label)
    return rowId
}

// The number in a posted vendor credit's read view title, "Vendor credit <n>".
export async function vendorCreditNumberOf(page: Page): Promise<string> {
    const title = page.getByTestId('vendor-credit-title')
    await expect(title).toHaveText(/^Vendor credit \d+$/)
    const number = /^Vendor credit (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the vendor credit title has no number')
    return number
}

// Books must already be open. Makes and posts a vendor credit with one account line,
// through New → Vendor credit and the bar's Post; returns its id and the number the read
// view's title shows.
export async function postVendorCredit(
    page: Page,
    input: { vendor: string; account: string; amount: string; memo: string }
): Promise<{ id: string; number: string }> {
    await openNewVendorCredit(page)
    await pickCreditVendor(page, input.vendor)
    const line = await pickCreditLineAccount(page, 0, input.account)
    await page.getByTestId(creditCellTestId('account_lines', line, 'amount')).fill(input.amount)
    await page.getByTestId('form-input-memo').fill(input.memo)
    await page.getByTestId('vendor-credit-post').click()
    await expect(page).toHaveURL(VENDOR_CREDIT_URL)
    await expect(page.getByTestId('vendor-credit-read-only')).toBeVisible()
    const number = await vendorCreditNumberOf(page)
    return { id: vendorCreditIdFromUrl(page), number }
}

// A vendor credit's search option title (vendor credit spec §3.11): "Draft vendor credit ·
// <Vendor>" or "Vendor credit <n> · <Vendor>" ("Vendor credit <n> (void) · <Vendor>" for a
// void one). A vendor credit always has a vendor.
const VENDOR_CREDIT_OPTION_TITLE = /^(Draft vendor credit|Vendor credit \d+( \(void\))?) · \S.*$/

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The palette's options whose title line is the whole title: "Vendor credit 12" never
// matches "Vendor credit 112 · …", and an option's subtitle never counts.
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
// for the vendor credit's route, not for it to load.
export async function searchToVendorCredit(page: Page, term: string, title: string) {
    await searchPalette(page, term)
    const option = optionsTitled(page, new RegExp(`^${escapeRegExp(title)}$`))
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(page).toHaveURL(VENDOR_CREDIT_URL)
}

// Reopens a vendor credit through core's search palette (`/`), by a term only one vendor
// credit matches (a unique memo): a draft in the form, a posted or void credit in the read
// view.
export async function openVendorCreditBySearch(page: Page, term: string) {
    await searchPalette(page, term)
    const option = optionsTitled(page, VENDOR_CREDIT_OPTION_TITLE)
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(page).toHaveURL(VENDOR_CREDIT_URL)
    await expect(
        page
            .getByTestId('vendor-credit-form')
            .or(page.getByTestId('vendor-credit-read-only'))
            .filter({ visible: true })
    ).toBeVisible()
}
