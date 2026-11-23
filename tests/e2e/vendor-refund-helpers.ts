import { expect, type Locator, type Page, type Request } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'
import { uniqueMemo } from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'
import { openNewAction } from './new-menu-helpers'
import { pickFromSearchPicker } from './search-picker-helpers'
import {
    creditCellTestId,
    openNewVendorCredit,
    pickCreditLineAccount,
    pickCreditVendor,
    VENDOR_CREDIT_URL,
    vendorCreditIdFromUrl,
    vendorCreditNumberOf,
} from './vendor-credit-helpers'
import { createVendor, uniqueName, vendorHelpers } from './vendor-form-helpers'

// Shared steps of the vendor refund specs (spec §4). No test reads or changes a seeded
// vendor credit or vendor refund: every test makes its own vendor (a unique name) and
// posts its own vendor credits through the vendor credit form, gives each refund a unique
// memo, and reopens a refund through core's search palette.

// A vendor refund's own screen: `books/vendor-refunds/<id>`, never
// `books/vendor-refunds/new`.
export const VENDOR_REFUND_URL = /\/books\/vendor-refunds\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_VENDOR_REFUND_URL = /\/books\/vendor-refunds\/new(?:[?#].*)?$/

// The seeded expense account the helper's vendor credits credit.
export const REFUND_CREDIT_ACCOUNT = '6100 Rent'

// Logs in and opens Books at desktop width.
export async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// Every write the page sends to the vendor refund collections, so a test can say none was
// sent.
export function watchRefundWrites(page: Page): string[] {
    const writes: string[] = []
    page.on('request', (request: Request) => {
        if (request.method() === 'GET') return
        if (!request.url().includes('/api/collections/books_vendor_refund')) return
        writes.push(`${request.method()} ${request.url()}`)
    })
    return writes
}

export function vendorRefundIdFromUrl(page: Page): string {
    const match = /\/books\/vendor-refunds\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved vendor refund: ${page.url()}`)
    return id
}

export type CreditInput = {
    amount: string
    // The credit date, `YYYY-MM-DD`; today by default.
    date?: string
    // The vendor's credit no. (the credit's Ref no.).
    creditNo?: string
}

export type VendorWithCredits = {
    vendor: { id: string; name: string }
    // `memo` is the credit's unique memo, so a test can reopen it by search.
    credits: { id: string; number: string; memo: string }[]
}

// The current entry's index in the session history (the browser's Navigation API).
function historyIndex(page: Page): Promise<number> {
    return page.evaluate(
        () =>
            (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation
                .currentEntry.index
    )
}

// Goes back, one same-document popstate per step, to the stack depth `start` names, so the
// screens the steps pushed leave the stack.
async function returnTo(page: Page, start: number) {
    const now = await historyIndex(page)
    for (let step = now; step > start; step--) await page.goBack()
    await expect.poll(() => historyIndex(page)).toBe(start)
}

/**
 * Books must be open at desktop width. Creates a vendor with a unique name and posts one
 * vendor credit per input through New → Vendor credit: the vendor, the credit date when
 * given, the credit no. when given, one line on 6100 Rent at `amount`, a unique memo.
 * Returns the vendor and each credit's id, number and memo. It ends on the history entry
 * it started on, so a test may call it again.
 */
export async function vendorWithCredits(
    page: Page,
    credits: readonly CreditInput[]
): Promise<VendorWithCredits> {
    const name = uniqueName('Refunder')
    const start = await historyIndex(page)
    const created = vendorHelpers.insertAnswered(page)
    await createVendor(page, { name })
    const answer = await created
    expect(answer.ok()).toBe(true)
    const vendorId: string = (await answer.json()).id
    // Save opens the new vendor's page; leave it for the list.
    await vendorHelpers.openList(page)
    const posted: VendorWithCredits['credits'] = []
    for (const input of credits) {
        const memo = uniqueMemo('Refund credit')
        await openNewVendorCredit(page)
        await pickCreditVendor(page, name)
        if (input.date !== undefined) await page.getByTestId('form-input-date').fill(input.date)
        if (input.creditNo !== undefined) {
            await page.getByTestId('form-input-ref_no').fill(input.creditNo)
        }
        const line = await pickCreditLineAccount(page, 0, REFUND_CREDIT_ACCOUNT)
        await page.getByTestId(creditCellTestId('account_lines', line, 'amount')).fill(input.amount)
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('vendor-credit-post').click()
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        await expect(page.getByTestId('vendor-credit-read-only')).toBeVisible()
        const number = await vendorCreditNumberOf(page)
        posted.push({ id: vendorCreditIdFromUrl(page), number, memo })
    }
    await returnTo(page, start)
    return { vendor: { id: vendorId, name }, credits: posted }
}

// Books must already be open. From the Journal Entries list through the New menu
// (tests/e2e/new-menu-helpers.ts) to Vendor refund. A new refund's Vendor
// picker has focus (web, every width).
export async function openNewVendorRefund(page: Page) {
    await openEntriesList(page)
    await openNewAction(page, 'vendor_refund')
    await expect(page).toHaveURL(NEW_VENDOR_REFUND_URL)
    await expect(page.getByTestId('vendor-refund-form')).toBeVisible()
    await expect(page.getByTestId('vendor-refund-title')).toHaveText('Vendor refund')
    await expect(page.getByTestId('vendor-refund-vendor')).toBeFocused()
}

// Picks a vendor in the refund's Vendor SearchPicker with the pointer (wide or phone).
export async function pickRefundVendor(page: Page, name: string) {
    await pickFromSearchPicker(page, 'vendor-refund-vendor', name)
}

// A listed credit's grid row (wide), and its Refund cell (the grid's or the card's).
export function refundRow(page: Page, creditId: string): Locator {
    return page.getByTestId(`vendor-refund-row-${creditId}`)
}

export function refundCell(page: Page, creditId: string): Locator {
    return page.getByTestId(`vendor-refund-row-amount-${creditId}`)
}

// A listed credit's Unapplied credit cell in the wide grid alone: the row's cells are its
// direct children in column order (tick, credit, date, Credit total, Unapplied credit,
// Refund), so the cell before the last is Unapplied credit, never Credit total.
export function refundUnappliedCell(page: Page, creditId: string): Locator {
    return refundRow(page, creditId)
        .filter({ visible: true })
        .locator(':scope > :nth-last-child(2)')
}

export function refundTick(page: Page, creditId: string): Locator {
    return page.getByTestId(`vendor-refund-row-tick-${creditId}`)
}

// A vendor refund's search option title (spec §3.11): "Draft vendor refund · <Vendor>" or
// "Vendor refund <n> · <Vendor>" ("Vendor refund <n> (void) · <Vendor>" for a void one).
const VENDOR_REFUND_OPTION_TITLE = /^(Draft vendor refund|Vendor refund \d+( \(void\))?) · \S.*$/

// Opens core's search palette (`/`), searches the term and waits for the search answer;
// returns the palette's vendor refund options.
export async function searchVendorRefunds(page: Page, term: string): Promise<Locator> {
    const searched = page.waitForResponse(
        r =>
            r.url().includes('/api/search') &&
            r.status() === 200 &&
            new URL(r.url()).searchParams.get('q') === term
    )
    await page.keyboard.press('/')
    // The palette focuses its input a frame after it shows; keys typed before that frame
    // are lost.
    const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
    await expect(input).toBeFocused()
    await page.keyboard.type(term)
    await searched
    return page.getByRole('option').filter({ has: page.getByText(VENDOR_REFUND_OPTION_TITLE) })
}

// A screen opened over another keeps the one below mounted and hidden, with the same test
// ids: the visible one is the screen on top.
export function shownRefund(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

// The number of the refund the read view on top shows ("Vendor refund 1001").
export async function refundNumberOf(page: Page): Promise<string> {
    const title = shownRefund(page, 'vendor-refund-title')
    await expect(title).toHaveText(/^Vendor refund \d+$/)
    const number = /^Vendor refund (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the vendor refund read view title has no number')
    return number
}

/**
 * Books must be open at desktop width. Records and posts a refund of `amount` on the
 * vendor's one listed credit through New → Vendor refund (pointer steps), with the memo;
 * ends on the posted refund's read view, pushed over the Journal Entries list. Returns its
 * id and number.
 */
export async function postRefundOn(
    page: Page,
    input: { vendor: string; creditId: string; amount: string; memo: string }
): Promise<{ id: string; number: string }> {
    await openNewVendorRefund(page)
    await pickRefundVendor(page, input.vendor)
    await page.getByTestId('vendor-refund-amount').fill(input.amount)
    await expect(refundCell(page, input.creditId)).toHaveValue(input.amount)
    await page.getByTestId('vendor-refund-memo').fill(input.memo)
    await page.getByTestId('vendor-refund-post').click()
    await expect(page).toHaveURL(VENDOR_REFUND_URL)
    await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
    return { id: vendorRefundIdFromUrl(page), number: await refundNumberOf(page) }
}

/**
 * Searches the palette for `term` and opens the one vendor refund option whose title
 * matches `title` (a term may match an original and its correction). The screen is loaded
 * when it shows the form, the read view, or the cannot-edit notice (a stored draft whose
 * original is no longer posted).
 */
export async function searchToRefundTitled(page: Page, term: string, title: RegExp) {
    const options = await searchVendorRefunds(page, term)
    const option = options.filter({ has: page.getByText(title) })
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(page).toHaveURL(VENDOR_REFUND_URL)
    await expect(
        page
            .getByTestId('vendor-refund-form')
            .or(page.getByTestId('vendor-refund-read-only'))
            .or(page.getByTestId('vendor-refund-cannot-edit'))
            .filter({ visible: true })
    ).toBeVisible()
}

/**
 * Reopens a vendor refund through core's search palette by a term only one refund matches
 * (its unique memo): a draft in the form, a posted or void refund in the read view.
 * Returns the option's title ("Draft vendor refund · <Vendor>").
 */
export async function searchToVendorRefund(page: Page, memo: string): Promise<string> {
    const options = await searchVendorRefunds(page, memo)
    await expect(options).toHaveCount(1)
    const title = await options.getByText(VENDOR_REFUND_OPTION_TITLE).innerText()
    await options.click()
    await expect(page).toHaveURL(VENDOR_REFUND_URL)
    await expect(
        page
            .getByTestId('vendor-refund-form')
            .or(page.getByTestId('vendor-refund-read-only'))
            .filter({ visible: true })
    ).toBeVisible()
    return title.trim()
}
