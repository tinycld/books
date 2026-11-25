import { expect, type Page, test } from '@playwright/test'
import {
    createCustomer,
    customerPath,
    DESKTOP,
    field,
    holdLoads,
    openBooks,
    openNewCustomer,
    PHONE,
    uniqueName,
} from './customer-form-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    localToday,
    pickLineProduct,
    uniqueMemo,
} from './invoice-helpers'
import {
    customerWithInvoices,
    fillInvoice,
    nonTaxableService,
    postInvoice,
} from './receive-payment-helpers'
import {
    draftInvoiceFor,
    openSales,
    openSalesTab,
    pickSalesCustomer,
    salesRow,
} from './sales-lists-helpers'

// The Sales list's filters and sort (sales-lists checkpoint 3, spec §3 "Search and
// filters" and "Sort"): the status chips, the date-range menu, the customer picker (a
// sub-customer alone, never its parent's documents), the kept rows with `aria-busy` while
// a filter loads, Clear filters, the per-tab state, the sortable headers, the picker's own
// load error with Retry, and the cards' Sort menu on a phone. Every test creates its own
// customers and documents, dated today, and finds its rows through the customer picker.
//
// Not covered by e2e (accepted, plan checkpoint 2):
// - the 50-row window growing: it needs 50+ documents and the screen's 12 tests are used;
//   the `mergeTransactions` and `documentListWindow` unit tests cover it, and
//   tests/e2e/list-paging.spec.ts is where a seeded case can go;
// - an inactive customer in the customer picker (the picker's query has no `where`; the
//   e2e uses a sub-customer);
// - the reader on a phone (gate 2, `read-only-phone-*`);
// - Download PDF from a row menu (the download leaves the page; the item's presence is
//   asserted);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const INVOICES_URL = '**/api/collections/books_invoices/records**'
const CUSTOMERS_URL = '**/api/collections/books_customers/records**'
// Write-off spec §3.6 (Q11): Written off after Paid.
const INVOICE_CHIPS = ['all', 'open', 'overdue', 'paid', 'written-off', 'draft', 'void']

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^sales-row-[a-z0-9]{15}$/).filter({ visible: true })
}

// The ids of the visible rows (or cards), in screen order, read in one snapshot.
function rowOrder(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const pattern = /^sales-row-([a-z0-9]{15})$/
        return Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="sales-row-"]'))
            .filter(el => el.checkVisibility())
            .map(el => pattern.exec(el.dataset.testid ?? '')?.[1])
            .filter((id): id is string => id !== undefined)
    })
}

function customerIdFromUrl(page: Page): string {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

// A parent customer and a sub-customer of it, made through the customer form's Parent
// customer field.
async function parentAndSubCustomer(page: Page) {
    const prefix = uniqueName('Filters')
    const parent = { name: `${prefix} Parent`, id: '' }
    await createCustomer(page, { name: parent.name })
    parent.id = customerIdFromUrl(page)

    const sub = { name: `${prefix} Sub`, id: '' }
    await openNewCustomer(page)
    await field(page, 'display_name').fill(sub.name)
    await page.getByTestId('customer-parent').click()
    const parentSearch = page.getByTestId('customer-parent-search')
    await parentSearch.fill(parent.name)
    await page.getByTestId(`customer-parent-option-${parent.id}`).click()
    await expect(parentSearch).toBeHidden()
    await expect(page.getByTestId('customer-parent')).toContainText(parent.name)
    await page.getByTestId('customer-save').click()
    await expect(page).toHaveURL(/\/books\/customers\/(?!new)[a-z0-9]{15}(\?|$)/)
    await expect(page.getByTestId('customer-title')).toHaveText(sub.name)
    sub.id = customerIdFromUrl(page)
    return { parent, sub }
}

// From the customer's own page, through its New transaction menu: the invoice form opens
// with the customer filled in. (The invoice form's customer picker labels a sub-customer
// "<Parent>: <Sub>", so the name-based draft helpers do not reach it.)
async function newInvoiceFromCustomerPage(page: Page, customerId: string) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customerId}$`))
}

// The open customer page's posted invoice (150.00, due today) and draft invoice, each with
// a unique memo, dated today. Returns to the customer page.
async function postedAndDraftFromCustomerPage(page: Page, customerId: string) {
    const today = await localToday(page)
    await newInvoiceFromCustomerPage(page, customerId)
    await page.getByTestId('form-input-memo').fill(uniqueMemo('Sub posted'))
    await fillInvoice(page, { dueDate: today, rate: '150.00' })
    const { id: posted } = await postInvoice(page)
    await page.goBack()
    await expect(page).toHaveURL(customerPath(customerId))

    await newInvoiceFromCustomerPage(page, customerId)
    await pickLineProduct(page, 0, nonTaxableService())
    await page.getByTestId('form-input-memo').fill(uniqueMemo('Sub draft'))
    await page.getByTestId('invoice-save-draft').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')
    const draft = await invoiceIdFromUrl(page)
    await page.goBack()
    await expect(page).toHaveURL(customerPath(customerId))
    return { posted, draft }
}

// A customer with two posted invoices of 300.00 and 1,800.00 (in that creation order) and
// then a draft of the seeded service (1,250.00), all dated today.
async function customerWithSortableInvoices(page: Page) {
    const today = await localToday(page)
    const made = await customerWithInvoices(page, [
        { rate: '300.00', dueDate: today },
        { rate: '1800.00', dueDate: today },
    ])
    const [low, high] = made.invoices
    if (low === undefined || high === undefined) throw new Error('two invoices were not posted')
    const draft = await draftInvoiceFor(page, made.name, uniqueMemo('Sort draft'))
    return { customer: { name: made.name, id: made.customerId }, low: low.id, high: high.id, draft }
}

test.describe('sales-lists: filters and sort', () => {
    test('desktop: the customer picker narrows the list to a sub-customer alone, never its parent', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { parent, sub } = await parentAndSubCustomer(page)
        const { posted: subPosted, draft: subDraft } = await postedAndDraftFromCustomerPage(
            page,
            sub.id
        )
        const parentDraft = await draftInvoiceFor(page, parent.name, uniqueMemo('Parent draft'))

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await expect(listRows(page).first()).toBeVisible()

        // A text no customer holds: the picker's empty text.
        await visible(page, 'sales-customer').click()
        const search = page.getByTestId('sales-customer-search').filter({ visible: true })
        await search.fill(uniqueMemo('No customer holds'))
        await expect(page.getByTestId('sales-customer-option-empty')).toHaveText(
            'No customers match'
        )
        await search.fill(sub.name)
        await page.getByTestId(`sales-customer-option-${sub.id}`).click()
        await expect(search).toBeHidden()
        await expect(visible(page, 'sales-customer')).toContainText(sub.name)

        // The sub-customer's two rows, and not its parent's draft.
        await expect(salesRow(page, subPosted)).toBeVisible()
        await expect(salesRow(page, subDraft)).toBeVisible()
        await expect(listRows(page)).toHaveCount(2)
        await expect(salesRow(page, parentDraft)).toHaveCount(0)

        // The parent shows only its own draft, not its sub-customer's documents.
        await pickSalesCustomer(page, parent)
        await expect(salesRow(page, parentDraft)).toBeVisible()
        await expect(listRows(page)).toHaveCount(1)
        await expect(salesRow(page, subPosted)).toHaveCount(0)
        await pickSalesCustomer(page, sub)
        await expect(listRows(page)).toHaveCount(2)
    })

    test('desktop: chips and the date range narrow the list, per tab, and Clear filters resets them', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const made = await customerWithInvoices(page, [
            { rate: '150.00', dueDate: await localToday(page) },
        ])
        const posted = made.invoices[0]?.id
        if (posted === undefined) throw new Error('the invoice was not posted')
        const customer = { name: made.name, id: made.customerId }
        const draft = await draftInvoiceFor(page, customer.name, uniqueMemo('Chips draft'))

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await pickSalesCustomer(page, customer)
        await expect(salesRow(page, posted)).toBeVisible()
        await expect(listRows(page)).toHaveCount(2)

        // Draft leaves the draft.
        await visible(page, 'sales-chip-draft').click()
        await expect(visible(page, 'sales-chip-draft')).toHaveAttribute('aria-pressed', 'true')
        await expect(salesRow(page, draft)).toBeVisible()
        await expect(listRows(page)).toHaveCount(1)

        // Open, with the next invoices read held: the last rows stay, the list is busy.
        const invoices = await holdLoads(page, INVOICES_URL)
        await visible(page, 'sales-chip-open').click()
        await expect.poll(() => invoices.held.length).toBeGreaterThan(0)
        await expect(salesRow(page, draft)).toBeVisible()
        await expect(visible(page, 'sales-list')).toHaveAttribute('aria-busy', 'true')
        await invoices.release()
        await expect(salesRow(page, posted)).toBeVisible()
        await expect(salesRow(page, draft)).toHaveCount(0)
        await expect(visible(page, 'sales-list')).not.toHaveAttribute('aria-busy', 'true')

        // Last month holds none of today's documents.
        await visible(page, 'sales-range').click()
        await page.getByTestId('sales-range-last-month').click()
        await expect(visible(page, 'sales-range')).toContainText('Last month')
        await expect(visible(page, 'sales-no-match')).toBeVisible()
        await expect(listRows(page)).toHaveCount(0)

        // All sales keeps its own filters: no customer, chip All.
        await openSalesTab(page, 'all')
        await expect(visible(page, 'sales-customer')).toContainText('All customers')
        await expect(visible(page, 'sales-range')).toContainText('All dates')
        await expect(visible(page, 'sales-chip-all')).toHaveAttribute('aria-pressed', 'true')

        // Back on Invoices its filters are kept.
        await openSalesTab(page, 'invoices')
        await expect(visible(page, 'sales-customer')).toContainText(customer.name)
        await expect(visible(page, 'sales-range')).toContainText('Last month')
        await expect(visible(page, 'sales-chip-open')).toHaveAttribute('aria-pressed', 'true')
        await expect(visible(page, 'sales-no-match')).toBeVisible()

        // Clear filters: chip All, All dates, All customers, and only All pressed.
        await visible(page, 'sales-clear-filters').click()
        await expect(visible(page, 'sales-range')).toContainText('All dates')
        await expect(visible(page, 'sales-customer')).toContainText('All customers')
        await expect(visible(page, 'sales-chip-all')).toHaveAttribute('aria-pressed', 'true')
        for (const chip of INVOICE_CHIPS.filter(id => id !== 'all')) {
            await expect(visible(page, `sales-chip-${chip}`)).toBeVisible()
            await expect(visible(page, `sales-chip-${chip}`)).not.toHaveAttribute(
                'aria-pressed',
                'true'
            )
        }
        await expect(listRows(page).first()).toBeVisible()

        // A tab round trip keeps the cleared state.
        await openSalesTab(page, 'all')
        await openSalesTab(page, 'invoices')
        await expect(visible(page, 'sales-customer')).toContainText('All customers')
        await expect(visible(page, 'sales-range')).toContainText('All dates')
        await expect(visible(page, 'sales-chip-all')).toHaveAttribute('aria-pressed', 'true')
        await expect(visible(page, 'sales-chip-open')).not.toHaveAttribute('aria-pressed', 'true')
    })

    test('desktop: the headers sort, the sort is kept per tab, and the picker retries its load', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { customer, low, high, draft } = await customerWithSortableInvoices(page)

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await pickSalesCustomer(page, customer)

        // Default: date newest first, then newest created first.
        await expect.poll(() => rowOrder(page)).toEqual([draft, high, low])

        // No. ascending: the draft (no number) first, then the lower number.
        const number = visible(page, 'sales-header-number')
        await number.click()
        await expect(number).toHaveAttribute('aria-sort', 'ascending')
        await expect.poll(() => rowOrder(page)).toEqual([draft, low, high])

        // A second press: descending, the draft last.
        await number.click()
        await expect(number).toHaveAttribute('aria-sort', 'descending')
        await expect.poll(() => rowOrder(page)).toEqual([high, low, draft])

        // Total ascending: the lower total first.
        const total = visible(page, 'sales-header-total')
        await total.click()
        await expect(total).toHaveAttribute('aria-sort', 'ascending')
        await expect(number).toHaveAttribute('aria-sort', 'none')
        await expect.poll(() => rowOrder(page)).toEqual([low, draft, high])

        // Customer and Status do not sort.
        await expect(number).toHaveAttribute('role', 'button')
        await expect(visible(page, 'sales-header-customer')).toBeVisible()
        await expect(visible(page, 'sales-header-customer')).not.toHaveAttribute('role', 'button')
        await expect(visible(page, 'sales-header-status')).toBeVisible()
        await expect(visible(page, 'sales-header-status')).not.toHaveAttribute('role', 'button')

        // A tab round trip keeps the sort and the customer.
        await openSalesTab(page, 'estimates')
        await openSalesTab(page, 'invoices')
        await expect(visible(page, 'sales-customer')).toContainText(customer.name)
        await expect(visible(page, 'sales-header-total')).toHaveAttribute('aria-sort', 'ascending')
        await expect.poll(() => rowOrder(page)).toEqual([low, draft, high])

        // On Estimates the picker's own read fails: its Retry lists the customers.
        await openSalesTab(page, 'estimates')
        await page.route(CUSTOMERS_URL, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: 'Something went wrong.', data: {} }),
            })
        )
        const refused = page.waitForResponse(
            r => r.url().includes('/api/collections/books_customers/records') && r.status() === 400
        )
        await visible(page, 'sales-customer').click()
        await refused
        const retry = page.getByTestId('sales-customer-option-retry')
        await expect(retry).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
        await retry.getByText('Retry', { exact: true }).click()
        await expect(retry).toHaveCount(0)
        await page
            .getByTestId('sales-customer-search')
            .filter({ visible: true })
            .fill(customer.name)
        await expect(page.getByTestId(`sales-customer-option-${customer.id}`)).toBeVisible()
    })

    test('phone: the Sort menu and the scrolling chip row narrow the cards', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { customer, low, high, draft } = await customerWithSortableInvoices(page)
        await openSales(page)
        await openSalesTab(page, 'invoices')
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'sales-cards')).toBeVisible()

        await pickSalesCustomer(page, customer)
        await expect.poll(() => rowOrder(page)).toEqual([draft, high, low])
        await expect(page.getByTestId('sales-header')).toHaveCount(0)

        // Sort → Total, high to low: the higher total first.
        await visible(page, 'sales-sort').click()
        await page.getByTestId('sales-sort-amount-down').click()
        await expect(visible(page, 'sales-sort')).toContainText('Total, high to low')
        await expect.poll(() => rowOrder(page)).toEqual([high, draft, low])

        // Draft, in the scrolling chip row, leaves the draft card.
        await visible(page, 'sales-chip-draft').click()
        await expect(salesRow(page, draft)).toBeVisible()
        await expect.poll(() => rowOrder(page)).toEqual([draft])
    })
})
