import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { PHONE } from './account-register-helpers'
import {
    applyCell,
    applyDialogOf,
    customerWithInvoiceAndMemo,
    openApplyFromInvoice,
} from './apply-credit-helpers'
import { INVOICE_URL, localToday, uniqueMemo } from './invoice-helpers'
import { settleFrames } from './journal-entries-helpers'
import { shown } from './pay-bills-helpers'
import { localDay, PAYMENT_URL, paymentIdFromUrl, rowAmount } from './receive-payment-helpers'
import { openPostedInvoiceBySearch } from './write-off-helpers'

// Applying a customer's credit memos to a posted invoice from the invoice's read view (apply
// credit spec §3.1, §3.3, §3.6, §3.7), checkpoint 4: the invoice's Apply credit action (A)
// and notice with the payments line, the shared apply dialog with the invoice fixed, the
// Credits applied row, the credit rows of the Payments block with Remove, the void refusal
// of a credited invoice, and the phone path (Sheet, cards, More, stacked block rows). Every
// test makes its own customer, invoices and credit memo through the UI
// (`customerWithInvoiceAndMemo`) and opens the invoice through Books search.
//
// Not driven here: the dialog's loading, offline and "no unapplied credit" states, the
// invoice's load errors and a create refusal of the server (pure helpers with unit tests,
// and checkpoint 3's failed-reads test runs the same components).

const MINUS = '−'
const INVOICE_VOID_REFUSED = 'Credit memos are applied to this invoice. Remove them first.'
const CREDIT_ROWS = '[data-testid^="invoice-credit-"]:not([data-testid^="invoice-credit-remove-"])'
const REMOVE_BUTTONS = '[data-testid^="invoice-credit-remove-"]'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

function noticeText(customer: string, amount: string, memos: number) {
    const count = memos === 1 ? '1 credit memo' : `${memos} credit memos`
    return `${customer} has ${amount} of unapplied credit on ${count}.`
}

function paymentLineText(number: string, amount: string) {
    return `Payment ${number} has ${amount} that is not applied to an invoice. Open the payment and edit it to apply that amount.`
}

// The Payments block's credit rows (not their Remove buttons).
function creditRows(block: Locator) {
    return block.locator(CREDIT_ROWS)
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
    return { id: paymentIdFromUrl(page), number }
}

test.describe('apply-credit: from an invoice', () => {
    test('applies a credit memo to the invoice from its read view', async ({ page }) => {
        await openBooks(page)
        // The memo is made from the second invoice, so nothing but the customer ties it to
        // the first.
        const { name, invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Invoice apply',
            invoices: [
                { rate: '400.00', dueDays: 30 },
                { rate: '200.00', dueDays: 20 },
            ],
            memo: { rate: '150.00', fromInvoice: 1 },
        })
        const [invoice] = invoices
        const todayIso = await localToday(page)
        await openPostedInvoiceBySearch(page, invoice.memo, invoice.number)

        const notice = shown(page, 'invoice-apply-notice')
        await expect(notice).toContainText(noticeText(name, '$150.00', 1))

        // A: the dialog with the invoice fixed and the memo's credit placed.
        await page.keyboard.press('a')
        const dialog = applyDialogOf(page)
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Apply credit to invoice ${invoice.number}`)
        await expect(dialog).toContainText('Open balance')
        await expect(page.getByTestId('apply-credit-figure')).toContainText('$400.00')
        const cell = applyCell(page, memo.id)
        await expect(cell).toHaveValue('150.00')
        await expect(page.getByTestId('apply-credit-summary')).toHaveText(
            'Applying $150.00 from 1 credit memo · $250.00 stays due'
        )

        // The Apply date is set once, at open: after the writer types a later day, ⌥↵ unticks
        // and ticks the row again and the typed day stays. The memo is dated today, so a date
        // derived again on a tick (today, or the latest ticked credit date) would be today.
        const date = page.getByTestId('apply-credit-date')
        await expect(cell).toBeFocused()
        await expect(date).toHaveValue(todayIso)
        const typedIso = await localDay(page, 1)
        await date.fill(typedIso)
        await expect(date).toHaveValue(typedIso)
        await cell.focus()
        await page.keyboard.press('Alt+Enter')
        await expect(cell).toHaveValue('')
        await page.keyboard.press('Alt+Enter')
        await expect(cell).toHaveValue('150.00')
        await expect(date).toHaveValue(typedIso)

        // ⌘↵: Apply credit.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog).toHaveCount(0)
        await expect(
            page.getByText('Applied $150.00 from 1 credit memo', { exact: true })
        ).toBeVisible()
        await expect(shown(page, 'invoice-total-credits-applied')).toContainText(`${MINUS}$150.00`)
        await expect(shown(page, 'invoice-balance-due')).toHaveText('$250.00')
        const block = shown(page, 'invoice-payments')
        await expect(creditRows(block)).toHaveCount(1)
        await expect(creditRows(block)).toContainText(
            `Credit memo ${memo.number} · ${formatDay(typedIso)} · $150.00`
        )

        // No unapplied credit is left: no notice, no Apply credit, and A opens nothing.
        await expect(page.getByTestId('invoice-apply-notice')).toHaveCount(0)
        await expect(page.getByTestId('invoice-read-apply')).toHaveCount(0)
        await page.keyboard.press('a')
        await settleFrames(page)
        await expect(dialog).toHaveCount(0)
    })

    test('a credited invoice refuses a void; Remove gives the credit back', async ({ page }) => {
        await openBooks(page)
        const { name, invoices } = await customerWithInvoiceAndMemo(page, {
            label: 'Invoice remove',
            invoices: [{ rate: '400.00', dueDays: 30 }],
            memo: { rate: '150.00', fromInvoice: null },
        })
        const [invoice] = invoices
        await openPostedInvoiceBySearch(page, invoice.memo, invoice.number)
        await openApplyFromInvoice(page)
        await page.getByTestId('apply-credit-submit').click()
        await expect(applyDialogOf(page)).toHaveCount(0)
        await expect(shown(page, 'invoice-total-credits-applied')).toContainText(`${MINUS}$150.00`)
        await expect(page.getByTestId('invoice-apply-notice')).toHaveCount(0)
        await expect(shown(page, 'invoice-badge')).toHaveText('Partly paid')

        // Void: refused in the void dialog; the invoice stays posted.
        await shown(page, 'invoice-read-void').click()
        const voidDialog = page.getByTestId('void-dialog')
        await expect(voidDialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(voidDialog).toContainText(INVOICE_VOID_REFUSED)
        await expect(voidDialog).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(voidDialog).toHaveCount(0)
        await expect(shown(page, 'invoice-badge')).toHaveText('Partly paid')

        // Remove on the Payments block's credit row, then Confirm.
        const block = shown(page, 'invoice-payments')
        await expect(creditRows(block)).toHaveCount(1)
        await block.locator(REMOVE_BUTTONS).first().click()
        const confirm = page.getByTestId('remove-application-dialog')
        await expect(confirm).toBeVisible()
        await page.getByTestId('remove-application-confirm').click()
        await expect(confirm).toHaveCount(0)

        await expect(page.getByTestId('invoice-total-credits-applied')).toHaveCount(0)
        await expect(shown(page, 'invoice-balance-due')).toHaveText('$400.00')
        await expect(shown(page, 'invoice-apply-notice')).toContainText(
            noticeText(name, '$150.00', 1)
        )
        await expect(shown(page, 'invoice-apply-notice-action')).toBeVisible()
    })

    test('names a payment that is not applied, and credit pays the invoice in full', async ({
        page,
    }) => {
        await openBooks(page)
        const { invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Invoice paid by credit',
            invoices: [
                { rate: '150.00', dueDays: 30 },
                { rate: '200.00', dueDays: 20 },
            ],
            memo: { rate: '150.00', fromInvoice: 1 },
        })
        const [invoice, other] = invoices
        await openPostedInvoiceBySearch(page, invoice.memo, invoice.number)

        // A payment of $100.00 applied to no invoice: Receive payment, the amount typed,
        // every row cleared, so all of it is kept as a credit.
        await shown(page, 'invoice-read-receive-payment').click()
        await expect(page).toHaveURL(/\/books\/payments\/new\?/)
        const amount = page.getByTestId('payment-amount')
        await amount.fill('100.00')
        await rowAmount(page, invoice.id).fill('')
        await rowAmount(page, other.id).fill('')
        await expect(amount).toHaveValue('100.00')
        await expect(page.getByTestId('payment-to-credit')).toContainText('$100.00')
        await page.getByTestId('payment-memo').fill(uniqueMemo('Invoice payment not applied'))
        const payment = await postPayment(page)

        // The invoice's notice names the payment; its number opens the payment.
        await openPostedInvoiceBySearch(page, invoice.memo, invoice.number)
        const notice = shown(page, 'invoice-apply-notice')
        await expect(notice).toContainText(paymentLineText(payment.number, '$100.00'))
        await shown(page, `invoice-unapplied-payment-${payment.id}`).click()
        await expect(page).toHaveURL(new RegExp(`/books/payments/${payment.id}$`))
        await expect(shown(page, 'payment-read-only')).toBeVisible()
        await page.goBack()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(shown(page, 'invoice-read-only')).toBeVisible()

        // The dialog names the payment under its list too; the memo covers the whole
        // balance.
        await openApplyFromInvoice(page)
        await expect(page.getByTestId('apply-credit-payments-line')).toContainText(
            paymentLineText(payment.number, '$100.00')
        )
        await expect(applyCell(page, memo.id)).toHaveValue('150.00')
        await page.getByTestId('apply-credit-submit').click()
        await expect(applyDialogOf(page)).toHaveCount(0)

        await expect(shown(page, 'invoice-badge')).toHaveText('Paid')
        await expect(shown(page, 'invoice-balance-due')).toHaveText('$0.00')
        // The second invoice's read view stays mounted hidden under this one and
        // rightly offers both actions, so only the visible bar counts.
        await expect(shown(page, 'invoice-read-actions')).toBeVisible()
        await expect(shown(page, 'invoice-read-receive-payment')).toHaveCount(0)
        await expect(shown(page, 'invoice-read-write-off')).toHaveCount(0)
    })

    test('on a phone, More holds Apply credit and the Sheet applies it', async ({ page }) => {
        await openBooks(page)
        const { invoices, memo } = await customerWithInvoiceAndMemo(page, {
            label: 'Invoice apply phone',
            invoices: [{ rate: '400.00', dueDays: 30 }],
            memo: { rate: '150.00', fromInvoice: null },
        })
        const [invoice] = invoices
        await openPostedInvoiceBySearch(page, invoice.memo, invoice.number)
        await page.setViewportSize(PHONE)
        const more = shown(page, 'invoice-read-more')
        await expect(more).toBeVisible()

        // The phone bar: Edit and More; Apply credit is no bar button.
        const bar = shown(page, 'invoice-read-actions')
        await expect(bar.getByTestId('invoice-read-edit')).toBeVisible()
        await expect(bar.getByTestId('invoice-read-apply')).toHaveCount(0)

        // More holds Apply credit with its key.
        await more.click()
        const row = page.getByTestId('invoice-read-apply')
        await expect(row).toBeVisible()
        await expect(row).toContainText(/Apply credit\s*a$/i)
        await row.click()

        // The Sheet, by its title: one card with the memo and a full-width Credit to apply
        // input.
        const title = page.getByText(`Apply credit to invoice ${invoice.number}`, {
            exact: true,
        })
        await expect(title).toBeVisible()
        const cards = page.locator('[data-testid^="apply-credit-card-"]')
        await expect(cards).toHaveCount(1)
        const card = page.getByTestId(`apply-credit-card-${memo.id}`)
        await expect(card).toContainText(`Credit memo ${memo.number}`)
        const cell = applyCell(page, memo.id)
        await expect(cell).toHaveValue('150.00')
        await expect
            .poll(async () => {
                const cardBox = await card.boundingBox()
                const cellBox = await cell.boundingBox()
                if (!cardBox || !cellBox) return false
                return cellBox.width >= cardBox.width - 64
            })
            .toBe(true)

        await page.getByTestId('apply-credit-submit').click()
        await expect(title).toHaveCount(0)

        // The Payments block's credit row: Remove under the link.
        const block = shown(page, 'invoice-payments')
        const credit = creditRows(block)
        await expect(credit).toHaveCount(1)
        await expect(credit).toContainText(`Credit memo ${memo.number}`)
        const link = credit.getByRole('link')
        const remove = block.locator(REMOVE_BUTTONS).first()
        await expect(remove).toBeVisible()
        await expect
            .poll(async () => {
                const linkBox = await link.boundingBox()
                const removeBox = await remove.boundingBox()
                if (!linkBox || !removeBox) return false
                return removeBox.y >= linkBox.y + linkBox.height - 1
            })
            .toBe(true)
    })
})
