import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    customerWithInvoices,
    localDay,
    openNewPayment,
    PAYMENT_URL,
    paymentRow,
    pickPaymentCustomer,
    rowAmount,
} from './receive-payment-helpers'

// The receive-payment form's keyboard-only create and edit (spec §3.1). After the form
// opens, no click: focus starts in Customer, Tab moves between fields, Enter in a Payment
// cell moves to the next row, ⌥↵ toggles a row, ⌥A pays every row, ⌘S / ⌘↵ / Esc / ⌘⌫ are
// the bar's keys, J the read view's View journal entry, and `/` core's search palette.
// Each test makes its own customer and invoices; every payment carries a unique memo and
// keeps today's date. Desktop only: the keyboard path runs the same code at phone size.

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

async function tabTo(page: Page, target: Locator) {
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
}

async function shiftTabTo(page: Page, target: Locator) {
    await page.keyboard.press('Shift+Tab')
    await expect(target).toBeFocused()
}

// A successful search for the memo. Registered before `/`: a palette reopened soon after
// it closed may refetch the memo's cached query at once on open, and the same typed text
// then sends no new request.
function memoSearched(page: Page, memo: string) {
    return page.waitForResponse(
        r =>
            r.url().includes('/api/search') &&
            r.status() === 200 &&
            new URL(r.url()).searchParams.get('q') === memo
    )
}

// Core's search palette from the keyboard: `/`, the memo, arrow keys to the option whose
// text matches, Enter.
async function searchByKeys(page: Page, memo: string, option: RegExp) {
    const searched = memoSearched(page, memo)
    await page.keyboard.press('/')
    const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
    await expect(input).toBeFocused()
    await page.keyboard.type(memo)
    await searched
    await expect(page.getByRole('option').filter({ hasText: option })).toHaveCount(1)
    const selected = page.getByRole('option', { selected: true })
    for (let step = 0; step < 10; step++) {
        if (option.test(await selected.innerText())) break
        await page.keyboard.press('ArrowDown')
    }
    await expect(selected).toHaveText(option)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(PAYMENT_URL)
}

const DRAFT_OPTION = /Draft payment · /

test.describe('receive-payment: keyboard', () => {
    test('a payment is entered, allocated and posted from the keyboard only', async ({ page }) => {
        await openBooks(page)
        const memo = uniqueMemo('Payment keyboard create')
        const yesterday = await localDay(page, -1)
        const inThirty = await localDay(page, 30)
        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '300.00', dueDate: yesterday },
            { rate: '200.00', dueDate: inThirty },
        ])
        const [first, second] = invoices
        await openNewPayment(page)

        // From here no click: Customer has focus, type-to-open picks, focus moves on.
        const customer = page.getByTestId('payment-customer')
        await expect(customer).toBeFocused()
        await page.keyboard.type(name)
        await expect(page.getByTestId('payment-customer-search')).toBeFocused()
        await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
        await page.keyboard.press('Enter')
        await expect(customer).toContainText(name)
        await expect(page.getByTestId('payment-date')).toBeFocused()

        // Spec §3.1 Tab order, one stop at a time. Core DateField's own
        // "Open calendar" button is part of the Payment date field.
        await tabTo(page, page.getByTestId('payment-date-open'))
        await tabTo(page, page.getByTestId('payment-method'))
        await tabTo(page, page.getByTestId('payment-reference'))
        await page.keyboard.type('CHK 4410')
        await tabTo(page, page.getByTestId('payment-deposit-to'))
        await tabTo(page, page.getByTestId('payment-amount'))
        await page.keyboard.type('350.00')

        // Typing Amount received spreads it oldest due first.
        await expect(rowAmount(page, first.id)).toHaveValue('300.00')
        await expect(rowAmount(page, second.id)).toHaveValue('50.00')
        await expect(page.getByTestId('payment-to-apply')).toContainText('$350.00')
        await expect(paymentRow(page, first.id)).toContainText('Overdue')
        await expect(paymentRow(page, second.id)).not.toContainText('Overdue')

        // Find invoice no. is the stop after Amount received, before the rows.
        await tabTo(page, page.getByTestId('payment-find'))

        // Each row's one Tab stop is its Payment cell; Enter moves down the rows.
        await tabTo(page, rowAmount(page, first.id))
        await page.keyboard.press('Enter')
        await expect(rowAmount(page, second.id)).toBeFocused()
        await page.keyboard.type('40.00')
        await expect(rowAmount(page, second.id)).toHaveValue('40.00')
        await expect(page.getByTestId('payment-to-credit')).toContainText('$10.00')
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('payment-clear')).toBeFocused()
        await tabTo(page, page.getByTestId('payment-memo'))
        await page.keyboard.type(memo)

        // ⌘↵ posts and opens the read view.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-read-only')).toBeVisible()
        await expect(page.getByTestId('payment-title')).toHaveText(/^Payment \d+$/)
        await expect(page.getByTestId('payment-detail-payment')).toContainText(
            'CHK 4410 · deposited to 1200 Undeposited funds'
        )
        await expect(page.getByTestId(`payment-applied-${first.id}`)).toContainText('$300.00')
        await expect(page.getByTestId(`payment-applied-${second.id}`)).toContainText('$40.00')
        await expect(page.getByTestId('payment-amount-applied')).toContainText('$340.00')
        await expect(page.getByTestId('payment-amount-credited')).toContainText('$10.00')

        // J opens the payment's journal entry.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/(?!new(?:[?#]|$))[a-z0-9]{15}$/)
    })

    test('a draft payment is edited, saved and deleted from the keyboard only', async ({
        page,
    }) => {
        await openBooks(page)
        const memo = uniqueMemo('Payment keyboard edit')
        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '100.00', dueDate: await localDay(page, 10) },
            { rate: '150.00', dueDate: await localDay(page, 20) },
        ])
        const [first, second] = invoices
        const amount = page.getByTestId('payment-amount')

        // Setup by pointer: a draft that pays invoice 1 in full.
        await openNewPayment(page)
        await pickPaymentCustomer(page, name)
        await page.getByTestId(`payment-row-tick-${first.id}`).click()
        await expect(rowAmount(page, first.id)).toHaveValue('100.00')
        await page.getByTestId('payment-memo').fill(memo)
        await page.getByTestId('payment-save-draft').click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-title')).toHaveText('Draft payment')
        await page.getByTestId('payment-cancel').click()
        await expect(page).not.toHaveURL(/\/books\/payments\//)

        // From here keyboard only.
        await searchByKeys(page, memo, DRAFT_OPTION)
        await expect(page.getByTestId('payment-customer')).toBeFocused()
        await tabTo(page, page.getByTestId('payment-date'))
        await tabTo(page, page.getByTestId('payment-date-open'))
        await tabTo(page, page.getByTestId('payment-method'))
        await tabTo(page, page.getByTestId('payment-reference'))
        await tabTo(page, page.getByTestId('payment-deposit-to'))
        await tabTo(page, amount)
        await tabTo(page, page.getByTestId('payment-find'))
        await tabTo(page, rowAmount(page, first.id))
        await tabTo(page, rowAmount(page, second.id))

        // A draft whose amount equals its applications follows its rows.
        await page.keyboard.press('Alt+Enter')
        await expect(rowAmount(page, second.id)).toHaveValue('150.00')
        await expect(amount).toHaveValue('250.00')
        await shiftTabTo(page, rowAmount(page, first.id))
        await page.keyboard.press('Alt+Enter')
        await expect(rowAmount(page, first.id)).toHaveValue('')
        await expect(amount).toHaveValue('150.00')

        // ⌘S saves; the last write of the save is the new application of invoice 2.
        const saved = page.waitForResponse(
            r =>
                r.url().includes('/api/collections/books_payment_applications/records') &&
                r.request().method() === 'POST' &&
                r.ok()
        )
        await page.keyboard.press('ControlOrMeta+s')
        await saved
        await expect(page.getByTestId('payment-title')).toHaveText('Draft payment')

        // Esc with no edits leaves at once.
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(page).not.toHaveURL(/\/books\/payments\//)

        // Reopened: the saved rows and amount.
        await searchByKeys(page, memo, DRAFT_OPTION)
        await expect(page.getByTestId('payment-title')).toHaveText('Draft payment')
        await expect(rowAmount(page, first.id)).toHaveValue('')
        await expect(rowAmount(page, second.id)).toHaveValue('150.00')
        await expect(amount).toHaveValue('150.00')

        // ⌥A pays every row, and Amount received follows.
        await page.keyboard.press('Alt+a')
        await expect(rowAmount(page, first.id)).toHaveValue('100.00')
        await expect(rowAmount(page, second.id)).toHaveValue('150.00')
        await expect(amount).toHaveValue('250.00')

        // Esc asks before it drops the edits; Esc again closes only the dialog.
        const discard = page.getByTestId('discard-dialog')
        await page.keyboard.press('Escape')
        await expect(discard).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(discard).toHaveCount(0)
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(amount).toHaveValue('250.00')

        // ⌘⌫ asks to delete the draft; the dialog's submit key confirms.
        const deleteDialog = page.getByTestId('delete-draft-dialog')
        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(deleteDialog).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).not.toHaveURL(/\/books\/payments\//)
        await expect(page.getByTestId('payment-form')).toHaveCount(0)

        // The search palette no longer finds the memo.
        const searched = memoSearched(page, memo)
        await page.keyboard.press('/')
        const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
        await expect(input).toBeFocused()
        await page.keyboard.type(memo)
        await searched
        await expect(page.getByRole('option').filter({ hasText: DRAFT_OPTION })).toHaveCount(0)
    })
})
