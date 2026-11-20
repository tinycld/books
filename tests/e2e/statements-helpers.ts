import { expect, type Page, test } from '@playwright/test'
import { authStorageKey } from '@tinycld/core/e2e-helpers'
import { createCustomer, customerPath, uniqueName } from './customer-form-helpers'
import { fillInvoice, localDay, postInvoice } from './receive-payment-helpers'

// Shared steps of the statements specs (statements plan, E2E rules): every test makes its
// own customer with a unique name, a unique email address and one posted invoice, opens
// the create screen from that customer's New transaction menu (so the list opens on that
// customer), and reads the statements it stored through the page's own fetch, read only.

// The create screen with its customer: `books/statements/new?customer=<id>`.
export function newStatementUrl(customerId: string): RegExp {
    return new RegExp(`/books/statements/new\\?customer=${customerId}$`)
}

export type StatementCustomer = {
    id: string
    name: string
    email: string
    // The posted invoice's total, in cents and as the screen writes it.
    invoiceCents: number
    invoiceAmount: string
}

// An address no other worker, test or run has. Call it inside a test.
export function uniqueEmail(prefix: string): string {
    return `${prefix}.w${test.info().workerIndex}.${Date.now()}@example.com`
}

const INVOICE_RATE = '137.25'

/**
 * Books must be open at desktop width. Creates a customer with a unique name and a unique
 * email address and, from its page's New transaction menu, posts one invoice dated today,
 * due in 30 days, for one non-taxable service at $137.25. Leaves the page on the customer.
 */
export async function statementCustomer(page: Page): Promise<StatementCustomer> {
    const name = uniqueName('Statement')
    const email = uniqueEmail('statement')
    await createCustomer(page, { name, email })
    const id = new URL(page.url()).pathname.split('/').pop() ?? ''
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${id}$`))
    await fillInvoice(page, { dueDate: await localDay(page, 30), rate: INVOICE_RATE })
    await postInvoice(page)
    await page.goBack()
    await expect(page).toHaveURL(customerPath(id))
    await expect(page.getByTestId('customer-transactions')).toBeVisible()
    return { id, name, email, invoiceCents: 13_725, invoiceAmount: '$137.25' }
}

/**
 * The customer's page must be open. Opens Create statements from its New transaction menu
 * and waits for the screen with the customer's row.
 */
export async function openNewStatementFor(page: Page, customer: StatementCustomer) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-statement').click()
    await expect(page).toHaveURL(newStatementUrl(customer.id))
    await expect(page.getByTestId('statements-create').filter({ visible: true })).toHaveCount(1)
    await expect(page.getByTestId(`statements-row-${customer.id}`)).toBeVisible()
}

export type StoredStatement = {
    id: string
    customer: string
    number: string
    type: string
    statement_date: string
    start_date: string
    end_date: string
    email: string
    balance: number
    // Set only by the send route; '' while the statement is not sent.
    sent_at: string
    sent_to: string
}

// The customer's stored statements, read through the page's own fetch (read only).
export async function statementsOf(page: Page, customerId: string): Promise<StoredStatement[]> {
    const key = await authStorageKey(page)
    const read = await page.evaluate(
        async ({ k, customer }) => {
            const token =
                (JSON.parse(localStorage.getItem(k) ?? '{}') as { token?: string }).token ?? ''
            const filter = encodeURIComponent(`customer = "${customer}"`)
            const response = await fetch(
                `/api/collections/books_statements/records?filter=${filter}&perPage=200`,
                { headers: { Authorization: token } }
            )
            const body = response.ok ? ((await response.json()) as { items: unknown[] }) : null
            return { status: response.status, items: body?.items ?? [] }
        },
        { k: key, customer: customerId }
    )
    expect(read.status).toBe(200)
    return read.items as StoredStatement[]
}

/**
 * The customer's page must be open. Stores one statement with the screen's defaults
 * (Balance forward, today, the customer's address) through Create statements and ⌘S, waits
 * until the screen is back on the customer and the row is stored, and returns that row.
 */
export async function storeStatement(
    page: Page,
    customer: StatementCustomer
): Promise<StoredStatement> {
    const before = new Set((await statementsOf(page, customer.id)).map(row => row.id))
    await openNewStatementFor(page, customer)
    await expect(page.getByTestId('statements-type')).toBeFocused()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page).toHaveURL(customerPath(customer.id))
    let stored: StoredStatement | undefined
    await expect
        .poll(async () => {
            stored = (await statementsOf(page, customer.id)).find(row => !before.has(row.id))
            return stored?.number ?? ''
        })
        .not.toBe('')
    if (!stored) throw new Error('no new statement was stored')
    return stored
}

// A customer's stored email address, read through the page's own fetch (read only).
export async function customerEmailOf(page: Page, customerId: string): Promise<string> {
    const key = await authStorageKey(page)
    const read = await page.evaluate(
        async ({ k, id }) => {
            const token =
                (JSON.parse(localStorage.getItem(k) ?? '{}') as { token?: string }).token ?? ''
            const response = await fetch(`/api/collections/books_customers/records/${id}`, {
                headers: { Authorization: token },
            })
            const body = response.ok ? ((await response.json()) as { email?: string }) : null
            return { status: response.status, email: body?.email ?? '' }
        },
        { k: key, id: customerId }
    )
    expect(read.status).toBe(200)
    return read.email
}
