import { expect, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'
import { createCustomer, uniqueName } from './customer-form-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    customerWithInvoices,
    localDay,
    NEW_PAYMENT_URL,
    openNewPayment,
    PAYMENT_URL,
    paymentRow,
    pickPaymentCustomer,
    rowAmount,
} from './receive-payment-helpers'

// The receive-payment form at desktop width (spec §3.2–§3.6): allocation, a customer
// change, a credit, a refused post, a failed load of the open invoices and Post & new.
// Each test makes its own customers and invoices through the UI; every payment it posts
// keeps today's date and carries a unique memo. Refusals and load failures are forced with
// route.fulfill; no seeded invoice or payment is read or changed.

const INVOICES_URL = '**/api/collections/books_invoices/records**'
const PAYMENT_RECORDS_URL = '**/api/collections/books_payments/records/*'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// Every write the page sends to the payment collections, so a test can say none was sent.
function watchPaymentWrites(page: Page) {
    const writes: string[] = []
    page.on('request', (request: Request) => {
        if (request.method() === 'GET') return
        if (!request.url().includes('/api/collections/books_payment')) return
        writes.push(`${request.method()} ${request.url()}`)
    })
    return writes
}

test.describe('receive-payment: form', () => {
    test('allocates, re-applies on a customer change and keeps the rest as a credit', async ({
        page,
    }) => {
        await openBooks(page)
        const memo = uniqueMemo('Payment credit')
        const a = await customerWithInvoices(page, [
            { rate: '100.00', dueDate: await localDay(page, 10) },
            { rate: '200.00', dueDate: await localDay(page, 20) },
            { rate: '300.00', dueDate: await localDay(page, 30) },
        ])
        const b = await customerWithInvoices(page, [
            { rate: '500.00', dueDate: await localDay(page, 15) },
        ])
        const nameC = uniqueName('Payer none')
        await createCustomer(page, { name: nameC })
        const [a1, a2, a3] = a.invoices
        const [b1] = b.invoices
        const amount = page.getByTestId('payment-amount')
        const rows = () => [a1, a2, a3].map(row => rowAmount(page, row.id))

        await openNewPayment(page)
        const writes = watchPaymentWrites(page)
        await expect(page.getByTestId('payment-choose-customer')).toHaveText(
            'Choose a customer to see their open invoices.'
        )

        // The header tick box pays every row, and Amount received follows.
        await pickPaymentCustomer(page, a.name)
        await page.getByTestId('payment-tick-all').click()
        const [r1, r2, r3] = rows()
        await expect(r1).toHaveValue('100.00')
        await expect(r2).toHaveValue('200.00')
        await expect(r3).toHaveValue('300.00')
        await expect(amount).toHaveValue('600.00')

        // With every row ticked, the header tick box unticks them all, and the amount it
        // set (not typed) is cleared too.
        await page.getByTestId('payment-tick-all').click()
        for (const row of rows()) await expect(row).toHaveValue('')
        await expect(amount).toHaveValue('')
        await page.getByTestId('payment-tick-all').click()
        await expect(r1).toHaveValue('100.00')
        await expect(r2).toHaveValue('200.00')
        await expect(r3).toHaveValue('300.00')
        await expect(amount).toHaveValue('600.00')

        // ⌥⌫ clears every row and, since it was not typed, Amount received.
        await page.keyboard.press('Alt+Backspace')
        for (const row of rows()) await expect(row).toHaveValue('')
        await expect(amount).toHaveValue('')

        // A typed amount is spread oldest due first.
        await amount.fill('250.00')
        await expect(r1).toHaveValue('100.00')
        await expect(r2).toHaveValue('150.00')
        await expect(r3).toHaveValue('')

        // ⌥A pays every row but keeps the typed amount: the sum is refused under the list.
        await page.keyboard.press('Alt+a')
        await expect(r1).toHaveValue('100.00')
        await expect(r2).toHaveValue('200.00')
        await expect(r3).toHaveValue('300.00')
        await expect(amount).toHaveValue('250.00')
        await expect(page.getByTestId('payment-over')).toContainText(
            'The payments add up to $600.00, more than the $250.00 received'
        )
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(NEW_PAYMENT_URL)

        // A row above its open balance is refused under that row.
        await r3.fill('350.00')
        await expect(page.getByTestId(`payment-row-error-${a3.id}`)).toHaveText(
            'More than the open balance of $300.00'
        )

        // Typing Amount received again re-applies it.
        await amount.fill('400.00')
        await expect(r1).toHaveValue('100.00')
        await expect(r2).toHaveValue('200.00')
        await expect(r3).toHaveValue('100.00')
        await expect(page.getByTestId(`payment-row-error-${a3.id}`)).toHaveCount(0)

        // A row edit after a typed amount leaves the amount; the rest is a credit.
        await r3.fill('')
        await expect(amount).toHaveValue('400.00')
        await expect(page.getByTestId('payment-to-credit')).toContainText('$100.00')
        await expect(page.getByTestId('payment-credit-note')).toHaveText(
            `Kept as a credit for ${a.name}`
        )

        // Another customer: only its invoices, the amount kept and re-applied.
        await pickPaymentCustomer(page, b.name)
        await expect(paymentRow(page, b1.id)).toBeVisible()
        for (const row of [a1, a2, a3]) await expect(paymentRow(page, row.id)).toHaveCount(0)
        await expect(rowAmount(page, b1.id)).toHaveValue('400.00')
        await expect(amount).toHaveValue('400.00')

        // A customer with no open invoices: everything received is a credit.
        await pickPaymentCustomer(page, nameC)
        await expect(page.getByTestId('payment-list-empty')).toHaveText(
            `${nameC} has no open invoices. The amount you enter is kept as a credit.`
        )
        await expect(page.getByTestId('payment-to-credit')).toContainText('$400.00')
        await page.getByTestId('payment-memo').fill(memo)
        expect(writes).toEqual([])

        await page.getByTestId('payment-post').click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-read-only')).toBeVisible()
        await expect(page.getByTestId('payment-title')).toHaveText(/^Payment \d+$/)
        await expect(page.locator('[data-testid^="payment-applied-"]')).toHaveCount(0)
        await expect(page.getByTestId('payment-amount-credited')).toContainText('$400.00')
        await expect(page.getByTestId('payment-read-only')).toContainText(
            `Kept as a credit for ${nameC}`
        )
    })

    test('shows a failed invoice load and a refused post, and starts the next payment', async ({
        page,
    }) => {
        await openBooks(page)
        const { name, customerId, invoices } = await customerWithInvoices(page, [
            { rate: '100.00', dueDate: await localDay(page, 10) },
            { rate: '200.00', dueDate: await localDay(page, 20) },
        ])
        const [first, second] = invoices
        const customer = page.getByTestId('payment-customer')

        // The open invoices fail to load; Retry recovers them.
        await page.route(INVOICES_URL, route => route.fulfill({ status: 400 }))
        await page.getByTestId('customer-new-transaction').click()
        await page.getByTestId('customer-new-receive-payment').click()
        await expect(page).toHaveURL(new RegExp(`/books/payments/new\\?customer=${customerId}$`))
        await expect(customer).toContainText(name)
        await expect(page.getByTestId('payment-list-error')).toContainText(
            'Books could not load the open invoices.'
        )
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('payment-list-retry').click()
        await expect(paymentRow(page, first.id)).toBeVisible()
        await expect(paymentRow(page, second.id)).toBeVisible()

        // Post & new: a fresh form for the same customer, which lists only what is open.
        await page.getByTestId(`payment-row-tick-${first.id}`).click()
        await expect(rowAmount(page, first.id)).toHaveValue('100.00')
        await page.getByTestId('payment-memo').fill(uniqueMemo('Payment post and new'))
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(/\/books\/payments\/new\?.*fresh=/)
        const fresh = new URL(page.url())
        expect(fresh.searchParams.get('customer')).toBe(customerId)
        expect(fresh.searchParams.has('invoice')).toBe(false)
        await expect(customer).toBeFocused()
        await expect(customer).toContainText(name)
        await expect(paymentRow(page, second.id)).toBeVisible()
        await expect(paymentRow(page, first.id)).toHaveCount(0)

        // The post is refused after the draft was written: the draft stays, with the
        // refusal under the row it names.
        await page.getByTestId(`payment-row-tick-${second.id}`).click()
        await expect(rowAmount(page, second.id)).toHaveValue('200.00')
        await page.getByTestId('payment-memo').fill(uniqueMemo('Payment refused post'))
        const refusal = `Invoice ${second.number}: the payment is more than its open balance of $200.00.`
        await page.route(PAYMENT_RECORDS_URL, route => {
            const request = route.request()
            const body = request.postDataJSON() as { status?: string } | null
            if (request.method() !== 'PATCH' || body?.status !== 'posted') {
                return route.fallback()
            }
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 400,
                    message: 'Failed to update record.',
                    data: {
                        'applications.0': { code: 'validation_refused', message: refusal },
                    },
                }),
            })
        })
        await page.getByTestId('payment-post').click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-title')).toHaveText('Draft payment')
        await expect(page.getByTestId(`payment-row-error-${second.id}`)).toContainText(
            `Invoice ${second.number}: the payment is more than its open balance of $200.00`
        )

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('payment-post').click()
        await expect(page.getByTestId('payment-read-only')).toBeVisible()
        await expect(page.getByTestId('payment-title')).toHaveText(/^Payment \d+$/)
    })
})
