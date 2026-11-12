import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { lineCellTestId, uniqueMemo } from './invoice-helpers'
import {
    chooseReceiptSelect,
    NEW_SALES_RECEIPT_URL,
    openNewSalesReceipt,
    pickReceiptCustomer,
    pickReceiptLineProduct,
    receiptLineRowId,
    SALES_RECEIPT_URL,
    salesReceiptIdFromUrl,
    salesReceiptUrlOf,
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
})
