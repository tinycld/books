import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { DESKTOP } from './account-register-helpers'
import { invoiceIdFromUrl, localToday, openInvoiceBySearch } from './invoice-helpers'
import { localDay, PAYMENT_URL, rowAmount } from './receive-payment-helpers'
import {
    BAD_DEBTS,
    holdWriteOffInsert,
    invoiceToWriteOff,
    openPostedInvoiceBySearch,
    writeOffOpenInvoice,
    writeOffToast,
} from './write-off-helpers'

// The Write off dialog on an invoice (write-off spec §3.1–§3.4): W on a posted invoice with
// an open balance, the dialog's default date and account, the keyboard path, the date
// rules, the live figure while another user posts a payment, the held write, and the
// invoice after a write-off (badge, Written off total, Write-offs section, no W and no
// Receive payment, Void and Edit refused by the server). Each test makes its own customer
// and invoice through the UI and opens the invoice through Books search; every write-off
// goes to 6050 Bad debts (plan decision 10). No setting is changed.
//
// Not driven here (plan notes): the dialog's loading, load-error, no-account and offline
// states (unit-tested writeOffDialogState), the section's load error, and the server's
// amount refusal (the dialog's figure is live, so the UI never sends a stale amount).

const WRITTEN_OFF_REFUSAL = 'This invoice is written off. Void the write-off first.'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The element of the screen on top: Books keeps an earlier screen mounted and hidden under
// a pushed one.
function shown(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

function invoiceUrlOf(id: string) {
    return new RegExp(`/books/invoices/${id}$`)
}

// The Write-offs section's rows: `invoice-write-off-<id>`, never the links
// (`invoice-write-off-link-<id>`) or the section's own `invoice-write-offs-…` ids.
function writeOffRows(section: Locator) {
    return section.locator(
        '[data-testid^="invoice-write-off-"]:not([data-testid^="invoice-write-off-link-"])'
    )
}

test.describe('write-off: dialog', () => {
    test('writes off an invoice from the keyboard only', async ({ page }) => {
        await openBooks(page)
        const { number } = await invoiceToWriteOff(page, 'Write-off keys')
        const id = invoiceIdFromUrl(page)
        await expect(shown(page, 'invoice-read-write-off')).toBeVisible()

        // From here on, keys only.
        await page.keyboard.press('w')
        const dialog = page.getByTestId('write-off-dialog')
        await expect(dialog).toBeVisible()
        const date = page.getByTestId('write-off-date')
        await expect(date).toBeFocused()
        await expect(page.getByTestId('write-off-amount')).toHaveText('$400.00')
        await expect(page.getByTestId('write-off-account')).toContainText(BAD_DEBTS)
        await expect(page.getByTestId('write-off-submit')).toContainText('Write off $400.00')

        // Date → its Open calendar button → Write off to → Reason.
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('write-off-account')).toBeFocused()
        await page.keyboard.press('Tab')
        const reason = page.getByTestId('write-off-reason')
        await expect(reason).toBeFocused()
        await page.keyboard.type('Customer closed the business')
        await expect(reason).toHaveValue('Customer closed the business')
        await page.keyboard.press('ControlOrMeta+Enter')

        await expect(writeOffToast(page, number, '$400.00')).toBeVisible()
        await expect(dialog).toHaveCount(0)
        await expect(page).toHaveURL(invoiceUrlOf(id))
        await expect(shown(page, 'invoice-badge')).toHaveText('Written off')
        await expect(shown(page, 'invoice-total-written-off')).toContainText('Written off')
        await expect(shown(page, 'invoice-total-written-off')).toContainText('−$400.00')
        await expect(shown(page, 'invoice-total-balance')).toContainText('$0.00')
        await expect(shown(page, 'invoice-balance-due')).toHaveText('$0.00')
        const section = shown(page, 'invoice-write-offs')
        await expect(section).toBeVisible()
        await expect(writeOffRows(section)).toHaveCount(1)
        await expect(writeOffRows(section).first()).toContainText('Posted')
        await expect(writeOffRows(section).first()).toContainText('$400.00')
        await expect(page.getByTestId('invoice-read-write-off')).toHaveCount(0)
        await expect(page.getByTestId('invoice-read-receive-payment')).toHaveCount(0)

        // W is no longer registered: it opens nothing. The search palette's key after it
        // proves the read view handled the W first.
        await page.keyboard.press('w')
        await page.keyboard.press('/')
        await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
        await expect(page.getByTestId('write-off-dialog')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
    })

    test('refuses a date before the invoice date and writes nothing', async ({ page }) => {
        await openBooks(page)
        await invoiceToWriteOff(page, 'Write-off early date')
        const today = await localToday(page)
        const dayBefore = await localDay(page, -1)

        await page.keyboard.press('w')
        const dialog = page.getByTestId('write-off-dialog')
        await expect(dialog).toBeVisible()
        const date = page.getByTestId('write-off-date')
        await expect(date).toBeFocused()
        await expect(date).toHaveValue(today)

        await date.fill(dayBefore)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('write-off-date-error')).toHaveText(
            `Date the write-off on or after the invoice date, ${formatDay(today)}.`
        )
        await expect(dialog).toBeVisible()

        await date.fill('')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('write-off-date-error')).toHaveText('Enter a date')
        await expect(dialog).toBeVisible()

        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('invoice-write-offs')).toHaveCount(0)
        await expect(shown(page, 'invoice-badge')).toHaveText('Posted')
        await expect(shown(page, 'invoice-balance-due')).toHaveText('$400.00')
        await expect(shown(page, 'invoice-read-write-off')).toBeVisible()
    })

    test('follows a payment posted while the dialog is open', async ({ page }) => {
        await openBooks(page)
        const { memo, number } = await invoiceToWriteOff(page, 'Write-off live')
        const id = invoiceIdFromUrl(page)

        await page.keyboard.press('w')
        const dialog = page.getByTestId('write-off-dialog')
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('write-off-amount')).toHaveText('$400.00')
        await expect(page.getByTestId('write-off-submit')).toContainText('Write off $400.00')

        // Another user, in a second page: a payment of $100.00 through Receive payment.
        const other = await page.context().newPage()
        await openBooks(other)
        await openInvoiceBySearch(other, memo)
        await expect(other).toHaveURL(invoiceUrlOf(id))
        await other.keyboard.press('r')
        await expect(rowAmount(other, id)).toHaveValue('400.00')
        await rowAmount(other, id).fill('100.00')
        await expect(other.getByTestId('payment-amount')).toHaveValue('100.00')
        await other.getByTestId('payment-post').click()
        await expect(other).toHaveURL(PAYMENT_URL)
        await expect(other.getByTestId('payment-read-only')).toBeVisible()
        await other.close()

        // The open dialog follows the live balance.
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('write-off-amount')).toHaveText('$300.00')
        await expect(page.getByTestId('write-off-submit')).toContainText('Write off $300.00')

        // While the insert is held: the dialog stays, its fields are disabled, and neither
        // Escape nor Cancel closes it.
        const held = await holdWriteOffInsert(page)
        await page.getByTestId('write-off-submit').click()
        await held.arrived
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('write-off-date')).not.toBeEditable()
        await expect(page.getByTestId('write-off-account')).toHaveAttribute('aria-disabled', 'true')
        await expect(page.getByTestId('write-off-reason')).not.toBeEditable()
        await page.keyboard.press('Escape')
        await expect(dialog).toBeVisible()
        await page.getByTestId('write-off-cancel').click({ force: true })
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('write-off-amount')).toHaveText('$300.00')

        await held.release()
        await expect(writeOffToast(page, number, '$300.00')).toBeVisible()
        await expect(dialog).toHaveCount(0)
        await expect(page).toHaveURL(invoiceUrlOf(id))
        await expect(shown(page, 'invoice-total-written-off')).toContainText('−$300.00')
        await expect(shown(page, 'invoice-total-payments')).toContainText('−$100.00')
        await expect(shown(page, 'invoice-balance-due')).toHaveText('$0.00')
        await expect(shown(page, 'invoice-badge')).toHaveText('Written off')
    })

    test('a written-off invoice refuses Void and Edit', async ({ page }) => {
        await openBooks(page)
        const { memo, number } = await invoiceToWriteOff(page, 'Write-off refusals')
        const id = invoiceIdFromUrl(page)
        await writeOffOpenInvoice(page)
        await expect(shown(page, 'invoice-badge')).toHaveText('Written off')

        // The bar keeps Edit, Void, Copy and Create credit memo (plan decision 1).
        await expect(shown(page, 'invoice-read-edit')).toBeVisible()
        await expect(shown(page, 'invoice-read-void')).toBeVisible()
        await expect(shown(page, 'invoice-read-copy')).toBeVisible()
        await expect(shown(page, 'invoice-read-credit-memo')).toBeVisible()

        // Void: the server refuses; the dialog stays open with its text.
        await shown(page, 'invoice-read-void').click()
        const voidDialog = page.getByTestId('void-dialog')
        await expect(voidDialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(voidDialog).toContainText(WRITTEN_OFF_REFUSAL)
        await expect(voidDialog).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(voidDialog).toHaveCount(0)
        await expect(shown(page, 'invoice-badge')).toHaveText('Written off')

        // Edit: the correction's Post is refused into the form's error summary.
        const editUrl = new RegExp(`/books/invoices/new\\?replaces=${id}$`)
        await shown(page, 'invoice-read-edit').click()
        await expect(page).toHaveURL(editUrl)
        await expect(page.getByTestId('invoice-title')).toHaveText(`Edit ${number}`)
        await page.getByTestId('invoice-post').click()
        await expect(page.getByTestId('invoice-error-summary')).toContainText(WRITTEN_OFF_REFUSAL)
        await expect(page).toHaveURL(editUrl)

        // Leave the form; the original is still posted and written off.
        await page.getByTestId('invoice-cancel').click()
        await expect(page).not.toHaveURL(editUrl)
        await openPostedInvoiceBySearch(page, memo, number)
        await expect(page).toHaveURL(invoiceUrlOf(id))
        await expect(shown(page, 'invoice-title')).toHaveText(`Invoice ${number}`)
        await expect(shown(page, 'invoice-badge')).toHaveText('Written off')
        await expect(shown(page, 'invoice-read-void')).toBeVisible()
    })
})
