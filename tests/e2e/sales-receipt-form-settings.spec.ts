import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { accountItem, DESKTOP, openChart, PHONE } from './account-register-helpers'
import { NEW_ESTIMATE_URL, openNewEstimate } from './estimate-helpers'
import { lineCellTestId, NEW_INVOICE_URL, openNewInvoice, uniqueMemo } from './invoice-helpers'
import {
    chooseReceiptSelect,
    leaveSettings,
    NEW_SALES_RECEIPT_URL,
    openNewSalesReceipt,
    openSalesReceiptBySearch,
    pickReceiptCustomer,
    pickReceiptLineProduct,
    receiptLineRowId,
    restoreSalesSettings,
    SALES_RECEIPT_URL,
    salesReceiptIdFromUrl,
    salesReceiptUrlOf,
    setDefaultMessage,
    setSalesDepositedTo,
    visibleTestId,
} from './sales-receipt-helpers'

// The sales receipt's keyboard-only create and edit (spec §3.11), and the home of every
// receipt test that depends on the shared Sales settings ("Sales deposited to", the
// default message): Playwright runs spec files in parallel, so only this file may rely on
// them. Both tests run with the settings as seeded (deposit account "Ask"), so Deposit to
// is shown and chosen by hand.
//
// After the form opens, no click: focus starts in Customer, Tab moves between fields, a
// select opens with Enter and its first-letter keys move through the options, Enter
// picks; ⌘⇧↵ is Post & new, ⌘↵ Post, `e` / `c` / `j` the read view's keys and `/` core's
// search palette (core binds the palette to `/`, not ⌘K). Each receipt carries a unique
// memo and reference; no seeded row is changed. Desktop only: the keyboard path runs the
// same code at phone size.
//
// The settings tests (checkpoint 5) change "Sales deposited to" and the default message
// through Settings → Sales; `afterEach` puts both back through the Settings UI (and 1200
// Undeposited funds active), so every later test starts from the seeded state. The set
// account is 1200, the "Ask" default, so a receipt another spec posts with the default
// lands on the same account in either mode. The hidden-mode test also runs at 390 wide:
// the phone band stacks the payment cells under the first row (other layout code), and
// the phone Settings list and select are other code than the rail.

const UNDEPOSITED = '1200 Undeposited funds'
const DEPOSIT_NOTE =
    'Ask shows Deposit to on every sales receipt. Choose an account to hide Deposit to and deposit every sale there.'
const MESSAGE_NOTE =
    'New invoices, estimates and sales receipts start with this message. You can change it on each one.'
const MESSAGE_CARD_TITLE = 'Invoices, estimates and sales receipts'
// server/accounts.go msgAccountIsSalesDeposit. PocketBase ends every message with a
// period and adds none to a text that has one, so this is the text the chart shows.
const SET_ACCOUNT_REFUSAL =
    'This account is where sales are deposited (Settings → Sales). Choose another account or Ask there first.'

function customerName(id: string) {
    const row = CUSTOMERS.find(c => c.id === id)
    if (!row) throw new Error(`no customer ${id} in the fixture`)
    return row.display_name
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

const HARBORVIEW = customerName(CUSTOMER_IDS.harborview)
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const MONEY = /-?\$[\d,]+\.\d{2}/

function uniqueReference() {
    return `R${Date.now().toString().slice(-8)}`
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

async function tabTo(page: Page, target: Locator) {
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
}

// Tabs until the target has focus, past stops whose order this test does not pin (the
// line's Taxable switch, its row menu, the add-line buttons, Message).
async function tabUntil(page: Page, target: Locator, maxStops: number) {
    for (let stop = 0; stop < maxStops; stop++) {
        await page.keyboard.press('Tab')
        if (await target.evaluate(el => el === document.activeElement)) return
    }
    await expect(target).toBeFocused()
}

// A core SelectInput with focus: Enter opens its menu, the letter key moves to the next
// option that starts with it, Enter picks the focused option.
async function pickByLetters(page: Page, key: string, letter: string, label: string) {
    const trigger = page.getByTestId(`form-input-${key}`)
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await expect(item).toBeVisible()
    for (let press = 0; press < 8; press++) {
        await page.keyboard.press(letter)
        if (await item.evaluate(el => el === document.activeElement)) break
    }
    await expect(item).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(item).toHaveCount(0)
    await expect(trigger).toContainText(label)
    // Core's layer focus gives focus back to the trigger one animation frame after the
    // menu closes (ui/overlay/focus.ts); a Tab before that frame starts from the body.
    await expect(trigger).toBeFocused()
}

// Core's search palette from the keyboard: `/`, the memo, arrow keys to the option whose
// text matches, Enter.
async function searchByKeys(page: Page, memo: string, option: RegExp) {
    await page.keyboard.press('/')
    const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
    await expect(input).toBeFocused()
    const searched = page.waitForResponse(
        r =>
            r.url().includes('/api/search') &&
            r.status() === 200 &&
            new URL(r.url()).searchParams.get('q') === memo
    )
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
    await expect(page).toHaveURL(SALES_RECEIPT_URL)
}

async function receiptNumber(page: Page): Promise<string> {
    const title = page.getByTestId('sales-receipt-title')
    await expect(title).toHaveText(/^Sales receipt \d+$/)
    const number = /^Sales receipt (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return number
}

async function moneyIn(locator: Locator): Promise<string> {
    const amount = MONEY.exec(await locator.innerText())?.[0]
    if (!amount) throw new Error('no amount in the element')
    return amount
}

test.describe('sales-receipt-form: settings and keyboard', () => {
    test.afterEach(async ({ page }) => {
        await restoreSalesSettings(page)
    })

    test('a sales receipt is created and posted from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Receipt keyboard create')
        const reference = uniqueReference()
        await openBooks(page)
        await openNewSalesReceipt(page)
        const customer = page.getByTestId('form-input-customer')
        await expect(customer).toBeFocused()

        // Type-to-open the customer picker; a pick moves on to Sale date.
        await page.keyboard.type('Harb')
        await expect(page.getByTestId('form-input-customer-search')).toBeFocused()
        await expect(page.getByRole('menuitem', { name: HARBORVIEW, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(customer).toContainText(HARBORVIEW)
        await expect(page.getByTestId('form-input-date')).toBeFocused()

        // The Bill to band's links are Tab stops right after Customer, in the order they
        // draw; the pick above passed over them to the next field (human, revise 1).
        const editAddress = page.getByTestId('sales-receipt-edit-address')
        const editCustomer = page.getByTestId('sales-receipt-edit-customer')
        await page.keyboard.press('Shift+Tab')
        await expect(editCustomer).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(editAddress).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(customer).toBeFocused()
        await tabTo(page, editAddress)
        await tabTo(page, editCustomer)
        await tabTo(page, page.getByTestId('form-input-date'))

        await tabTo(page, page.getByTestId('form-input-date-open'))
        await tabTo(page, page.getByTestId('form-input-tax_rate'))
        await tabTo(page, page.getByTestId('form-input-payment_method'))
        await pickByLetters(page, 'payment_method', 'c', 'Check')
        await tabTo(page, page.getByTestId('form-input-reference_no'))
        await page.keyboard.type(reference)
        await tabTo(page, page.getByTestId('form-input-deposit_to'))
        await pickByLetters(page, 'deposit_to', '1', '1000 Business Checking')

        const line1 = await receiptLineRowId(page, 0)
        const cell = (column: string) => page.getByTestId(lineCellTestId(line1, column))
        await tabTo(page, cell('product'))
        await page.keyboard.type(ACCESS_POINT)
        await expect(page.getByRole('menuitem', { name: ACCESS_POINT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(cell('product')).toContainText(ACCESS_POINT)
        await expect(cell('description')).toBeFocused()
        await tabTo(page, cell('quantity'))
        await page.keyboard.type('2')
        await tabTo(page, cell('rate'))
        await page.keyboard.type('50')
        await expect(cell('rate')).toHaveValue('50')
        const memoInput = page.getByTestId('form-input-memo')
        await tabUntil(page, memoInput, 10)
        await page.keyboard.type(memo)

        // Amount received is the total; a receipt has no Balance due.
        const total = await moneyIn(page.getByTestId('sales-receipt-total'))
        expect(await moneyIn(page.getByTestId('sales-receipt-total-received'))).toBe(total)
        await expect(page.getByTestId('sales-receipt-totals')).not.toContainText('Balance due')

        // ⌘⇧↵ posts and opens a fresh form with Customer focused.
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(/\/books\/sales-receipts\/new\?fresh=/)
        await expect(page.getByTestId('sales-receipt-title')).toHaveText('New sales receipt')
        await expect(customer).toBeFocused()
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')

        // With no customer only Edit address is offered; Space on it reveals the address
        // and Email inputs.
        await expect(editCustomer).toHaveCount(0)
        await tabTo(page, editAddress)
        await page.keyboard.press('Space')
        await expect(page.getByTestId('form-input-bill_to-line1')).toBeVisible()
        await expect(page.getByTestId('form-input-email')).toBeVisible()
        await expect(editAddress).toHaveCount(0)

        // Escape leaves the clean form; the search palette opens the posted receipt.
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(NEW_SALES_RECEIPT_URL)
        await searchByKeys(page, memo, /^Sales receipt \d+ · /)
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await receiptNumber(page)
        await expect(page.getByTestId('sales-receipt-badge')).toHaveText('Posted')
        await expect(page.getByTestId('sales-receipt-detail-payment')).toHaveText(
            `Check · ${reference} · deposited to 1000 Business Checking`
        )
        const readView = page.getByTestId('sales-receipt-read-only')
        await expect(readView).toContainText(ACCESS_POINT)
        await expect(readView).toContainText('100.00')
        await expect(page.getByTestId('sales-receipt-amount-received')).toContainText(total)

        // `c` copies it, with Customer focused.
        const id = salesReceiptIdFromUrl(page)
        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/books/sales-receipts/new\\?copy=${id}$`))
        await expect(customer).toBeFocused()
    })

    test('a posted sales receipt is edited from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Receipt keyboard edit')
        const reference = uniqueReference()
        const newReference = `${reference}X`
        await openBooks(page)

        // Setup through the form (clicks allowed).
        await openNewSalesReceipt(page)
        await pickReceiptCustomer(page, HARBORVIEW)
        await pickReceiptLineProduct(page, 0, ACCESS_POINT)
        await chooseReceiptSelect(page, 'payment_method', 'Check')
        await page.getByTestId('form-input-reference_no').fill(reference)
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('sales-receipt-post').click()
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        const id = salesReceiptIdFromUrl(page)
        const number = await receiptNumber(page)

        // From here on, keys only.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/sales-receipts/new\\?replaces=${id}$`))
        await expect(page.getByTestId('sales-receipt-title')).toHaveText(`Edit ${number}`)
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
        await tabTo(page, page.getByTestId('sales-receipt-edit-address'))
        await tabTo(page, page.getByTestId('sales-receipt-edit-customer'))
        await tabTo(page, page.getByTestId('form-input-date'))
        await tabTo(page, page.getByTestId('form-input-date-open'))
        await tabTo(page, page.getByTestId('form-input-tax_rate'))
        await tabTo(page, page.getByTestId('form-input-payment_method'))
        const referenceInput = page.getByTestId('form-input-reference_no')
        await tabTo(page, referenceInput)
        await expect(referenceInput).toHaveValue(reference)
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(newReference)
        await expect(referenceInput).toHaveValue(newReference)
        await tabTo(page, page.getByTestId('form-input-deposit_to'))
        await pickByLetters(page, 'deposit_to', '1', '1010 Business Savings')

        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await expect(page).not.toHaveURL(salesReceiptUrlOf(id))
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await expect(page.getByTestId('sales-receipt-title')).toHaveText(`Sales receipt ${number}`)
        await expect(page.getByTestId('sales-receipt-detail-payment')).toHaveText(
            `Check · ${newReference} · deposited to 1010 Business Savings`
        )

        // `j` opens its journal entry.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        await expect(page.getByTestId('entry-detail-type')).toContainText('Sales receipt')

        // The search palette reaches the original, now void and replaced.
        await searchByKeys(page, memo, /^Sales receipt \d+ \(void\) · /)
        await expect(page).toHaveURL(salesReceiptUrlOf(id))
        await expect(page.getByTestId('sales-receipt-badge')).toHaveText('Void')
        await expect(page.getByTestId('sales-receipt-replaced-by')).toHaveText(
            `Replaced by ${number} (edited)`
        )
    })

    for (const viewport of [DESKTOP, PHONE]) {
        const size = viewport === PHONE ? '390 wide' : 'desktop'
        test(`with an account set, a new sales receipt has no Deposit to and posts there (${size})`, async ({
            page,
        }) => {
            const memo = uniqueMemo(`Receipt hidden deposit ${viewport.width}`)
            await openBooks(page)
            if (viewport === PHONE) await page.setViewportSize(PHONE)

            await setSalesDepositedTo(page, UNDEPOSITED)
            await expect(page.getByText(DEPOSIT_NOTE, { exact: true })).toBeVisible()

            // The section list (the phone rows) names the set account.
            if (viewport !== PHONE) await page.setViewportSize(PHONE)
            await visibleTestId(page, 'books-settings-back').click()
            await expect(visibleTestId(page, 'books-settings-section-sales')).toContainText(
                `Sales deposited to ${UNDEPOSITED}`
            )
            if (viewport !== PHONE) await page.setViewportSize(DESKTOP)
            await leaveSettings(page)

            // Deposit to is not drawn: the payment row holds Payment method and Reference
            // no., and nothing on the form names the account.
            await openNewSalesReceipt(page)
            await expect(page.getByTestId('form-input-customer')).toBeVisible()
            await expect(page.getByTestId('sales-receipt-deposit-to')).toHaveCount(0)
            await expect(page.getByTestId('form-input-deposit_to')).toHaveCount(0)
            const payment = page.getByTestId('sales-receipt-payment')
            await expect(payment.getByTestId('form-input-payment_method')).toBeVisible()
            await expect(payment.getByTestId('form-input-reference_no')).toBeVisible()
            await expect(page.getByTestId('sales-receipt-form')).not.toContainText(
                'Undeposited funds'
            )

            // It posts; the server writes the set account.
            await pickReceiptLineProduct(page, 0, ACCESS_POINT)
            await page.getByTestId('form-input-memo').fill(memo)
            await page.getByTestId('sales-receipt-post').click()
            await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
            await expect(page).toHaveURL(SALES_RECEIPT_URL)
            await expect(page.getByTestId('sales-receipt-badge')).toHaveText('Posted')
            await expect(page.getByTestId('sales-receipt-detail-payment')).toHaveText(
                new RegExp(`deposited to ${UNDEPOSITED}$`)
            )
        })
    }

    test('the account set in Sales deposited to cannot be made inactive', async ({ page }) => {
        await openBooks(page)
        await setSalesDepositedTo(page, UNDEPOSITED)

        await openChart(page)
        const item = accountItem(page, 'Undeposited funds')
        await expect(item).toHaveCount(1)
        const answered = page.waitForResponse(
            response =>
                response.request().method() === 'PATCH' &&
                new URL(response.url()).pathname.includes(
                    '/api/collections/books_accounts/records/'
                )
        )
        await item.locator('[data-testid^="account-menu-"]').click()
        await page.getByRole('menuitem', { name: 'Make inactive', exact: true }).click()
        expect((await answered).status()).toBe(400)
        await expect(visibleTestId(page, 'accounts-action-error')).toHaveText(SET_ACCOUNT_REFUSAL)
        await expect(item).toHaveCount(1)
        await expect(item.getByText('Inactive', { exact: true })).toHaveCount(0)
    })

    test('the default message fills new invoices, estimates and sales receipts, never a saved one', async ({
        page,
    }) => {
        const memo = uniqueMemo('Receipt default message')
        // Each default has its own token, never the memo: while set, a default fills the
        // new receipts other workers make, and their messages are search-indexed, so a
        // memo inside it would let the memo search match those receipts too.
        const first = uniqueMemo('Default message A')
        const second = uniqueMemo('Default message B')
        await openBooks(page)
        await setDefaultMessage(page, first)
        await expect(page.getByText(MESSAGE_CARD_TITLE, { exact: true })).toBeVisible()
        await expect(page.getByText(MESSAGE_NOTE, { exact: true })).toBeVisible()
        await leaveSettings(page)

        // A new invoice starts with it; it is a start value, so Cancel leaves at once.
        const message = page.getByTestId('form-input-message')
        await openNewInvoice(page)
        await expect(message).toHaveValue(first)
        await page.getByTestId('invoice-cancel').click()
        await expect(page).not.toHaveURL(NEW_INVOICE_URL)

        // So does a new estimate; Cancel leaves it unsaved.
        await openNewEstimate(page)
        const estimateMessage = page.getByTestId('estimate-form').getByTestId('form-input-message')
        await expect(estimateMessage).toHaveValue(first)
        await page.getByTestId('estimate-cancel').click()
        await expect(page).not.toHaveURL(NEW_ESTIMATE_URL)

        // So does a new sales receipt, which is saved as a draft with it.
        await openNewSalesReceipt(page)
        await expect(message).toHaveValue(first)
        await pickReceiptLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('sales-receipt-save-draft').click()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await expect(page.getByTestId('sales-receipt-title')).toHaveText('Draft sales receipt')
        const id = salesReceiptIdFromUrl(page)
        await page.getByTestId('sales-receipt-cancel').click()
        await expect(page).not.toHaveURL(salesReceiptUrlOf(id))

        // A changed default changes no saved document: the reopened draft keeps the first.
        await setDefaultMessage(page, second)
        await leaveSettings(page)
        await openSalesReceiptBySearch(page, memo)
        await expect(page).toHaveURL(salesReceiptUrlOf(id))
        await expect(page.getByTestId('sales-receipt-title')).toHaveText('Draft sales receipt')
        await expect(message).toHaveValue(first)

        // Posted, its PDF view loads, and the stored message is what it prints
        // (server/pdf_sales_receipt_test.go pins the Notes block; the canvas has no text).
        await page.getByTestId('sales-receipt-post').click()
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await expect(page).toHaveURL(salesReceiptUrlOf(id))
        const pdf = page.waitForResponse(r =>
            r.url().includes(`/api/books/pdf/sales_receipt/${id}`)
        )
        await page.keyboard.press('Alt+2')
        expect((await pdf).status()).toBe(200)
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('sales-receipt-message')).toContainText(first)

        // Copy starts with the source's message, not the current default.
        await page.getByTestId('sales-receipt-read-copy').click()
        await expect(page).toHaveURL(new RegExp(`/books/sales-receipts/new\\?copy=${id}$`))
        await expect(page.getByTestId('sales-receipt-title')).toHaveText('New sales receipt')
        await expect(message).toHaveValue(first)
    })
})
