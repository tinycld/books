import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import {
    createCustomer,
    customerPageUrl,
    customerPath,
    DESKTOP,
    discardDialog,
    field,
    openBooks,
    openCustomer,
    openCustomersList,
    openNewCustomer,
    PHONE,
    sideBySide,
    stacked,
    stampDigits,
    uniqueName,
} from './customer-form-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    lineCellTestId,
    localToday,
    pickLineProduct,
} from './invoice-helpers'
import { holdLoads } from './record-form-helpers'

// The customer page's Open and Overdue figures and its New transaction menu
// (customer-pages checkpoint 3, spec §3.2 and §3.3). Every test creates its own customers
// with unique names; invoices are posted through the invoice form with one line of the
// seeded non-taxable service (Year-end tax preparation) at a typed price, dated on or
// after 2026-11-01. No seeded row is changed.
//
// Not covered here: a read-only user (no New transaction) cannot be driven, because the
// e2e seed has no read-only Books member; the reader rules are pinned by the
// `customerPageControls` unit test and the `canWrite` flag. A journal-entry reversal moving
// Open is covered by the Go view test (server/party_balances_test.go); this spec covers a
// post and a void. The menu's items and their hrefs are pinned by
// tests/transaction-actions.test.ts.

const BALANCES_URL = '**/api/collections/books_party_balances/records**'
const INVOICES_URL = '**/api/collections/books_invoices/records**'
const MENU_ITEMS = ['customer-new-invoice', 'customer-new-estimate', 'customer-new-sales-receipt']
const PAGE_GUTTER = 16

// A seeded Service: not taxable, so an invoice's total is its line amount.
function nonTaxableService() {
    const row = PRODUCTS.find(p => p.id === PRODUCT_IDS.taxPrep)
    if (!row || row.taxable) throw new Error('no non-taxable tax prep service in the fixture')
    return row.name
}

// The id of the customer whose page is open, read from the URL.
function openCustomerId(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

function figures(page: Page) {
    return {
        open: page.getByTestId('customer-balance-open'),
        openLabel: page.getByTestId('customer-balance-open-label'),
        overdue: page.getByTestId('customer-balance-overdue'),
        error: page.getByTestId('customer-balance-error'),
        retry: page.getByTestId('customer-balance-retry'),
    }
}

// The New transaction menu's items in screen order.
function menuItemIds(page: Page) {
    return page
        .locator(MENU_ITEMS.map(id => `[data-testid="${id}"]`).join(', '))
        .evaluateAll(els => els.map(el => el.getAttribute('data-testid')))
}

function refusal(route: Route) {
    return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ status: 400, message: 'Something went wrong.', data: {} }),
    })
}

function refusedResponse(page: Page, collection: string) {
    return page.waitForResponse(
        r => r.url().includes(`/api/collections/${collection}/records`) && r.status() === 400
    )
}

// A new invoice from the open menu's Invoice row, for the customer whose page is open.
async function postInvoice(page: Page, input: { rate: string; date?: string; dueDate: string }) {
    if (input.date !== undefined) await page.getByTestId('form-input-date').fill(input.date)
    await page.getByTestId('form-input-due_date').fill(input.dueDate)
    const rowId = await pickLineProduct(page, 0, nonTaxableService())
    await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.rate)
    await expect(page.getByTestId(lineCellTestId(rowId, 'amount'))).toContainText(`$${input.rate}`)
    await page.getByTestId('invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
    return invoiceIdFromUrl(page)
}

async function widthOf(locator: Locator) {
    return Math.round((await locator.boundingBox())?.width ?? 0)
}

// The More button sits to the right of the title, its top above or level with the
// title's top (1 px for rounding).
async function moreBesideTitle(page: Page) {
    const [title, more] = await Promise.all([
        page.getByTestId('customer-title').boundingBox(),
        page.getByTestId('customer-more').boundingBox(),
    ])
    if (!title || !more) return false
    return more.x >= title.x + title.width - 1 && more.y <= title.y + 1
}

test.describe('customer-pages: balance and new transaction', () => {
    test('starts invoices from the page and the figures move with posts and voids', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { open, openLabel, overdue } = figures(page)
        const title = page.getByTestId('customer-title')
        const saveBar = page.getByTestId('customer-save-bar')
        const prefix = uniqueName('Balance')
        const nameP = `${prefix} P`
        const nameS = `${prefix} S`
        const phone = `(555) 016-${stampDigits()}`

        await createCustomer(page, { name: nameP })
        const idP = openCustomerId(page)
        await page.getByTestId('customer-more').click()
        await page.getByTestId('customer-more-add-sub').click()
        await field(page, 'display_name').fill(nameS)
        await page.getByTestId('customer-save').click()
        await expect(page).toHaveURL(customerPageUrl)
        await expect(title).toHaveText(nameS)
        const idS = openCustomerId(page)

        await expect(open).toHaveText('$0.00')
        await expect(openLabel).toHaveText('Open')
        await expect(overdue).toHaveText('$0.00')

        // An unsaved phone on Details; ⌥N from the field opens the menu on its first row.
        await page.getByTestId('customer-tab-details').click()
        await field(page, 'phone').fill(phone)
        await expect(saveBar).toBeVisible()
        await page.keyboard.press('Alt+n')
        await expect.poll(() => menuItemIds(page)).toEqual(MENU_ITEMS)
        await expect(page.getByTestId('customer-new-invoice')).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${idS}$`))
        await expect(page.getByTestId('form-input-customer')).toContainText(nameS)

        // Overdue since 2026-11-02: Open and Overdue both move, on the page kept under the
        // invoice with its unsaved phone.
        await postInvoice(page, {
            rate: '100.00',
            date: '2026-11-01',
            dueDate: '2026-11-02',
        })
        await page.goBack()
        await expect(page).toHaveURL(customerPath(idS))
        await expect(field(page, 'phone')).toHaveValue(phone)
        await expect(saveBar).toBeVisible()
        await expect(open).toHaveText('$100.00')
        await expect(overdue).toHaveText('$100.00')

        // Due today is not overdue.
        await page.getByTestId('customer-new-transaction').click()
        await page.getByTestId('customer-new-invoice').click()
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${idS}$`))
        const secondId = await postInvoice(page, {
            rate: '250.00',
            dueDate: await localToday(page),
        })
        await page.goBack()
        await expect(page).toHaveURL(customerPath(idS))
        await expect(open).toHaveText('$350.00')
        await expect(overdue).toHaveText('$100.00')

        // The leave guard holds a browser history move off the dirty page, so the
        // unsaved phone is discarded before Forward.
        await page.getByTestId('customer-cancel').click()
        await discardDialog(page).discard.click()
        await expect(saveBar).toBeHidden()

        // Voiding the second invoice takes it out of Open.
        await page.goForward()
        await expect(page).toHaveURL(new RegExp(`/books/invoices/${secondId}$`))
        await page.getByTestId('invoice-read-void').click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('invoice-badge')).toHaveText('Void')
        await page.goBack()
        await expect(page).toHaveURL(customerPath(idS))
        await expect(open).toHaveText('$100.00')
        await expect(overdue).toHaveText('$100.00')

        // A parent's figures are its own: P has no invoice.
        await page.getByTestId('customer-parent-link').click()
        await expect(page).toHaveURL(customerPath(idP))
        await expect(title).toHaveText(nameP)
        await expect(open).toHaveText('$0.00')
        await expect(overdue).toHaveText('$0.00')
    })

    test('shows the figures loading, a failed load, and Retry', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { open, overdue, error, retry } = figures(page)
        const prefix = uniqueName('Balance load')
        const nameA = `${prefix} A`
        const nameB = `${prefix} B`

        // B is saved with Save and new, so its page has not loaded yet.
        await openNewCustomer(page)
        await field(page, 'display_name').fill(nameB)
        await page.getByTestId('customer-save-new').click()
        await expect(field(page, 'display_name')).toHaveValue('')

        // A's balance read is held, then refused.
        const balances = await holdLoads(page, BALANCES_URL)
        await field(page, 'display_name').fill(nameA)
        await page.getByTestId('customer-save').click()
        await expect(page).toHaveURL(customerPageUrl)
        await expect(page.getByTestId('customer-title')).toHaveText(nameA)
        await expect.poll(() => balances.held.length).toBeGreaterThan(0)
        await expect(open).toHaveText('—')
        await expect(overdue).toHaveText('—')

        const balancesFailed = refusedResponse(page, 'books_party_balances')
        await balances.release({ status: 400 })
        await balancesFailed
        await expect(error).toContainText('Balance unavailable')
        await retry.click()
        await expect(open).toHaveText('$0.00')
        await expect(error).toHaveCount(0)

        // B's overdue read is refused on its first load.
        await openCustomersList(page)
        await page.route(INVOICES_URL, refusal)
        const invoicesFailed = refusedResponse(page, 'books_invoices')
        await openCustomer(page, nameB)
        await invoicesFailed
        await expect(error).toContainText('Balance unavailable')
        await page.unrouteAll({ behavior: 'wait' })
        await retry.click()
        await expect(open).toHaveText('$0.00')
        await expect(overdue).toHaveText('$0.00')
        await expect(error).toHaveCount(0)
    })

    test('a phone stacks the header and opens New transaction as a sheet', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { open, overdue } = figures(page)
        const newTransaction = page.getByTestId('customer-new-transaction')
        const name = uniqueName('Balance phone')
        await createCustomer(page, { name })
        const id = openCustomerId(page)
        await page.setViewportSize(PHONE)

        // The figures side by side under the name, then a full-width New transaction.
        await expect(open).toHaveText('$0.00')
        await expect.poll(() => sideBySide(open, overdue)).toBe(true)
        await expect.poll(() => stacked(page.getByTestId('customer-title'), open)).toBe(true)
        await expect.poll(() => stacked(open, newTransaction)).toBe(true)
        await expect.poll(() => moreBesideTitle(page)).toBe(true)
        await expect.poll(() => widthOf(newTransaction)).toBe(PHONE.width - 2 * PAGE_GUTTER)

        // The menu is a bottom sheet titled "New transaction".
        await newTransaction.click()
        const sheet = page
            .locator('div')
            .filter({ has: page.getByTestId('sheet-handle') })
            .filter({ has: page.getByTestId('customer-new-invoice') })
            .last()
        await expect(sheet.getByText('New transaction', { exact: true })).toBeVisible()
        await expect.poll(() => menuItemIds(page)).toEqual(MENU_ITEMS)
        await page.getByTestId('customer-new-sales-receipt').click()
        await expect(page).toHaveURL(new RegExp(`/books/sales-receipts/new\\?customer=${id}$`))
    })
})
