import { expect, type Locator, type Page } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { DESKTOP, isPhone } from './account-register-helpers'
import { lineCellTestId } from './invoice-helpers'
import {
    fillLine,
    openEntriesList,
    openNewEntry,
    postedEntryNumber,
    postOpenEntry,
} from './journal-entries-helpers'
import { openNewAction } from './new-menu-helpers'
import {
    customerWithInvoices,
    localDay,
    PAYMENT_URL,
    paymentIdFromUrl,
} from './receive-payment-helpers'
import { recordIdFromUrl } from './record-key-helpers'
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

export async function depositIdFromUrl(page: Page): Promise<string> {
    return recordIdFromUrl(page, 'deposits')
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
    await navItem.click()
    await expect(shownEntries).toBeVisible()
}

// Books must already be open. + New → Bank deposit, from the Journal Entries list.
export async function openNewDeposit(page: Page) {
    await showEntriesList(page)
    await openNewAction(page, 'deposit')
    await expect(page).toHaveURL(NEW_DEPOSIT_URL)
    await expect(shownDeposit(page, 'deposit-form')).toBeVisible()
}

// Ticks the own item by pressing its tick box, and waits for the tick.
export async function tickDepositItem(page: Page, reference: string) {
    const tick = await depositItemTick(page, reference)
    await tick.click()
    await expect(tick).toHaveAttribute('aria-checked', 'true')
}

// The shown form's item row or card whose Payment text is exactly `text`: "Check · <ref>"
// for a document paid by check, the line memo for a journal entry line.
export function depositItemRowWithText(page: Page, text: string): Locator {
    return page
        .locator(
            '[data-testid^="deposit-item-"]:not([data-testid^="deposit-item-tick-"]):not([data-testid^="deposit-item-link-"]):not([data-testid^="deposit-item-error-"])'
        )
        .filter({ has: page.getByText(text, { exact: true }), visible: true })
}

// Ticks the item row whose Payment text is `text` and returns its journal line id.
export async function tickDepositItemWithText(page: Page, text: string): Promise<string> {
    const row = depositItemRowWithText(page, text)
    await expect(row).toBeVisible()
    const id = (await row.getAttribute('data-testid'))?.slice('deposit-item-'.length)
    if (!id) throw new Error(`no item row for ${text}`)
    const tick = shownDeposit(page, `deposit-item-tick-${id}`)
    await tick.click()
    await expect(tick).toHaveAttribute('aria-checked', 'true')
    return id
}

// The deposit form must be open with its items ticked. Types the memo, posts, and returns
// the posted deposit's id and number. Leaves the page on the deposit's read view.
export async function postOpenDeposit(
    page: Page,
    memo: string
): Promise<{ id: string; number: string }> {
    await shownDeposit(page, 'deposit-memo').fill(memo)
    await shownDeposit(page, 'deposit-post').click()
    await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
    await expect(page).toHaveURL(DEPOSIT_URL)
    const title = shownDeposit(page, 'deposit-title')
    await expect(title).toHaveText(/^Deposit \d+$/)
    const number = /^Deposit (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the deposit read view title has no number')
    return { id: await depositIdFromUrl(page), number }
}

/**
 * Books must be open at desktop width. Makes an own customer with one invoice for `amount`
 * ("250.00") and receives a payment for it in full from the customer's page: deposited to
 * the default account (1200 Undeposited funds), by check with this reference no., with this
 * memo. Returns the payment's id and number. Leaves the page on the payment's read view.
 */
export async function postUndepositedPayment(
    page: Page,
    input: { reference: string; memo: string; amount: string }
): Promise<{ id: string; number: string }> {
    const { customerId, invoices } = await customerWithInvoices(
        page,
        [{ rate: input.amount, dueDate: await localDay(page, 10) }],
        'Depositor'
    )
    const invoice = invoices[0]
    if (!invoice) throw new Error('no invoice was posted')
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-receive-payment').click()
    await expect(page).toHaveURL(new RegExp(`/books/payments/new\\?customer=${customerId}$`))
    await page.getByTestId(`payment-row-tick-${invoice.id}`).click()
    await expect(page.getByTestId(`payment-row-amount-${invoice.id}`)).toHaveValue(input.amount)
    await page.getByTestId('payment-method').click()
    const check = page.getByRole('menuitem', { name: 'Check', exact: true })
    await check.click()
    await expect(check).toHaveCount(0)
    await expect(page.getByTestId('payment-method')).toContainText('Check')
    await page.getByTestId('payment-reference').fill(input.reference)
    await page.getByTestId('payment-memo').fill(input.memo)
    await page.getByTestId('payment-post').click()
    await expect(page).toHaveURL(PAYMENT_URL)
    await expect(page.getByTestId('payment-read-only')).toBeVisible()
    const title = page.getByTestId('payment-title')
    await expect(title).toHaveText(/^Payment \d+$/)
    const number = /^Payment (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the payment read view title has no number')
    return { id: await paymentIdFromUrl(page), number }
}

const UNDEPOSITED_FUNDS = '1200 Undeposited funds'
const CONSULTING_INCOME = '4000 Consulting Income'

/**
 * Books must already be open. Posts a journal entry dated today that debits 1200
 * Undeposited funds and credits 4000 Consulting Income for `amount` ("75.00"), with this
 * entry memo and this memo on the 1200 line (the item's Payment text in a deposit). Returns
 * the entry's id and number ("JE-12"). Leaves the page on the entry's read view.
 */
export async function postUndepositedEntry(
    page: Page,
    input: { memo: string; lineMemo: string; amount: string }
): Promise<{ id: string; number: string }> {
    await openNewEntry(page)
    await page.getByTestId('entry-memo').fill(input.memo)
    await fillLine(page, 0, {
        account: UNDEPOSITED_FUNDS,
        debit: input.amount,
        memo: input.lineMemo,
    })
    await fillLine(page, 1, { account: CONSULTING_INCOME, credit: input.amount })
    await postOpenEntry(page)
    return { id: await recordIdFromUrl(page, 'entries'), number: await postedEntryNumber(page) }
}

// The shown form's other funds lines (`deposit-line-<n>`), counted by their own test id:
// their fields have longer ones (`deposit-line-account-<n>`, …).
export function depositLineCount(page: Page): Promise<number> {
    return page
        .locator('[data-testid^="deposit-line-"]')
        .filter({ visible: true })
        .evaluateAll(
            elements =>
                elements.filter(el =>
                    /^deposit-line-\d+$/.test(el.getAttribute('data-testid') ?? '')
                ).length
        )
}

// The shown option of an open Account or Received from picker of line `index`, by its exact
// label ("4900 Interest earned", a vendor's display name).
export function depositLineOption(page: Page, picker: 'account' | 'party', label: string): Locator {
    return page
        .locator(`[data-testid^="deposit-line-${picker}-option-"]`)
        .filter({ has: page.getByText(label, { exact: true }), visible: true })
}

// Opens line `index`'s Account picker by a press, searches it and picks the option.
export async function pickDepositLineAccount(page: Page, index: number, label: string) {
    await shownDeposit(page, `deposit-line-account-${index}`).click()
    const search = shownDeposit(page, `deposit-line-account-search-${index}`)
    await expect(search).toBeFocused()
    await search.fill(label)
    await depositLineOption(page, 'account', label).click()
    await expect(shownDeposit(page, `deposit-line-account-${index}`)).toContainText(label)
}

// Opens line `index`'s Received from picker by a press, searches it and picks the party.
export async function pickDepositLineParty(page: Page, index: number, name: string) {
    await shownDeposit(page, `deposit-line-party-${index}`).click()
    const search = shownDeposit(page, `deposit-line-party-search-${index}`)
    await expect(search).toBeFocused()
    await search.fill(name)
    await depositLineOption(page, 'party', name).click()
    await expect(shownDeposit(page, `deposit-line-party-${index}`)).toContainText(name)
}

/**
 * The deposit form must be open. Presses "Add line" and fills the new line: its Account
 * (searched and picked), its Description, and its Amount ("12.40"), made negative with the
 * line's "±" control when `negative`. Returns the new line's index.
 */
export async function addOtherFundsLine(
    page: Page,
    input: { account: string; description?: string; amount: string; negative?: boolean }
): Promise<number> {
    const index = await depositLineCount(page)
    await shownDeposit(page, 'deposit-add-line').click()
    await expect(shownDeposit(page, `deposit-line-${index}`)).toBeVisible()
    await pickDepositLineAccount(page, index, input.account)
    if (input.description !== undefined) {
        await shownDeposit(page, `deposit-line-description-${index}`).fill(input.description)
    }
    const amount = shownDeposit(page, `deposit-line-amount-${index}`)
    await amount.fill(input.amount)
    if (input.negative) {
        await shownDeposit(page, `deposit-line-sign-${index}`).click()
        await expect(amount).toHaveValue(`-${input.amount}`)
    }
    return index
}
