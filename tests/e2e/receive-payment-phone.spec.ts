import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, PHONE } from './account-register-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    customerWithInvoices,
    localDay,
    openNewPayment,
    PAYMENT_URL,
    paymentCard,
    paymentRow,
    pickPaymentCustomer,
    pickPaymentCustomerOnPhone,
    rowAmount,
} from './receive-payment-helpers'

// The receive-payment form below 640 px and Find invoice no. (spec §3.3, §3.5, §3.7).
// The phone post runs at 390: the outstanding list and the applied invoices are cards
// there, and the bar moves Post & new into More, which are other components than the wide
// grid. Find invoice no. runs at desktop width. Each test makes its own customer and
// invoices through the UI; the posted payment keeps today's date and carries a unique memo.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

test.describe('receive-payment: phone and find', () => {
    test('a payment is allocated on invoice cards and posted at phone size', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Payment phone')
        const { name, customerId, invoices } = await customerWithInvoices(page, [
            { rate: '300.00', dueDate: await localDay(page, 10) },
            { rate: '200.00', dueDate: await localDay(page, 20) },
        ])
        const [first, second] = invoices
        await openNewPayment(page)
        await page.setViewportSize(PHONE)

        await pickPaymentCustomerOnPhone(page, name, customerId)

        // One card per open invoice, with its own Original and Open balance labels; the
        // wide grid's rows are not drawn.
        const card1 = paymentCard(page, first.id)
        const card2 = paymentCard(page, second.id)
        await expect(card1).toContainText(`Invoice ${first.number}`)
        await expect(card1).toContainText('Original')
        await expect(card1).toContainText('Open balance')
        await expect(card1).toContainText('$300.00')
        await expect(card2).toContainText(`Invoice ${second.number}`)
        await expect(card2).toContainText('Original')
        await expect(card2).toContainText('Open balance')
        await expect(card2).toContainText('$200.00')
        await expect(paymentRow(page, first.id)).toHaveCount(0)
        await expect(paymentRow(page, second.id)).toHaveCount(0)

        // The cards have their own Pay all control: it pays every card, and Amount received
        // follows; pressed again, it clears every card and the amount it set.
        const tickAll = page.getByTestId('payment-tick-all')
        await expect(tickAll).toBeVisible()
        await tickAll.click()
        await expect(card1.getByTestId(`payment-row-amount-${first.id}`)).toHaveValue('300.00')
        await expect(card2.getByTestId(`payment-row-amount-${second.id}`)).toHaveValue('200.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('500.00')
        await tickAll.click()
        await expect(card1.getByTestId(`payment-row-amount-${first.id}`)).toHaveValue('')
        await expect(card2.getByTestId(`payment-row-amount-${second.id}`)).toHaveValue('')
        await expect(page.getByTestId('payment-amount')).toHaveValue('')

        // Ticking card 1 pays its open balance, and Amount received follows.
        await card1.getByTestId(`payment-row-tick-${first.id}`).click()
        await expect(card1.getByTestId(`payment-row-amount-${first.id}`)).toHaveValue('300.00')
        await expect(card2.getByTestId(`payment-row-amount-${second.id}`)).toHaveValue('')
        await expect(page.getByTestId('payment-amount')).toHaveValue('300.00')
        await page.getByTestId('payment-memo').fill(memo)

        // The phone bar has Post; Post & new is a row of More.
        await expect(page.getByTestId('payment-post')).toBeVisible()
        await expect(page.getByTestId('payment-post-new')).toHaveCount(0)
        await page.getByTestId('payment-more').click()
        await expect(page.getByTestId('payment-post-new')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('payment-post-new')).toHaveCount(0)

        await page.getByTestId('payment-post').click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-read-only')).toBeVisible()

        // The read view lists the applied invoice as a card with its own Applied label.
        const applied = page.getByTestId(`payment-applied-${first.id}`)
        await expect(applied).toContainText(`Invoice ${first.number}`)
        await expect(applied).toContainText('Applied')
        await expect(applied).toContainText('$300.00')
        await expect(page.getByTestId(`payment-applied-${second.id}`)).toHaveCount(0)
        await expect(page.getByTestId('payment-amount-applied')).toContainText('$300.00')
    })

    test('Find invoice no. looks an invoice up, then filters the listed rows', async ({ page }) => {
        await openBooks(page)
        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '125.00', dueDate: await localDay(page, 15) },
        ])
        const [invoice] = invoices
        await openNewPayment(page)
        const find = page.getByTestId('payment-find')
        const miss = page.getByTestId('payment-find-miss')
        const filterEmpty = page.getByTestId('payment-filter-empty')

        // With no customer, Enter looks the number up across the open invoices.
        await expect(page.getByTestId('payment-choose-customer')).toBeVisible()
        await find.fill('999999')
        await find.press('Enter')
        await expect(miss).toHaveText('No open invoice 999999')

        // A customer chosen in the picker clears the lookup text, so it does not become a
        // hidden filter: the customer's invoice shows.
        await pickPaymentCustomer(page, name)
        await expect(find).toHaveValue('')
        await expect(miss).toHaveCount(0)
        await expect(paymentRow(page, invoice.id)).toBeVisible()

        // Leave that form and start again with no customer.
        await page.getByTestId('payment-cancel').click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).not.toHaveURL(/\/books\/payments\//)
        await openNewPayment(page)
        await expect(page.getByTestId('payment-choose-customer')).toBeVisible()

        // One match picks its customer, pays that invoice in full, and clears the lookup text.
        await find.fill(invoice.number)
        await find.press('Enter')
        await expect(page.getByTestId('payment-customer')).toContainText(name)
        await expect(rowAmount(page, invoice.id)).toHaveValue('125.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('125.00')
        await expect(find).toHaveValue('')
        await expect(miss).toHaveCount(0)

        // With a customer, the text filters the rows by number prefix.
        await find.fill(invoice.number.slice(0, 2))
        await expect(paymentRow(page, invoice.id)).toBeVisible()
        await expect(filterEmpty).toHaveCount(0)
        await find.fill('ZZ')
        await expect(paymentRow(page, invoice.id)).toHaveCount(0)
        await expect(filterEmpty).toHaveText('No open invoice starts with ZZ')
        // The hidden row keeps its payment.
        await expect(page.getByTestId('payment-to-apply')).toContainText('$125.00')
        await find.fill('')
        await expect(filterEmpty).toHaveCount(0)
        await expect(paymentRow(page, invoice.id)).toBeVisible()
        await expect(rowAmount(page, invoice.id)).toHaveValue('125.00')

        // On a fresh form, an Amount received typed before the lookup is kept and applied
        // to the found invoice, up to its open balance.
        await page.getByTestId('payment-cancel').click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).not.toHaveURL(/\/books\/payments\//)
        await openNewPayment(page)
        await expect(page.getByTestId('payment-choose-customer')).toBeVisible()
        await page.getByTestId('payment-amount').fill('100.00')
        await find.fill(invoice.number)
        await find.press('Enter')
        await expect(page.getByTestId('payment-customer')).toContainText(name)
        await expect(rowAmount(page, invoice.id)).toHaveValue('100.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('100.00')
        await expect(page.getByTestId('payment-over')).toHaveCount(0)
    })
})
