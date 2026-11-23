import { type Browser, expect, type Locator, type Page } from '@playwright/test'
import { trackRealtimeClients } from '@tinycld/core/e2e-helpers'
import { DOCUMENT_SEND_PATH } from '../../tinycld/books/lib/document-send'
import { DESKTOP } from './account-register-helpers'
import { expectedHeading } from './books-report-helpers'
import { createCustomer, customerPath, uniqueName } from './customer-form-helpers'
import { uniqueMemo } from './invoice-helpers'
import { fillInvoice, localDay, postInvoice } from './receive-payment-helpers'
import { uniqueEmail } from './statements-helpers'

// Shared steps of the email-share specs (email-share plan, E2E rules): every test makes its
// own customer with a unique name and a unique email address and its own document with a
// unique memo, opens it through search, and finds the email it sent by that address.

export { DOCUMENT_SEND_PATH }

// The email status read of core `fetchEmailStatus` (core/reports/lib/export-client.ts).
export const EMAIL_STATUS_PATH = '/api/reports/email-status'

const INVOICE_RATE = '212.50'

/**
 * Books must be open at desktop width. Creates a customer with a unique name and a unique
 * email address and, from its page's New transaction menu, posts one invoice dated today,
 * due in 30 days, for one non-taxable service, with a unique memo. Goes back to the
 * customer's page and returns the memo, the posted invoice's number and the address.
 */
export async function postedInvoiceWithEmail(
    page: Page
): Promise<{ memo: string; number: string; email: string; customer: string }> {
    const customer = uniqueName('Send')
    const email = uniqueEmail('send')
    await createCustomer(page, { name: customer, email })
    const id = new URL(page.url()).pathname.split('/').pop() ?? ''
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${id}$`))
    const memo = uniqueMemo('Send invoice')
    await page.getByTestId('form-input-memo').fill(memo)
    await fillInvoice(page, { dueDate: await localDay(page, 30), rate: INVOICE_RATE })
    const { number } = await postInvoice(page)
    await page.goBack()
    await expect(page).toHaveURL(customerPath(id))
    return { memo, number, email, customer }
}

// The open Send dialog.
export function sendDialog(page: Page): Locator {
    return page.getByTestId('document-send-dialog')
}

// The Send dialog's message editor: the editable element inside `document-send-body`.
export function emailBody(page: Page): Locator {
    return sendDialog(page).getByTestId('document-send-body').locator('[contenteditable="true"]')
}

/**
 * A read view of a sent-able document is open. Presses the shown bar's Send… button
 * (`<kind>-read-send`) and waits for the Send dialog.
 */
export async function openSendDialog(page: Page): Promise<Locator> {
    const send = page.locator('[data-testid$="-read-send"]').filter({ visible: true })
    await expect(send, 'the read bar’s Send… button').toBeVisible()
    await send.click()
    const dialog = sendDialog(page)
    await expect(dialog).toBeVisible()
    return dialog
}

// The business name the email names (spec §3.4): the Books business name, else the
// organization's name, read through the page's own fetch (read only).
export async function businessName(page: Page): Promise<string> {
    const name = await expectedHeading(page)
    expect(name, 'the business name or the organization name').not.toBe('')
    return name
}

// Today in the browser's zone as the sent line writes a day: "Nov 20, 2026".
export function todayWords(page: Page): Promise<string> {
    return page.evaluate(() =>
        new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
    )
}

export function toast(page: Page, text: string): Locator {
    return page.getByTestId('toast-card').filter({ hasText: text })
}

// The customer link of an invoice (email-share spec §3.5): the server address,
// /p/books/invoices/ and a 43-character URL-safe token.
export const INVOICE_LINK_PATTERN = /\/p\/books\/invoices\/[A-Za-z0-9_-]{43}$/

export const LINK_COPIED = 'Customer link copied.'

// The token at the end of an invoice's customer link.
export function invoiceTokenOfLink(link: string): string {
    const token = /\/p\/books\/invoices\/([A-Za-z0-9_-]{43})$/.exec(link)?.[1]
    if (!token) throw new Error(`not an invoice customer link: ${link}`)
    return token
}

// The invoice customer link of a token on the same server as the Books page.
export function invoiceLinkOf(page: Page, token: string): string {
    return `${new URL(page.url()).origin}/p/books/invoices/${token}`
}

/**
 * A posted invoice's read view is open at desktop width. Presses its Copy customer link
 * button (`invoice-read-link`), waits for the toast and returns the link the clipboard
 * then holds.
 */
export async function copyInvoiceLink(page: Page): Promise<string> {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() => navigator.clipboard.writeText(''))
    const button = page.getByTestId('invoice-read-link').filter({ visible: true })
    await expect(button, 'the read bar’s Copy customer link button').toBeVisible()
    await button.click()
    await expect(page.getByText(LINK_COPIED, { exact: true }).first()).toBeVisible()
    await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toMatch(INVOICE_LINK_PATTERN)
    return page.evaluate(() => navigator.clipboard.readText())
}

/**
 * Opens a customer link in a new browser context that never signed in, as a customer
 * pasting the link (the pattern of `openPublicPage`, estimate-public-link-helpers.ts),
 * with its realtime clients tracked. `beforeLoad` runs on the new page before its first
 * and only `goto` (to fake a read before the screen mounts).
 */
export async function openInvoicePublicPage(
    browser: Browser,
    link: string,
    options: {
        viewport?: { width: number; height: number }
        beforeLoad?: (page: Page) => Promise<void>
    } = {}
): Promise<{ page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({
        baseURL: new URL(link).origin,
        viewport: options.viewport ?? DESKTOP,
        reducedMotion: 'reduce',
    })
    trackRealtimeClients(context)
    const page = await context.newPage()
    if (options.beforeLoad) await options.beforeLoad(page)
    await page.goto(link)
    return { page, close: () => context.close() }
}

// Counts the page's POSTs to the send route from now on.
export function countSendRequests(page: Page): { count: () => number } {
    let count = 0
    page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes(DOCUMENT_SEND_PATH)) count += 1
    })
    return { count: () => count }
}
