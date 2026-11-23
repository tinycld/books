import { expect, type Locator, type Page } from '@playwright/test'
import {
    billCellTestId,
    billIdFromUrl,
    billLineRowId,
    openNewBill,
    pickBillVendor,
    pickLineAccount,
    postBill,
} from './bill-helpers'
import { openEntriesList } from './journal-entries-helpers'
import { openNewAction } from './new-menu-helpers'
import { localDay } from './receive-payment-helpers'
import { createVendor, uniqueName, vendorHelpers } from './vendor-form-helpers'

// Shared steps of the Pay Bills specs (spec §4.5). No test reads or changes a seeded bill or
// a seeded bill payment: every test makes its own vendor and posts its own bills through
// the bill form, then filters Pay Bills to that vendor (other workers' bills are listed
// too). A test that pays by Check takes its own Starting check no. (`uniqueCheckNo`).

export { DESKTOP, PHONE } from './account-register-helpers'
export { localDay }

// Pay Bills: `books/pay-bills`, with or without a query.
export const PAY_BILLS_URL = /\/books\/pay-bills(?:\?.*)?$/

// A seeded expense account a bill's line may charge.
export const BILL_EXPENSE_ACCOUNT = '6200 Software Subscriptions'

export const CHECKING = '1000 Business Checking'

export type BillInput = {
    amount: string
    // The due date, `YYYY-MM-DD`. A bill due before today is dated on its due date.
    due: string
    // The vendor's bill no., in the bill's Ref no.
    billNo?: string
    // The account line's account label; a seeded expense account by default.
    account?: string
}

export type VendorWithBills = {
    vendor: { id: string; name: string }
    bills: { id: string; number: string }[]
}

// Nine digits no other worker or run takes at the same time.
export function uniqueCheckNo(): string {
    return String((Date.now() % 900_000_000) + 100_000_000)
}

/**
 * Books must be open at desktop width. Creates a vendor (a unique name unless `name` is
 * given) and posts one bill per input through the bill form: the vendor, the date (the due
 * date when it is before today), the due date, the vendor's bill no. in Ref no. when given,
 * and one account line at `amount`. Returns the vendor and each bill's id and number.
 * It ends on the history entry it started on, so a test may call it again.
 */
export async function vendorWithBills(
    page: Page,
    input: { name?: string; bills: readonly BillInput[] }
): Promise<VendorWithBills> {
    const name = input.name ?? uniqueName('Payee')
    const start = await historyIndex(page)
    const created = vendorHelpers.insertAnswered(page)
    await createVendor(page, { name })
    const answer = await created
    expect(answer.ok()).toBe(true)
    const vendorId: string = (await answer.json()).id
    // Save opens the new vendor's page; leave it for the list.
    await vendorHelpers.openList(page)
    const today = await localDay(page, 0)
    const bills: { id: string; number: string }[] = []
    for (const bill of input.bills) {
        await openNewBill(page)
        await pickBillVendor(page, name)
        if (bill.due < today) await page.getByTestId('form-input-date').fill(bill.due)
        await page.getByTestId('form-input-due_date').fill(bill.due)
        if (bill.billNo !== undefined) {
            await page.getByTestId('form-input-ref_no').fill(bill.billNo)
        }
        await pickLineAccount(page, 0, bill.account ?? BILL_EXPENSE_ACCOUNT)
        const line = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill(bill.amount)
        const number = await postBill(page)
        bills.push({ id: billIdFromUrl(page), number })
    }
    await returnTo(page, start)
    return { vendor: { id: vendorId, name }, bills }
}

// The current entry's index in the session history (the browser's Navigation API,
// Chromium). Only the index, not the URL: the Books landing `/a/books` replaces its own
// entry with `/a/books/dashboard` (`screens/index.tsx`, `StackActions.replace`), which keeps
// the index but changes the URL, so a URL read at the start races that replace.
export function historyIndex(page: Page): Promise<number> {
    return page.evaluate(
        () =>
            (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation
                .currentEntry.index
    )
}

// Goes back, one same-document popstate per step (no reload), to the stack depth `start`
// names, so the screens the steps pushed leave the stack (memory p3-transfer: a screen
// left below makes the next nav push a second copy of it).
export async function returnTo(page: Page, start: number) {
    const now = await historyIndex(page)
    for (let step = now; step > start; step--) await page.goBack()
    await expect.poll(() => historyIndex(page)).toBe(start)
}

// Books must already be open. From the Journal Entries list through the New menu
// (tests/e2e/new-menu-helpers.ts) → Pay bills.
export async function openPayBills(page: Page) {
    await openEntriesList(page)
    await openNewAction(page, 'pay_bills')
    await expect(page).toHaveURL(PAY_BILLS_URL)
    await expect(page.getByTestId('pay-bills-title')).toHaveText('Pay bills')
}

export function payBillsRow(page: Page, billId: string) {
    return page.getByTestId(`pay-bills-row-${billId}`)
}

export function payBillsCard(page: Page, billId: string) {
    return page.getByTestId(`pay-bills-card-${billId}`)
}

export function payBillsRowAmount(page: Page, billId: string) {
    return page.getByTestId(`pay-bills-row-amount-${billId}`)
}

// Sets the Vendor filter to the vendor with the pointer. The option is found by its test
// id, so the same step works for the wide menu and the phone sheet.
export async function filterToVendor(page: Page, vendor: { id: string; name: string }) {
    const chip = page.getByTestId('pay-bills-vendor-filter')
    await chip.click()
    await page.getByTestId('pay-bills-vendor-filter-search').fill(vendor.name)
    const option = page.getByTestId(`pay-bills-vendor-option-${vendor.id}`)
    await option.click()
    await expect(option).toHaveCount(0)
    await expect(chip).toContainText(vendor.name)
}

// Picks an option of a core SelectInput with the pointer (setup steps).
export async function pickSelect(page: Page, testId: string, label: string) {
    const trigger = page.getByTestId(testId)
    await trigger.click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(trigger).toContainText(label)
}

// A focused core SelectInput, by keys only: Enter opens it, ArrowDown moves through its
// rows until the focused one is `label`, Enter picks it, and focus is back on the trigger.
export async function pickFocusedSelect(page: Page, trigger: Locator, label: string) {
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await expect(item).toBeVisible()
    for (let press = 0; press < 12; press++) {
        if (await item.evaluate(el => el === document.activeElement)) break
        await page.keyboard.press('ArrowDown')
    }
    await expect(item).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(item).toHaveCount(0)
    await expect(trigger).toContainText(label)
    await expect(trigger).toBeFocused()
}

// The listed rows' bill ids in screen order (wide grid), read in one snapshot.
export function listedBillIds(page: Page): Promise<string[]> {
    return page.getByTestId('pay-bills-grid').evaluate(grid =>
        Array.from(grid.querySelectorAll('[data-testid^="pay-bills-row-"]'))
            .map(el => el.getAttribute('data-testid') ?? '')
            .map(id => /^pay-bills-row-([a-z0-9]{15})$/.exec(id)?.[1])
            .filter((id): id is string => id !== undefined)
    )
}

// A money text's cents, its sign kept ("−$1,234.50", "-$3.00", "$12.00").
export function moneyCents(text: string): number {
    const match = /([-−])?\s*\$([\d,]+)\.(\d\d)/.exec(text)
    if (!match) throw new Error(`no money in "${text}"`)
    const cents = Number(match[2].replace(/,/g, '')) * 100 + Number(match[3])
    return match[1] ? -cents : cents
}

// A bill payment's read view: `books/bill-payments/<id>`.
export const BILL_PAYMENT_URL = /\/books\/bill-payments\/[^/?#]+$/

export function billPaymentIdFromUrl(page: Page): string {
    const id = /\/books\/bill-payments\/([^/?#]+)$/.exec(new URL(page.url()).pathname)?.[1]
    if (!id) throw new Error(`Not on a bill payment: ${page.url()}`)
    return id
}

// Pay Bills editing a posted bill payment: `books/pay-bills?replaces=<id>`.
export function replacesUrl(paymentId: string): RegExp {
    return new RegExp(`/books/pay-bills\\?replaces=${paymentId}$`)
}

// A screen opened over another keeps the one below mounted and hidden, with the same test
// ids: the visible one is the screen on top.
export function shown(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Focus must not be in a text field. Opens core's search palette (`/`), searches the term,
 * and opens the one option whose title line is exactly `title` ("Bill payment 1004 ·
 * Pacific Power"); waits for the bill payment's route.
 */
export async function searchToBillPayment(page: Page, term: string, title: string) {
    await page.keyboard.press('/')
    // The palette focuses its input a frame after it shows; keys typed before are lost.
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
    const option = page
        .getByRole('option')
        .filter({ has: page.getByText(new RegExp(`^${escapeRegExp(title)}$`)) })
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(page).toHaveURL(BILL_PAYMENT_URL)
}

// The posted toast of one payment, "Posted Bill payment <n>"; returns n.
export async function postedNumber(page: Page): Promise<string> {
    const toast = page.getByText(/^Posted Bill payment \d+$/)
    await expect(toast).toBeVisible()
    const number = /(\d+)$/.exec(await toast.innerText())?.[1]
    if (!number) throw new Error('the toast has no number')
    return number
}
