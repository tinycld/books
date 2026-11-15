import { expect, type Page } from '@playwright/test'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { createCustomer, customerPath, uniqueName } from './customer-form-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    lineCellTestId,
    localToday,
    pickLineProduct,
} from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'

// Shared steps of the receive-payment specs (spec §4.5): every test makes its own customer
// and posts its own invoices through the UI, so no test reads or changes a seeded invoice or
// payment. The invoice steps (`nonTaxableService`, `fillInvoice`, `postInvoice`) moved here
// from customer-pages-transactions.spec.ts, which imports them back.

// A payment's own screen: `books/payments/<id>`, never `books/payments/new`.
export const PAYMENT_URL = /\/books\/payments\/(?!new(?:[?#]|$))[^/?#]+$/
export const NEW_PAYMENT_URL = /\/books\/payments\/new(?:[?#].*)?$/

export function paymentIdFromUrl(page: Page): string {
    const match = /\/books\/payments\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved payment: ${page.url()}`)
    return id
}

// A seeded Service: not taxable, so a document's total is its line amount.
export function nonTaxableService() {
    const row = PRODUCTS.find(p => p.id === PRODUCT_IDS.taxPrep)
    if (!row || row.taxable) throw new Error('no non-taxable tax prep service in the fixture')
    return row.name
}

// The open invoice form: date (unless the default today), due date, one service line at
// `rate`.
export async function fillInvoice(
    page: Page,
    input: { date?: string; dueDate: string; rate: string }
) {
    if (input.date !== undefined) await page.getByTestId('form-input-date').fill(input.date)
    await page.getByTestId('form-input-due_date').fill(input.dueDate)
    const rowId = await pickLineProduct(page, 0, nonTaxableService())
    await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.rate)
    await expect(page.getByTestId(lineCellTestId(rowId, 'amount'))).toContainText(`$${input.rate}`)
}

// The number in an invoice read view's title, "Invoice <n>".
async function invoiceNumber(page: Page) {
    const title = page.getByTestId('invoice-title')
    await expect(title).toHaveText(/^Invoice \d+$/)
    const number = /^Invoice (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return number
}

// Posts the open invoice form; returns the posted invoice's id and number.
export async function postInvoice(page: Page) {
    await page.getByTestId('invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
    return { id: invoiceIdFromUrl(page), number: await invoiceNumber(page) }
}

// The browser's local day `days` from today, as the forms' default date (todayIso).
export function localDay(page: Page, days: number): Promise<string> {
    return page.evaluate(offset => {
        const day = new Date()
        day.setDate(day.getDate() + offset)
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
    }, days)
}

/**
 * Books must be open at desktop width. Creates a customer with a unique name and, from its
 * page's New transaction menu, posts one invoice per input: the non-taxable service at
 * `rate`, due `dueDate`. An invoice due before today is dated on its due date (an invoice
 * cannot be due before its date); the others keep today. Leaves the page on the customer.
 */
export async function customerWithInvoices(
    page: Page,
    invoices: readonly { rate: string; dueDate: string }[]
): Promise<{ name: string; customerId: string; invoices: { id: string; number: string }[] }> {
    const name = uniqueName('Payer')
    await createCustomer(page, { name })
    const customerId = new URL(page.url()).pathname.split('/').pop() ?? ''
    const today = await localToday(page)
    const posted: { id: string; number: string }[] = []
    for (const invoice of invoices) {
        await page.getByTestId('customer-new-transaction').click()
        await page.getByTestId('customer-new-invoice').click()
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customerId}$`))
        const date = invoice.dueDate < today ? invoice.dueDate : undefined
        await fillInvoice(page, { date, dueDate: invoice.dueDate, rate: invoice.rate })
        posted.push(await postInvoice(page))
        await page.goBack()
        await expect(page).toHaveURL(customerPath(customerId))
        await expect(page.getByTestId('customer-transactions')).toBeVisible()
    }
    return { name, customerId, invoices: posted }
}

// Books must already be open at desktop width. From the Journal Entries list through the
// header's New menu → Receive payment.
export async function openNewPayment(page: Page) {
    await openEntriesList(page)
    await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    await page.getByTestId('books-new-receive-payment').click()
    await expect(page).toHaveURL(NEW_PAYMENT_URL)
    await expect(page.getByTestId('payment-title')).toHaveText('Receive payment')
}

// Picks a customer in the payment's Customer SearchPicker with the pointer (setup steps).
export async function pickPaymentCustomer(page: Page, name: string) {
    const trigger = page.getByTestId('payment-customer')
    await trigger.click()
    const search = page.getByTestId('payment-customer-search')
    await expect(search).toBeFocused()
    await search.fill(name)
    await page.getByRole('menuitem', { name, exact: true }).click()
    await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(0)
    await expect(trigger).toContainText(name)
}

export function paymentRow(page: Page, invoiceId: string) {
    return page.getByTestId(`payment-row-${invoiceId}`)
}

export function rowAmount(page: Page, invoiceId: string) {
    return page.getByTestId(`payment-row-amount-${invoiceId}`)
}
