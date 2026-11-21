import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import {
    CREDIT_MEMO_URL,
    creditMemoIdFromUrl,
    creditMemoLineRowId,
    creditMemoUrlOf,
    NEW_CREDIT_MEMO_URL,
    openNewCreditMemo,
    saveCreditMemoDraft,
} from './credit-memo-helpers'
import { batchAnswered } from './document-batch-helpers'
import { lineCellTestId, uniqueMemo } from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'
import { tabTo } from './keyboard-helpers'

// The credit memo's keyboard-only create and edit (credit memo spec §3.2, §3.5, §3.10).
// After the form opens, no click: focus starts in Customer, Tab moves between fields,
// Enter picks a typed customer or product; ⌘⇧↵ is Post & new, ⌘↵ Post, ⌘S Save draft,
// ⌥1 / ⌥2 the Edit and PDF tabs, and `/` core's search palette (core binds the palette
// to `/`, not the ⌘K the checkpoint names). Each memo carries a unique memo text and the
// default date; no seeded row is changed. Desktop only: the keyboard path runs the same
// code at phone size.

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
const HARBORVIEW_LINE1 = (() => {
    const line1 = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)?.billing_address?.line1
    if (!line1) throw new Error('no Harborview billing address in the fixture')
    return line1
})()
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const MONEY = /-?\$[\d,]+\.\d{2}/
const ZERO_TOTAL =
    'A credit memo with a total of zero cannot be posted. Add an amount or keep it as a draft.'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// From a focused Customer with a customer picked to line 1's Qty, one stop at a time
// (spec §3.3): Edit address, Edit customer, Credit memo date and its calendar button,
// Tax, Product, Description, Qty.
async function tabCustomerToQty(page: Page, cell: (column: string) => Locator) {
    await tabTo(page, page.getByTestId('credit-memo-edit-address'))
    await tabTo(page, page.getByTestId('credit-memo-edit-customer'))
    await tabTo(page, page.getByTestId('form-input-date'))
    await tabTo(page, page.getByTestId('form-input-date-open'))
    await tabTo(page, page.getByTestId('form-input-tax_rate'))
    await tabTo(page, cell('product'))
    await tabTo(page, cell('description'))
    await tabTo(page, cell('quantity'))
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
    await expect(page).toHaveURL(CREDIT_MEMO_URL)
}

async function moneyIn(locator: Locator): Promise<string> {
    const amount = MONEY.exec(await locator.innerText())?.[0]
    if (!amount) throw new Error('no amount in the element')
    return amount
}

test.describe('credit-memo-form: keyboard', () => {
    test('a credit memo is created and posted from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Credit memo keyboard create')
        const message = `Credit for returned goods ${memo}`
        await openBooks(page)
        await openNewCreditMemo(page)
        const customer = page.getByTestId('form-input-customer')
        await expect(customer).toBeFocused()

        // Type-to-open the customer picker; a pick moves on to Credit memo date.
        await page.keyboard.type('Harb')
        await expect(page.getByTestId('form-input-customer-search')).toBeFocused()
        await expect(page.getByRole('menuitem', { name: HARBORVIEW, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(customer).toContainText(HARBORVIEW)
        const date = page.getByTestId('form-input-date')
        await expect(date).toBeFocused()
        await expect(page.getByTestId('credit-memo-bill-to')).toContainText(HARBORVIEW_LINE1)
        await expect(page.getByTestId('credit-memo-tax')).toContainText('Denver combined')

        await tabTo(page, page.getByTestId('form-input-date-open'))
        await tabTo(page, page.getByTestId('form-input-tax_rate'))

        const line1 = await creditMemoLineRowId(page, 0)
        const cell = (column: string) => page.getByTestId(lineCellTestId(line1, column))
        await tabTo(page, cell('product'))
        await page.keyboard.type(ACCESS_POINT)
        await expect(page.getByRole('menuitem', { name: ACCESS_POINT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(cell('product')).toContainText(ACCESS_POINT)
        await expect(cell('description')).toBeFocused()
        await tabTo(page, cell('quantity'))
        await page.keyboard.type('1')
        await tabTo(page, cell('rate'))
        await page.keyboard.type('250')
        await expect(cell('rate')).toHaveValue('250')

        // After Rate: the line's Taxable switch, its row menu, Add line and Add…, then
        // Message. A new credit memo has no default message (Q8).
        await tabTo(page, cell('taxable').getByRole('switch'))
        await tabTo(page, page.getByTestId(`form-table-lines-menu-${line1}`))
        await tabTo(page, page.getByTestId('form-table-lines-add'))
        await tabTo(page, page.getByTestId('form-table-lines-add-more'))
        const messageInput = page.getByTestId('form-input-message')
        await tabTo(page, messageInput)
        await expect(messageInput).toHaveValue('')
        await page.keyboard.type(message)
        await tabTo(page, page.getByTestId('form-input-memo'))
        await page.keyboard.type(memo)

        // Credit amount is the total; a credit memo has no Terms and no Due date.
        await expect(page.getByTestId('credit-memo-total-subtotal')).toContainText('$250.00')
        const total = await moneyIn(page.getByTestId('credit-memo-total'))
        expect(await moneyIn(page.getByTestId('credit-memo-total-credit'))).toBe(total)
        expect(await moneyIn(page.getByTestId('credit-memo-credit-amount'))).toBe(total)
        await expect(page.getByTestId('form-input-terms')).toHaveCount(0)
        await expect(page.getByTestId('form-input-due_date')).toHaveCount(0)
        const form = page.getByTestId('credit-memo-form')
        await expect(form.getByText('Terms', { exact: true })).toHaveCount(0)
        await expect(form.getByText('Due date', { exact: true })).toHaveCount(0)

        // ⌘⇧↵ posts and opens a fresh form with Customer focused.
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(/\/books\/credit-memos\/new\?fresh=[^&]+$/)
        const params = new URL(page.url()).searchParams
        expect(params.has('customer')).toBe(false)
        expect(params.has('invoice')).toBe(false)
        await expect(page.getByTestId('credit-memo-title')).toHaveText('New credit memo')
        await expect(customer).toBeFocused()

        // Escape leaves the clean form; the search palette opens the posted memo.
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(NEW_CREDIT_MEMO_URL)
        await searchByKeys(page, memo, /^Credit memo \d+ · /)
        const readView = page.getByTestId('credit-memo-read-only')
        await expect(readView).toBeVisible()
        await expect(page.getByTestId('credit-memo-title')).toHaveText(/^Credit memo \d+$/)
        await expect(page.getByTestId('credit-memo-badge')).toHaveText('Posted')
        await expect(readView).toContainText(ACCESS_POINT)
        await expect(readView).toContainText('250.00')
        await expect(readView).toContainText(message)
        await expect(readView).toContainText(memo)
        expect(await moneyIn(page.getByTestId('credit-memo-credit-amount'))).toBe(total)
        await expect(page.getByTestId('credit-memo-invoice-link')).toHaveCount(0)
    })

    test('a draft credit memo is edited and posted from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Credit memo keyboard edit')
        await openBooks(page)

        // Setup through the form (clicks allowed): a draft of one line at rate 0.
        const id = await saveCreditMemoDraft(page, {
            customer: HARBORVIEW,
            product: ACCESS_POINT,
            memo,
            rate: '0',
        })
        const line1 = await creditMemoLineRowId(page, 0)
        await openEntriesList(page)

        // From here on, keys only.
        await searchByKeys(page, memo, /^Draft credit memo/)
        await expect(page).toHaveURL(creditMemoUrlOf(id))
        await expect(page.getByTestId('credit-memo-form')).toBeVisible()
        await expect(page.getByTestId('form-input-customer')).toBeFocused()

        // A zero total is refused by the server; the draft stays.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page.getByTestId('credit-memo-error-summary')).toContainText(ZERO_TOTAL)
        await expect(page).toHaveURL(creditMemoUrlOf(id))
        await expect(page.getByTestId('credit-memo-title')).toHaveText('Draft credit memo')

        const cell = (column: string) => page.getByTestId(lineCellTestId(line1, column))
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
        await tabCustomerToQty(page, cell)
        // Focus selects the cell's value (lesson 25), so typing replaces it.
        await page.keyboard.type('3')
        await expect(cell('quantity')).toHaveValue('3')
        await tabTo(page, cell('rate'))
        await page.keyboard.type('40')
        await expect(cell('rate')).toHaveValue('40')

        // ⌘S saves the draft in place.
        const saved = batchAnswered(page, 'books_credit_memos', 'PATCH', 200)
        await page.keyboard.press('ControlOrMeta+s')
        await saved
        await expect(page).toHaveURL(creditMemoUrlOf(id))
        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('credit-memo-pdf')).toBeVisible()
        await expect(page.getByTestId('credit-memo-pdf-stale')).toHaveCount(0)
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('credit-memo-form')).toBeVisible()

        // The Edit panel mounts again and Customer takes focus, as on open.
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
        await tabCustomerToQty(page, cell)
        await page.keyboard.type('2')
        await expect(cell('quantity')).toHaveValue('2')

        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(creditMemoUrlOf(id))
        await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
        await expect(page.getByTestId('credit-memo-title')).toHaveText(/^Credit memo \d+$/)
        const line = page.getByTestId(`credit-memo-line-${line1}`)
        await expect(line).toContainText('40.00')
        await expect(line).toContainText(/\b2\b/)
        await expect(page.getByTestId('credit-memo-total-subtotal')).toContainText('$80.00')
        expect(creditMemoIdFromUrl(page)).toBe(id)
    })
})
