import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { DESKTOP } from './account-register-helpers'
import { customerPath } from './customer-form-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import {
    customerWithInvoices,
    localDay,
    PAYMENT_URL,
    paymentIdFromUrl,
    rowAmount,
} from './receive-payment-helpers'
import { expectRecordUrl } from './record-key-helpers'

// Receive payment elsewhere in Books (spec §3.9) at desktop width: the invoice read view's
// balance due, badge, Payments total and block and its Receive payment action (R); the
// customer page's Overdue by open balance and its Payment transactions. Each test makes its
// own customer and invoices through the UI; every payment it posts keeps today's date and
// carries a unique memo. No seeded invoice or payment is read or changed.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function transaction(page: Page, id: string) {
    return page.getByTestId(`customer-transaction-${id}`)
}

// The ids of the Transactions tab's rows, in screen order, in one snapshot.
function transactionIds(page: Page) {
    return page
        .getByTestId('customer-transactions')
        .locator('[data-testid^="customer-transaction-"]')
        .evaluateAll(els => {
            const ids: string[] = []
            for (const el of els) {
                const match = /^customer-transaction-([a-z0-9]{15})$/.exec(
                    el.getAttribute('data-testid') ?? ''
                )
                if (match?.[1] && !ids.includes(match[1])) ids.push(match[1])
            }
            return ids
        })
}

// Posts the open payment form; returns the payment's id and number.
async function postPayment(page: Page) {
    await page.getByTestId('payment-post').click()
    await expect(page).toHaveURL(PAYMENT_URL)
    await expect(page.getByTestId('payment-read-only')).toBeVisible()
    const title = page.getByTestId('payment-title')
    await expect(title).toHaveText(/^Payment \d+$/)
    const number = /^Payment (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the payment read view title has no number')
    return { id: await paymentIdFromUrl(page), number }
}

test.describe('receive-payment: invoice and customer', () => {
    test('receives a payment from the invoice read view', async ({ page }) => {
        await openBooks(page)
        const { name, customerId, invoices } = await customerWithInvoices(page, [
            { rate: '400.00', dueDate: await localDay(page, 10) },
        ])
        const [invoice] = invoices
        const today = await localToday(page)

        await transaction(page, invoice.id).click()
        await expectRecordUrl(page, 'invoices', invoice.id)
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
        await expect(page.getByTestId('invoice-balance-due')).toHaveText('$400.00')
        await expect(page.getByTestId('invoice-total-payments')).toHaveCount(0)
        await expect(page.getByTestId('invoice-read-receive-payment')).toBeVisible()

        // R opens a new payment for this customer with this invoice ticked in full.
        await page.keyboard.press('r')
        await expect(page).toHaveURL(
            new RegExp(`/books/payments/new\\?customer=${customerId}&invoice=${invoice.id}$`)
        )
        await expect(page.getByTestId('payment-customer')).toContainText(name)
        await expect(rowAmount(page, invoice.id)).toHaveValue('400.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('400.00')

        // A part payment: Amount received follows the row.
        await rowAmount(page, invoice.id).fill('100.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('100.00')
        await page.getByTestId('payment-memo').fill(uniqueMemo('Payment from invoice'))
        const payment = await postPayment(page)

        // The applied Invoice link opens the invoice, now partly paid.
        await page.getByTestId(`payment-read-link-${invoice.id}`).click()
        await expectRecordUrl(page, 'invoices', invoice.id)
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page.getByTestId('invoice-badge')).toHaveText('Partly paid')
        await expect(page.getByTestId('invoice-balance-due')).toHaveText('$300.00')
        await expect(page.getByTestId('invoice-read-receive-payment')).toBeVisible()
        await expect(page.getByTestId('invoice-total-payments')).toContainText('−$100.00')
        await expect(page.getByTestId('invoice-payments')).toContainText(
            `Payment ${payment.number} · ${formatDay(today)} · $100.00`
        )
        await expect(page.getByTestId(`invoice-payment-${payment.id}`)).toContainText(
            `Payment ${payment.number}`
        )
    })

    test('the customer page shows the payment and the open balance it leaves', async ({ page }) => {
        await openBooks(page)
        const { name, customerId, invoices } = await customerWithInvoices(page, [
            { rate: '500.00', dueDate: await localDay(page, -1) },
        ])
        const [invoice] = invoices
        const overdue = page.getByTestId('customer-balance-overdue')
        await expect(overdue).toHaveText('$500.00')

        await page.getByTestId('customer-new-transaction').click()
        await page.getByTestId('customer-new-receive-payment').click()
        await expect(page).toHaveURL(new RegExp(`/books/payments/new\\?customer=${customerId}$`))
        await expect(page.getByTestId('payment-customer')).toContainText(name)

        // The invoice in full, and $100.00 more kept as a credit.
        await page.getByTestId(`payment-row-tick-${invoice.id}`).click()
        await expect(rowAmount(page, invoice.id)).toHaveValue('500.00')
        await page.getByTestId('payment-amount').fill('600.00')
        await expect(rowAmount(page, invoice.id)).toHaveValue('500.00')
        await page.getByTestId('payment-memo').fill(uniqueMemo('Payment credit page'))
        const payment = await postPayment(page)

        await page.goBack()
        await expect(page).toHaveURL(customerPath(customerId))
        await expect(page.getByTestId('customer-transactions')).toBeVisible()
        await expect(overdue).toHaveText('$0.00')

        const invoiceRow = transaction(page, invoice.id)
        const paymentRow = transaction(page, payment.id)
        await expect(invoiceRow.getByText('Paid', { exact: true })).toBeVisible()
        await expect(paymentRow.getByText('Payment', { exact: true })).toBeVisible()
        await expect(paymentRow.getByText(payment.number, { exact: true })).toBeVisible()
        await expect(paymentRow.getByText('Credit $100.00', { exact: true })).toBeVisible()

        // The Payments chip lists the payment only.
        await page.getByTestId('customer-transactions-filter-payment').click()
        await expect.poll(() => transactionIds(page)).toEqual([payment.id])

        // The row opens the payment.
        await paymentRow.click()
        await expectRecordUrl(page, 'payments', payment.id)
        await expect(page.getByTestId('payment-read-only')).toBeVisible()
    })
})
