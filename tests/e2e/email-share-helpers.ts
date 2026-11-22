import { expect, type Locator, type Page } from '@playwright/test'
import { DOCUMENT_SEND_PATH } from '../../tinycld/books/lib/document-send'
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

// Counts the page's POSTs to the send route from now on.
export function countSendRequests(page: Page): { count: () => number } {
    let count = 0
    page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes(DOCUMENT_SEND_PATH)) count += 1
    })
    return { count: () => count }
}
