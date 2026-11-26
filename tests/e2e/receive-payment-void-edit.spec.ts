import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'
import { customerPath } from './customer-form-helpers'
import { uniqueMemo } from './invoice-helpers'
import { searchEntries } from './journal-entries-helpers'
import {
    customerWithInvoices,
    localDay,
    PAYMENT_URL,
    paymentIdFromUrl,
    paymentRow,
    rowAmount,
} from './receive-payment-helpers'
import { expectRecordUrl } from './record-key-helpers'

// Void and Edit of a posted payment (spec §3.7, §3.9, Q8) at desktop width: the read view's
// Void opens its invoices again; Edit from the Journal Entries list opens the correction
// form, whose post keeps the number and voids the original. Each test makes its own
// customer and invoices through the UI; every payment it posts keeps today's date and
// carries a unique memo. No seeded invoice or payment is read or changed.

const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'
const VOID_TEXT =
    'A reversing entry is posted in the original period. The number is kept. The invoices it paid are open again.'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The customer page must be open. From its New transaction menu to a new payment that
// starts with this customer.
async function receivePaymentFor(page: Page, customerId: string, name: string) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-receive-payment').click()
    await expect(page).toHaveURL(new RegExp(`/books/payments/new\\?customer=${customerId}$`))
    await expect(page.getByTestId('payment-customer')).toContainText(name)
}

// A payment screen opened from the entries list stacks over the list, which stays mounted
// over the payment it came from: the payment test ids of the screen on top are the visible
// ones.
function shown(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// Posts the open payment form; returns the payment's id and number.
async function postPayment(page: Page) {
    await shown(page, 'payment-post').click()
    await expect(page).toHaveURL(PAYMENT_URL)
    await expect(shown(page, 'payment-read-only')).toBeVisible()
    const title = shown(page, 'payment-title')
    await expect(title).toHaveText(/^Payment \d+$/)
    const number = /^Payment (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the payment read view title has no number')
    return { id: await paymentIdFromUrl(page), number }
}

// The entries list row of this memo whose Type and status are these.
function entryRow(page: Page, type: RegExp, status?: RegExp) {
    const typed = page.locator(ROWS).filter({
        has: page.locator('[data-testid^="entries-cell-type-"]', { hasText: type }),
    })
    if (!status) return typed
    return typed.filter({
        has: page.locator('[data-testid^="entries-status-"]', { hasText: status }),
    })
}

async function entryIdOf(row: Locator) {
    return ((await row.getAttribute('data-testid')) ?? '').replace(/^entries-row-/, '')
}

test.describe('receive-payment: void and edit', () => {
    test('voiding a posted payment keeps its number and opens its invoice again', async ({
        page,
    }) => {
        await openBooks(page)
        const { name, customerId, invoices } = await customerWithInvoices(page, [
            { rate: '250.00', dueDate: await localDay(page, 10) },
        ])
        const [invoice] = invoices

        await receivePaymentFor(page, customerId, name)
        await page.getByTestId(`payment-row-tick-${invoice.id}`).click()
        await expect(rowAmount(page, invoice.id)).toHaveValue('250.00')
        await page.getByTestId('payment-memo').fill(uniqueMemo('Payment void'))
        const { number } = await postPayment(page)
        await expect(page.getByTestId('payment-read-edit')).toBeVisible()
        await expect(page.getByTestId('payment-read-void')).toBeVisible()
        const postedBy = await page.getByTestId('payment-posted-by').innerText()
        const user = /^Posted by (.+?), /.exec(postedBy)?.[1]
        if (!user) throw new Error(`no user in "${postedBy}"`)

        // V opens the Void dialog with the payment's own text.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(VOID_TEXT)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)

        await expect(page.getByTestId('payment-badge')).toHaveText('Void')
        await expect(page.getByTestId('payment-title')).toHaveText(`Payment ${number}`)
        await expect(page.getByTestId('payment-voided-by')).toContainText(`Voided by ${user}`)
        await expect(page.getByTestId('payment-read-edit')).toHaveCount(0)
        await expect(page.getByTestId('payment-read-void')).toHaveCount(0)
        await expect(page.getByTestId('payment-read-entry')).toBeVisible()

        // The invoice it paid is open again for its whole amount: its Open balance cell
        // reads $250.00 (the row's only money texts are Original and Open balance, both
        // $250.00; the Payment cell is an empty input), and ticking it pays $250.00.
        await page.goBack()
        await expect(page).toHaveURL(customerPath(customerId))
        await receivePaymentFor(page, customerId, name)
        const reopened = paymentRow(page, invoice.id)
        await expect(reopened).toBeVisible()
        await expect(rowAmount(page, invoice.id)).toHaveValue('')
        await expect(reopened.getByText(/^\$[\d,]+\.\d{2}$/)).toHaveText(['$250.00', '$250.00'])
        await page.getByTestId(`payment-row-tick-${invoice.id}`).click()
        await expect(rowAmount(page, invoice.id)).toHaveValue('250.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('250.00')
    })

    test('a payment edited from the Journal Entries list keeps its number', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Payment correction')
        const { name, customerId, invoices } = await customerWithInvoices(page, [
            { rate: '100.00', dueDate: await localDay(page, 10) },
            { rate: '200.00', dueDate: await localDay(page, 20) },
        ])
        const [first, second] = invoices

        await receivePaymentFor(page, customerId, name)
        await page.getByTestId(`payment-row-tick-${first.id}`).click()
        await expect(rowAmount(page, first.id)).toHaveValue('100.00')
        await page.getByTestId('payment-memo').fill(memo)
        const original = await postPayment(page)

        // The payment's entry: Type Payment, the customer named on both lines.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Payment')
        const names = entry.locator('[data-testid^="entry-line-party-"]')
        await expect.poll(() => names.count()).toBe(2)
        await expect.poll(async () => [...new Set(await names.allInnerTexts())]).toEqual([name])

        // The entry was opened from the payment, so its back link names the payment and
        // returns to it. The payment was opened from the customer page, so its own back link
        // (the same test id) replaces it with the Journal Entries list.
        const entryBack = entry.getByTestId('entry-back')
        await expect(entryBack).toHaveText('Payment')
        await entryBack.click()
        await expectRecordUrl(page, 'payments', original.id)
        await expect(shown(page, 'payment-title')).toHaveText(`Payment ${original.number}`)
        await expect(entry).toHaveCount(0)
        await shown(page, 'entry-back').click()

        // Journal Entries: the row reads Payment, and its Edit opens the correction.
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await searchEntries(page, memo)
        const row = entryRow(page, /^Payment$/)
        await expect(row).toHaveCount(1)
        const entryId = await entryIdOf(row)
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(original.number)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-edit').click()
        await expect(page).toHaveURL(new RegExp(`/books/payments/new\\?replaces=${original.id}$`))
        await expect(shown(page, 'payment-title')).toHaveText(`Edit payment ${original.number}`)

        // A correction keeps its customer: Customer shows it and cannot open, so the
        // first focus is Payment date.
        const customer = page.getByTestId('payment-customer')
        await expect(page.getByTestId('payment-date')).toBeFocused()
        await expect(customer).toContainText(name)
        await customer.click({ force: true })
        await expect(page.getByTestId('payment-customer-search')).toHaveCount(0)

        // The original's row, with both invoices listed; ticking the second follows.
        await expect(rowAmount(page, first.id)).toHaveValue('100.00')
        await expect(paymentRow(page, second.id)).toBeVisible()
        await page.getByTestId(`payment-row-tick-${second.id}`).click()
        await expect(rowAmount(page, second.id)).toHaveValue('200.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('300.00')

        const corrected = await postPayment(page)
        expect(corrected.id).not.toBe(original.id)
        expect(corrected.number).toBe(original.number)
        await expect(shown(page, `payment-applied-${first.id}`)).toContainText('$100.00')
        await expect(shown(page, `payment-applied-${second.id}`)).toContainText('$200.00')

        // The original's entry is Void, and the original names its replacement. The
        // correction replaced the form pushed over the list, so Back is the list.
        await page.goBack()
        await expect(page.getByTestId('entries-screen')).toBeVisible()
        await searchEntries(page, memo)
        const voided = entryRow(page, /^Payment$/, /^Void$/)
        await expect(voided).toHaveCount(1)
        const voidedId = await entryIdOf(voided)
        await page.getByTestId(`entries-row-menu-${voidedId}`).click()
        await page.getByTestId('entries-menu-open').click()
        await expectRecordUrl(page, 'payments', original.id)
        await expect(shown(page, 'payment-badge')).toHaveText('Void')
        await expect(shown(page, 'payment-replaced-by')).toHaveText(
            `Replaced by ${original.number} (edited)`
        )
    })
})
