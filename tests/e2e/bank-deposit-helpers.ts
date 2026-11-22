import { expect, type Locator, type Page } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { DESKTOP, isPhone } from './account-register-helpers'
import { lineCellTestId } from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'
import {
    chooseReceiptSelect,
    openNewSalesReceipt,
    pickReceiptCustomer,
    pickReceiptLineProduct,
    SALES_RECEIPT_URL,
} from './sales-receipt-helpers'

// A deposit's own screen: `books/deposits/<id>`, never `.../new`.
export const DEPOSIT_URL = /\/books\/deposits\/(?!new(?:[?#]|$))[^/?#]+$/

// The one deposit seed.ts posts (bank deposit spec §4.6): to 1000 Business Checking, holding
// the $180.00 sales receipt and one other funds line, "October interest" $12.40, on 4900.
// No spec voids or edits it.
export const SEEDED_DEPOSIT = {
    memo: 'Seeded deposit',
    depositTo: '1000 Business Checking',
    itemAmount: '$180.00',
    lineDescription: 'October interest',
    lineAmount: '$12.40',
    total: '$192.40',
} as const

export function depositUrlOf(id: string) {
    return new RegExp(`/books/deposits/${id}$`)
}

export function depositIdFromUrl(page: Page): string {
    const match = /\/books\/deposits\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved deposit: ${page.url()}`)
    return id
}

// A screen covered in the navigation stack stays mounted but hidden, so only the visible
// match counts.
export function shownDeposit(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

export async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// A deposit's search option: "Draft deposit", or "Deposit <n>" / "Deposit <n> (void)" with
// " · <Deposit to>". The deposit's own journal entry is a document entry, which search
// leaves out, so only the deposit's row matches.
const DEPOSIT_OPTION = /^(Draft deposit|Deposit \d+( \(void\))? · )/

// Leaves the page on the deposit's route without waiting for it to load, for a test whose
// load is meant to fail.
export async function searchToDeposit(page: Page, memo: string, title = DEPOSIT_OPTION) {
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
    await expect(page).toHaveURL(DEPOSIT_URL)
}

// Opens a deposit through core's search palette (`/`), by its memo, and waits for its form
// or its read view.
export async function openDepositBySearch(page: Page, memo: string) {
    await searchToDeposit(page, memo)
    await expect(
        shownDeposit(page, 'deposit-form').or(shownDeposit(page, 'deposit-read-only'))
    ).toBeVisible()
}

// A fresh deposit form: `books/deposits/new`.
export const NEW_DEPOSIT_URL = /\/books\/deposits\/new(?:[?#].*)?$/

// Northwind Traders is tax exempt, so a receipt for it totals its rate.
export const RECEIPT_CUSTOMER = customerName(CUSTOMER_IDS.northwind)
export const OTHER_RECEIPT_CUSTOMER = customerName(CUSTOMER_IDS.harborview)

function customerName(id: string) {
    const row = CUSTOMERS.find(candidate => candidate.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    return row.display_name
}

// Year-end tax preparation: a service, never taxed.
const SERVICE = 'Year-end tax preparation'

// A per-run reference no. (at most 40 characters) that finds an item row by its Payment text.
export function uniqueReference(label: string) {
    return `${label}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Books must already be open. Posts a sales receipt dated today to the default deposit
 * account (1200 Undeposited funds in either settings mode), paid by check with this
 * reference no. and memo, for `amount` ("123.45") on one service line. Returns its number.
 * Leaves the page on the receipt's read view.
 */
export async function postUndepositedReceipt(
    page: Page,
    input: { reference: string; memo: string; amount: string; customer?: string }
): Promise<{ number: string }> {
    await openNewSalesReceipt(page)
    await pickReceiptCustomer(page, input.customer ?? RECEIPT_CUSTOMER)
    const rowId = await pickReceiptLineProduct(page, 0, SERVICE)
    await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.amount)
    await chooseReceiptSelect(page, 'payment_method', 'Check')
    await page.getByTestId('form-input-reference_no').fill(input.reference)
    await page.getByTestId('form-input-memo').fill(input.memo)
    await page.getByTestId('sales-receipt-post').click()
    await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
    await expect(page).toHaveURL(SALES_RECEIPT_URL)
    const title = page.getByTestId('sales-receipt-title')
    await expect(title).toHaveText(/^Sales receipt \d+$/)
    const number = /^Sales receipt (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return { number }
}

// The shown form's item row or card whose Payment text is "Check · <reference>". The row's
// own test id is `deposit-item-<lineId>`; its tick, link and error have longer ones.
export function depositItemRow(page: Page, reference: string): Locator {
    return page
        .locator(
            '[data-testid^="deposit-item-"]:not([data-testid^="deposit-item-tick-"]):not([data-testid^="deposit-item-link-"]):not([data-testid^="deposit-item-error-"])'
        )
        .filter({ has: page.getByText(`Check · ${reference}`, { exact: true }), visible: true })
}

// The journal line id of an item row, from its test id.
export async function depositItemLineId(page: Page, reference: string): Promise<string> {
    const row = depositItemRow(page, reference)
    await expect(row).toBeVisible()
    const testId = await row.getAttribute('data-testid')
    const id = testId?.slice('deposit-item-'.length)
    if (!id) throw new Error(`no item row for ${reference}`)
    return id
}

export async function depositItemTick(page: Page, reference: string): Promise<Locator> {
    const id = await depositItemLineId(page, reference)
    return shownDeposit(page, `deposit-item-tick-${id}`)
}

// Books must already be open. Reaches the Journal Entries list from the screen on top, the
// way a user would: a deposit's own Back, or the sidebar from any other screen. A list pushed
// earlier stays mounted but hidden under the screens above it, so only the visible list counts.
async function showEntriesList(page: Page) {
    const shownEntries = page.getByTestId('entries-screen').filter({ visible: true })
    const depositBack = shownDeposit(page, 'deposit-back')
    if (await depositBack.isVisible()) {
        await depositBack.click()
        await expect(shownEntries).toBeVisible()
        return
    }
    if (await shownEntries.isVisible()) return
    if (isPhone(page) || !(await page.getByTestId('entries-screen').count())) {
        await openEntriesList(page)
        return
    }
    const navItem = page.getByTestId('books-nav-entries')
    if (!(await navItem.isVisible())) await page.getByTestId('books-nav-accounting-toggle').click()
    await navItem.click()
    await expect(shownEntries).toBeVisible()
}

// Books must already be open. + New → Bank deposit, from the Journal Entries list.
export async function openNewDeposit(page: Page) {
    await showEntriesList(page)
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-deposit').click()
    await expect(page).toHaveURL(NEW_DEPOSIT_URL)
    await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
}

// Ticks the own item by pressing its tick box, and waits for the tick.
export async function tickDepositItem(page: Page, reference: string) {
    const tick = await depositItemTick(page, reference)
    await tick.click()
    await expect(tick).toHaveAttribute('aria-checked', 'true')
}
