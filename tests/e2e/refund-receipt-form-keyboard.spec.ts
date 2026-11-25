import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { batchAnswered } from './document-batch-helpers'
import { lineCellTestId, uniqueMemo } from './invoice-helpers'
import { shiftTabTo, tabTo } from './keyboard-helpers'
import { expectNotRecordUrl, expectRecordUrl } from './record-key-helpers'
import {
    NEW_REFUND_RECEIPT_URL,
    openNewRefundReceipt,
    REFUND_RECEIPT_URL,
    refundLineRowId,
    refundReceiptIdFromUrl,
} from './refund-receipt-helpers'

// The refund receipt's keyboard-only create and edit (refund receipt spec §3.2, §3.4,
// §3.7). After the form opens from the New menu, no click: focus starts in Customer, Tab
// moves between fields, Enter picks a typed customer or product, a select opens on Enter
// and its option is picked by typing its first letter; ⌘↵ is Post, ⌘S Save draft, Escape
// Cancel, and `/` core's search palette. Each refund carries a unique memo and the default
// date; no seeded row is changed. Desktop only: the keyboard path runs the same code at
// phone size.

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

// Harborview: Denver combined as its default tax. Wireless access point: a taxable
// seeded product.
const HARBORVIEW = customerName(CUSTOMER_IDS.harborview)
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const CHECKING = '1000 Business Checking'
const SAVINGS = '1010 Business Savings'
// Specs of other files pay from the same bank accounts in the shared database, so a
// balance may be below zero when this file runs; a minus is "-" or "−" (U+2212).
const BALANCE = /^Balance [-−]?\$[\d,]+\.\d{2}$/

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// The signed amount of a totals row in cents; a minus is "-" or "−" (U+2212).
async function centsIn(locator: Locator): Promise<number> {
    const match = /([-−]?)\$([\d,]+)\.(\d{2})/.exec(await locator.innerText())
    if (!match) throw new Error('no amount in the element')
    const cents = Number(match[2].replaceAll(',', '')) * 100 + Number(match[3])
    return match[1] ? -cents : cents
}

// A focused core SelectInput from the keyboard: Enter opens it, the option's first
// letter is typed until that option has focus, Enter picks it and focus returns to the
// select.
async function chooseByTyping(page: Page, select: Locator, letter: string, label: string) {
    await expect(select).toBeFocused()
    await page.keyboard.press('Enter')
    const focused = page.locator('[role="menuitem"]:focus')
    for (let step = 0; step < 8; step++) {
        await page.keyboard.press(letter)
        await expect(focused).toHaveCount(1)
        if ((await focused.innerText()).trim() === label) break
    }
    await expect(focused).toHaveText(label)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toHaveCount(0)
    await expect(select).toContainText(label)
    await expect(select).toBeFocused()
}

// Type-to-open the Customer picker from its focused trigger; the pick moves on to the
// Refund date.
async function pickCustomerByKeys(page: Page, typed: string, name: string) {
    await page.keyboard.type(typed)
    await expect(page.getByTestId('form-input-customer-search')).toBeFocused()
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('form-input-customer')).toContainText(name)
    await expect(page.getByTestId('form-input-date')).toBeFocused()
}

// From a focused Refund date to line 1's Product, one stop at a time (spec §3.4): the
// date's calendar button, Tax, Payment method, Reference no., Refund from, Product.
async function tabDateToProduct(page: Page, cell: (column: string) => Locator) {
    await tabTo(page, page.getByTestId('form-input-date-open'))
    await tabTo(page, page.getByTestId('form-input-tax_rate'))
    await tabTo(page, page.getByTestId('form-input-payment_method'))
    await tabTo(page, page.getByTestId('form-input-reference_no'))
    await tabTo(page, page.getByTestId('form-input-refund_from'))
    await tabTo(page, cell('product'))
}

// From the line's Rate to Memo: the Taxable switch, the row menu, Add line and Add…,
// Message, Memo.
async function tabRateToMemo(page: Page, line: string, cell: (column: string) => Locator) {
    await tabTo(page, cell('taxable').getByRole('switch'))
    await tabTo(page, page.getByTestId(`form-table-lines-menu-${line}`))
    await tabTo(page, page.getByTestId('form-table-lines-add'))
    await tabTo(page, page.getByTestId('form-table-lines-add-more'))
    await tabTo(page, page.getByTestId('form-input-message'))
    await tabTo(page, page.getByTestId('form-input-memo'))
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
    await expect(page).toHaveURL(REFUND_RECEIPT_URL)
}

test.describe('refund-receipt-form: keyboard', () => {
    test('a refund receipt is created and posted from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Refund receipt keyboard create')
        const reference = `R${Date.now().toString().slice(-6)}`
        await openBooks(page)
        await openNewRefundReceipt(page)
        await expect(page.getByTestId('form-input-customer')).toBeFocused()

        await pickCustomerByKeys(page, 'Harb', HARBORVIEW)
        await expect(page.getByTestId('refund-receipt-tax')).toContainText('Denver combined')

        await tabTo(page, page.getByTestId('form-input-date-open'))
        await tabTo(page, page.getByTestId('form-input-tax_rate'))
        const method = page.getByTestId('form-input-payment_method')
        await tabTo(page, method)
        await chooseByTyping(page, method, 'c', 'Check')
        await tabTo(page, page.getByTestId('form-input-reference_no'))
        await page.keyboard.type(reference)
        const refundFrom = page.getByTestId('form-input-refund_from')
        await tabTo(page, refundFrom)
        // A new refund comes from the first active bank account (Q3).
        await expect(refundFrom).toContainText(CHECKING)

        const line1 = await refundLineRowId(page, 0)
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
        await page.keyboard.type('150')
        await expect(cell('rate')).toHaveValue('150')
        await tabRateToMemo(page, line1, cell)
        await expect(page.getByTestId('form-input-message')).toHaveValue('')
        await page.keyboard.type(memo)

        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(REFUND_RECEIPT_URL)
        await expect(page).not.toHaveURL(NEW_REFUND_RECEIPT_URL)
        await expect(page.getByTestId('refund-receipt-read-only')).toBeVisible()
        await expect(page.getByTestId('refund-receipt-title')).toHaveText(/^Refund receipt \d+$/)
        await expect(page.getByTestId('refund-receipt-badge')).toHaveText('Posted')
        await expect(page.getByTestId('refund-receipt-detail-customer')).toContainText(HARBORVIEW)
        await expect(page.getByTestId('refund-receipt-detail-payment')).toHaveText(
            `Check · ${reference} · refunded from ${CHECKING}`
        )
        await expect(page.getByTestId(`refund-receipt-line-${line1}`)).toContainText('300.00')
        await expect(page.getByTestId('refund-receipt-total-subtotal')).toContainText('$300.00')
        // Amount refunded is Qty × Rate plus its tax (Denver combined on a taxable line).
        const tax = await centsIn(page.getByTestId('refund-receipt-total-tax'))
        expect(tax).toBeGreaterThan(0)
        expect(await centsIn(page.getByTestId('refund-receipt-total-refunded'))).toBe(30_000 + tax)
        expect(await centsIn(page.getByTestId('refund-receipt-amount-refunded'))).toBe(30_000 + tax)
    })

    test('a draft refund receipt is edited and posted from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Refund receipt keyboard edit')
        await openBooks(page)
        await openNewRefundReceipt(page)

        // The draft, by keys: a customer, one line at 1 × 100, the memo, ⌘S.
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
        await pickCustomerByKeys(page, 'Harb', HARBORVIEW)
        const line1 = await refundLineRowId(page, 0)
        const cell = (column: string) => page.getByTestId(lineCellTestId(line1, column))
        await tabDateToProduct(page, cell)
        await page.keyboard.type(ACCESS_POINT)
        await expect(page.getByRole('menuitem', { name: ACCESS_POINT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(cell('description')).toBeFocused()
        await tabTo(page, cell('quantity'))
        await tabTo(page, cell('rate'))
        await page.keyboard.type('100')
        await tabRateToMemo(page, line1, cell)
        await page.keyboard.type(memo)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(REFUND_RECEIPT_URL)
        await expect(page.getByTestId('refund-receipt-title')).toHaveText('Draft refund receipt')
        const id = await refundReceiptIdFromUrl(page)

        // Escape leaves the saved (clean) form at once; search reopens the draft.
        await page.keyboard.press('Escape')
        await expectNotRecordUrl(page, 'refund-receipts', id)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await searchByKeys(page, memo, /^Draft refund receipt/)
        await expectRecordUrl(page, 'refund-receipts', id)
        await expect(page.getByTestId('refund-receipt-form')).toBeVisible()
        await expect(page.getByTestId('form-input-customer')).toBeFocused()

        // Customer → Edit address → Edit customer → Refund date → … → line 1's Qty.
        await tabTo(page, page.getByTestId('refund-receipt-edit-address'))
        await tabTo(page, page.getByTestId('refund-receipt-edit-customer'))
        await tabTo(page, page.getByTestId('form-input-date'))
        await tabDateToProduct(page, cell)
        await tabTo(page, cell('description'))
        await tabTo(page, cell('quantity'))
        // Focus selects the cell's value, so typing replaces it.
        await page.keyboard.type('3')
        await expect(cell('quantity')).toHaveValue('3')

        // Shift+Tab back to Refund from; another account, picked by typing.
        const refundFrom = page.getByTestId('form-input-refund_from')
        await shiftTabTo(page, cell('description'))
        await shiftTabTo(page, cell('product'))
        await shiftTabTo(page, refundFrom)
        await expect(refundFrom).toContainText(CHECKING)
        const balance = page.getByTestId('refund-receipt-refund-from-balance')
        await expect(balance).toHaveText(BALANCE)
        const checkingBalance = await balance.innerText()
        await chooseByTyping(page, refundFrom, '1', SAVINGS)
        await expect(balance).toHaveText(BALANCE)
        await expect(balance).not.toHaveText(checkingBalance)
        const savingsBalance = await balance.innerText()

        const saved = batchAnswered(page, 'books_refund_receipts', 'PATCH', 200)
        await page.keyboard.press('ControlOrMeta+s')
        await saved
        await expectRecordUrl(page, 'refund-receipts', id)

        // Escape leaves the clean form; reopened, the stored values come back.
        await page.keyboard.press('Escape')
        await expectNotRecordUrl(page, 'refund-receipts', id)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await searchByKeys(page, memo, /^Draft refund receipt/)
        await expect(page.getByTestId('refund-receipt-form')).toBeVisible()
        await expect(cell('quantity')).toHaveValue('3')
        await expect(refundFrom).toContainText(SAVINGS)
        await expect(balance).toHaveText(savingsBalance)

        // ⌘↵ posts the draft in place.
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expectRecordUrl(page, 'refund-receipts', id)
        await expect(page.getByTestId('refund-receipt-read-only')).toBeVisible()
        await expect(page.getByTestId('refund-receipt-badge')).toHaveText('Posted')
        await expect(page.getByTestId('refund-receipt-total-subtotal')).toContainText('$300.00')
        const tax = await centsIn(page.getByTestId('refund-receipt-total-tax'))
        expect(await centsIn(page.getByTestId('refund-receipt-total-refunded'))).toBe(30_000 + tax)
        await expect(page.getByTestId('refund-receipt-detail-payment')).toHaveText(
            `refunded from ${SAVINGS}`
        )
    })
})
