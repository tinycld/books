import { expect, type Page, type Route } from '@playwright/test'
import { createCustomer, uniqueName } from './customer-form-helpers'
import { INVOICE_URL, openInvoiceBySearch, uniqueMemo } from './invoice-helpers'
import { fillInvoice, localDay, postInvoice } from './receive-payment-helpers'

// Shared steps of the write-off specs (write-off spec §4.6): every test makes its own
// customer and posts its own invoice through the UI with a unique memo, and opens it again
// through Books search. Every write-off goes to 6050 Bad debts (plan decision 10): the
// dialog's default account is the account of the newest posted write-off in the shared
// database, so a spec that picked another account would change a parallel spec's default.

// A write-off's own page: `books/write-offs/<id>`.
export const WRITE_OFF_URL = /\/books\/write-offs\/[a-z0-9]{15}(?:[?#].*)?$/

// The one account every e2e write-off names.
export const BAD_DEBTS = '6050 Bad debts'

// The records endpoint of `books_write_offs`, where the dialog's insert POSTs.
const WRITE_OFFS_RECORDS = '**/api/collections/books_write_offs/records*'

/**
 * Books must be open at desktop width. Creates a customer with a unique name, posts one
 * invoice of $400.00 with no tax for it (dated today, due in 30 days, with a unique memo),
 * and opens that invoice again on its read view through Books search.
 */
export async function invoiceToWriteOff(
    page: Page,
    label: string
): Promise<{ customer: string; memo: string; number: string }> {
    const customer = uniqueName(label)
    const memo = uniqueMemo(label)
    await createCustomer(page, { name: customer })
    const customerId = new URL(page.url()).pathname.split('/').pop() ?? ''
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customerId}$`))
    await page.getByTestId('form-input-memo').fill(memo)
    await fillInvoice(page, { dueDate: await localDay(page, 30), rate: '400.00' })
    const { number } = await postInvoice(page)
    await page.goBack()
    await expect(page.getByTestId('customer-transactions')).toBeVisible()
    await openInvoiceBySearch(page, memo)
    await expect(page.locator('[data-testid="invoice-title"]:visible')).toHaveText(
        `Invoice ${number}`
    )
    await expect(page.locator('[data-testid="invoice-badge"]:visible')).toHaveText('Posted')
    return { customer, memo, number }
}

/**
 * Reopens a posted invoice through the search palette by its memo, clicking only the
 * option named `Invoice <number> · …`: a refused correction Post leaves a draft correction
 * with the same memo, listed beside the original as `Draft invoice · …`.
 */
export async function openPostedInvoiceBySearch(page: Page, memo: string, number: string) {
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
        .filter({ hasText: `Invoice ${number} · ` })
        .click()
    await expect(page).toHaveURL(INVOICE_URL)
    const view = page.getByTestId('invoice-read-only').filter({ visible: true })
    await expect(view).toHaveCount(1)
    await expect(view).toBeVisible()
}

// The toast a write-off shows on success.
export function writeOffToast(page: Page, number: string, amount: string) {
    return page.getByTestId('toast-card').filter({
        hasText: `Invoice ${number} written off: ${amount}`,
    })
}

/**
 * On the read view of a posted invoice with an open balance: presses W, keeps the default
 * date, picks 6050 Bad debts, and confirms through `confirmWriteOff` (Write off, then the
 * toast and the closed dialog). A `reason`, when given, is typed into Reason (internal),
 * the entry's memo.
 */
export async function writeOffOpenInvoice(page: Page, reason?: string): Promise<void> {
    const title = await page.locator('[data-testid="invoice-title"]:visible').innerText()
    const number = /^Invoice (\d+)$/.exec(title)?.[1]
    if (!number) throw new Error(`not on a posted invoice: ${title}`)
    await page.keyboard.press('w')
    const dialog = page.getByTestId('write-off-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('write-off-date')).toBeFocused()
    await page.getByTestId('write-off-account').click()
    const item = page.getByRole('menuitem', { name: BAD_DEBTS, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(page.getByTestId('write-off-account')).toContainText(BAD_DEBTS)
    if (reason !== undefined) {
        await page.getByTestId('write-off-reason').fill(reason)
        await expect(page.getByTestId('write-off-reason')).toHaveValue(reason)
    }
    await confirmWriteOff(page, number)
}

/**
 * In the open Write off dialog of invoice `number`: keeps the default date and the default
 * account, which is 6050 Bad debts on the e2e database (the newest posted write-off's
 * account; every e2e write-off and the seed's name it, plan decision 10), presses Write off
 * and waits for the toast and the closed dialog. Returns the amount the dialog showed.
 */
export async function confirmWriteOff(page: Page, number: string): Promise<string> {
    const dialog = page.getByTestId('write-off-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('write-off-account')).toContainText(BAD_DEBTS)
    const amount = (await page.getByTestId('write-off-amount').innerText()).trim()
    await page.getByTestId('write-off-submit').click()
    await expect(writeOffToast(page, number, amount)).toBeVisible()
    await expect(dialog).toHaveCount(0)
    return amount
}

/**
 * On the read view of an invoice with a write-off: clicks the first link of its Write-offs
 * section and waits for the write-off's own page on top.
 */
export async function openWriteOffFromInvoice(page: Page): Promise<void> {
    const section = page.locator('[data-testid="invoice-write-offs"]:visible')
    await expect(section).toBeVisible()
    await section.locator('[data-testid^="invoice-write-offs-open-"]').first().click()
    await expect(page).toHaveURL(WRITE_OFF_URL)
    const view = page.getByTestId('write-off-read-only').filter({ visible: true })
    await expect(view).toHaveCount(1)
    await expect(view).toBeVisible()
}

export type HeldInsert = { arrived: Promise<void>; release(): Promise<void> }

// Holds the next POST to `books_write_offs` (the dialog's one insert); every other request
// passes. A held request is no data write: it reaches the server unchanged on `release`.
export async function holdWriteOffInsert(page: Page): Promise<HeldInsert> {
    let openGate = () => {}
    const released = new Promise<void>(resolve => {
        openGate = resolve
    })
    let arrive = () => {}
    const arrived = new Promise<void>(resolve => {
        arrive = resolve
    })
    let finish = () => {}
    const finished = new Promise<void>(resolve => {
        finish = resolve
    })
    const handler = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.continue()
        arrive()
        await released
        await route.continue()
        finish()
    }
    await page.route(WRITE_OFFS_RECORDS, handler)
    return {
        arrived,
        release: async () => {
            openGate()
            await finished
            await page.unroute(WRITE_OFFS_RECORDS, handler)
        },
    }
}
