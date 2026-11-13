import { expect, type Locator, type Page } from '@playwright/test'
import { accountItem, DESKTOP, isPhone, openChart } from './account-register-helpers'
import { openBooksMenu } from './books-report-helpers'
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

// Settings → Sales (spec §3.11). Only sales-receipt-form-settings.spec.ts may use these:
// they change the shared books_settings row.

const SETTINGS_ROW_PATH = '/api/collections/books_settings/records/bookssettings01'

// A screen covered in the navigation stack stays mounted but hidden, so only the visible
// match counts.
export function visibleTestId(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

// Books must already be open. Opens Settings → Sales: on desktop through the sidebar and
// the rail, on a phone through the Books menu (the drawer) and the section list.
export async function openSalesSettings(page: Page) {
    if (isPhone(page)) {
        await openBooksMenu(page)
        await page.getByTestId('mobile-drawer-panel').getByTestId('books-nav-settings').click()
    } else {
        await visibleTestId(page, 'books-nav-settings').click()
    }
    // On a settings route the press pushes a new Settings root and keeps the old screen
    // hidden in the DOM; a rail click before the push lands resolves to the old screen's
    // hidden row and waits on it until timeout.
    await expect(page).toHaveURL(/\/books\/settings$/)
    await visibleTestId(page, 'books-settings-section-sales').click()
    await expect(page).toHaveURL(/\/books\/settings\/sales$/)
    await expect(visibleTestId(page, 'books-settings-sales-deposit')).toBeVisible()
}

// Saves one Settings → Sales card whose value the caller changed from the stored one, and
// waits for the stored row. The caller decides from the stored value, never from Save's
// state: Save may read disabled for a moment right after the edit, and a skip then would
// leave the setting unchanged without a failure.
async function saveSalesCard(page: Page, saveTestId: string) {
    const save = visibleTestId(page, saveTestId)
    await expect(save).toBeEnabled()
    const answered = page.waitForResponse(
        response =>
            response.request().method() === 'PATCH' &&
            new URL(response.url()).pathname === SETTINGS_ROW_PATH
    )
    await save.click()
    expect((await answered).status()).toBe(200)
    await expect(save).toBeDisabled()
}

// Stores "Sales deposited to" as the option `label`, unless the stored value is already
// that option (the select's trigger names the stored choice once the accounts are read).
async function storeSalesDeposit(page: Page, label: 'Ask' | string) {
    const select = visibleTestId(page, 'books-settings-sales-deposit')
    // The select is disabled while the deposit accounts load.
    await expect(select).toBeEnabled()
    if ((await select.innerText()).trim() === label) return
    await select.click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(select).toContainText(label)
    await saveSalesCard(page, 'books-settings-sales-deposit-save')
}

// Stores "Default message to customer" as `text`, unless it is already the stored text.
async function storeDefaultMessage(page: Page, text: string) {
    const input = visibleTestId(page, 'books-settings-default-message')
    await expect(input).toBeVisible()
    if ((await input.inputValue()) === text) return
    await input.fill(text)
    await expect(input).toHaveValue(text)
    await saveSalesCard(page, 'books-settings-default-message-save')
}

// Books must already be open, as the admin the specs log in as. Sets "Sales deposited to"
// ("Ask" or an account's "<number> <name>") and saves it; stays on Settings → Sales.
export async function setSalesDepositedTo(page: Page, label: 'Ask' | string) {
    await openSalesSettings(page)
    await storeSalesDeposit(page, label)
}

// Books must already be open. Sets "Default message to customer" and saves it; stays on
// Settings → Sales.
export async function setDefaultMessage(page: Page, text: string) {
    await openSalesSettings(page)
    await storeDefaultMessage(page, text)
}

// Back out of Settings to the screen it was opened from (same-document history moves,
// no page load), so the next helper starts where it would without the detour.
export async function leaveSettings(page: Page) {
    const inSettings = () => /\/books\/settings(\/|$)/.test(new URL(page.url()).pathname)
    for (let step = 0; step < 4 && inSettings(); step++) {
        const from = page.url()
        await page.goBack()
        await expect(page).not.toHaveURL(from)
    }
    await expect(page).not.toHaveURL(/\/books\/settings(\/|$)/)
}

const UNDEPOSITED_FUNDS = 'Undeposited funds'

// Makes 1200 Undeposited funds active again when the chart shows it inactive, so a
// broken set-account guard cannot leave the shared book without its deposit account.
async function reactivateUndepositedFunds(page: Page) {
    await openChart(page)
    await expect(accountItem(page, 'Business Checking')).toBeVisible()
    if ((await accountItem(page, UNDEPOSITED_FUNDS).count()) > 0) return
    await visibleTestId(page, 'account-show-inactive').click()
    const item = accountItem(page, UNDEPOSITED_FUNDS)
    await expect(item).toHaveCount(1)
    const stored = page.waitForResponse(
        response =>
            response.request().method() === 'PATCH' &&
            new URL(response.url()).pathname.includes('/api/collections/books_accounts/records/')
    )
    await item.locator('[data-testid^="account-menu-"]').click()
    await page.getByRole('menuitem', { name: 'Make active', exact: true }).click()
    expect((await stored).status()).toBe(200)
}

// Puts both Sales settings back as seeded through the Settings UI (Sales deposited to
// "Ask", no default message), then the Undeposited funds account active. Runs at the
// desktop viewport, from wherever the test left the page.
export async function restoreSalesSettings(page: Page) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.setViewportSize(DESKTOP)
    await openSalesSettings(page)
    await storeSalesDeposit(page, 'Ask')
    await storeDefaultMessage(page, '')
    await reactivateUndepositedFunds(page)
}
