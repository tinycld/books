import { expect, type Page, type Route, test } from '@playwright/test'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import {
    createCustomer,
    customerEntry,
    customerPageUrl,
    customerPath,
    DESKTOP,
    field,
    holdLoads,
    isDisabled,
    openBooks,
    openCustomersList,
    openNewCustomer,
    PHONE,
    searchCustomers,
    uniqueName,
} from './customer-form-helpers'
import { ESTIMATE_URL, estimateIdFromUrl, pickEstimateLineProduct } from './estimate-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    lineCellTestId,
    lineRowId,
    localToday,
    NEW_INVOICE_URL,
    pickInvoiceCustomer,
    pickLineProduct,
} from './invoice-helpers'
import {
    chooseReceiptSelect,
    pickReceiptLineProduct,
    SALES_RECEIPT_URL,
    salesReceiptIdFromUrl,
} from './sales-receipt-helpers'

// The customer page's Transactions tab (customer-pages checkpoint 4, spec §3.5): one list
// of the customer's invoices, estimates and sales receipts, its type chips, its states,
// and opening a document from a row. Every test creates its own customers with unique
// names; every document is made through its form with one line of the seeded non-taxable
// service (Year-end tax preparation) and dated on or after 2026-11-01. No seeded row is
// changed.
//
// Not covered here: a read-only user (no New transaction in the empty state) cannot be
// driven, because the e2e seed has no read-only Books member; the reader rules are pinned
// by the `customerPageControls` unit test and the `canWrite` flag. The window growing by
// 50 needs 50+ documents of one customer; the pure `mergeTransactions` unit test
// (tests/party-transactions.test.ts) covers `hasMore` and the cut to n.

const INVOICES_URL = '**/api/collections/books_invoices/records**'
const ESTIMATES_URL = '**/api/collections/books_estimates/records**'
const MENU_ITEMS = ['customer-new-invoice', 'customer-new-estimate', 'customer-new-sales-receipt']
const ROW_ID = /^customer-transaction-([a-z0-9]{15})$/

// A seeded Service: not taxable, so a document's total is its line amount.
function nonTaxableService() {
    const row = PRODUCTS.find(p => p.id === PRODUCT_IDS.taxPrep)
    if (!row || row.taxable) throw new Error('no non-taxable tax prep service in the fixture')
    return row.name
}

// The id of the customer whose page is open, read from the URL.
function openCustomerId(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

// The ids of the tab's rows (table) or cards (phone), in screen order, in one snapshot.
function transactionIds(page: Page) {
    return page
        .getByTestId('customer-transactions')
        .locator('[data-testid^="customer-transaction-"]')
        .evaluateAll((els, pattern) => {
            const ids: string[] = []
            for (const el of els) {
                const match = new RegExp(pattern).exec(el.getAttribute('data-testid') ?? '')
                if (match?.[1] && !ids.includes(match[1])) ids.push(match[1])
            }
            return ids
        }, ROW_ID.source)
}

function transaction(page: Page, id: string) {
    return page.getByTestId(`customer-transaction-${id}`)
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

// From the open customer page, the header's New transaction menu → one item.
async function startTransaction(page: Page, item: string, path: string, customerId: string) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId(item).click()
    await expect(page).toHaveURL(new RegExp(`/books/${path}/new\\?customer=${customerId}$`))
}

// The open invoice form: date (unless the default today), due date, one service line at
// `rate`.
async function fillInvoice(page: Page, input: { date?: string; dueDate: string; rate: string }) {
    if (input.date !== undefined) await page.getByTestId('form-input-date').fill(input.date)
    await page.getByTestId('form-input-due_date').fill(input.dueDate)
    const rowId = await pickLineProduct(page, 0, nonTaxableService())
    await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.rate)
    await expect(page.getByTestId(lineCellTestId(rowId, 'amount'))).toContainText(`$${input.rate}`)
}

// The number in an invoice read view's title, "Invoice <n>".
async function invoiceNumber(page: Page) {
    const title = page.getByTestId('invoice-title')
    await expect(title).toHaveText(/^Invoice \d+$/)
    const number = /^Invoice (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return number
}

// Posts the open invoice form; returns the posted invoice's id and number.
async function postInvoice(page: Page) {
    await page.getByTestId('invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')
    return { id: invoiceIdFromUrl(page), number: await invoiceNumber(page) }
}

// Back from a document to the customer page kept under it, on its Transactions tab.
async function backToCustomer(page: Page, customerId: string) {
    await page.goBack()
    await expect(page).toHaveURL(customerPath(customerId))
    await expect(page.getByTestId('customer-transactions')).toBeVisible()
}

test.describe('customer-pages: transactions tab', () => {
    test('lists every sales document newest first, filters by type and opens a row', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const transactionsTab = page.getByTestId('customer-tab-transactions')
        const prefix = uniqueName('Transactions')
        const name = `${prefix} A`
        const nameB = `${prefix} B`
        const service = nonTaxableService()

        // A new customer opens on Transactions, empty, with New transaction.
        await createCustomer(page, { name })
        const id = openCustomerId(page)
        await expect(transactionsTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('customer-transactions-empty')).toContainText(
            'No transactions for this customer yet'
        )
        await page.getByTestId('customer-transactions-empty-new').click()
        for (const item of MENU_ITEMS) await expect(page.getByTestId(item)).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('customer-new-invoice')).toHaveCount(0)
        const today = await localToday(page)

        // A draft invoice.
        await startTransaction(page, 'customer-new-invoice', 'invoices', id)
        await fillInvoice(page, { date: '2026-11-05', dueDate: today, rate: '110.00' })
        await page.getByTestId('invoice-save-draft').click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page.getByTestId('invoice-title')).toHaveText('Draft invoice')
        const draftId = invoiceIdFromUrl(page)
        await backToCustomer(page, id)

        // A posted invoice dated today, due today: Open.
        await startTransaction(page, 'customer-new-invoice', 'invoices', id)
        await fillInvoice(page, { dueDate: today, rate: '120.00' })
        const { id: openId } = await postInvoice(page)
        await backToCustomer(page, id)

        // A posted invoice, then voided.
        await startTransaction(page, 'customer-new-invoice', 'invoices', id)
        await fillInvoice(page, { date: '2026-11-03', dueDate: today, rate: '130.00' })
        const { id: voidId } = await postInvoice(page)
        await page.getByTestId('invoice-read-void').click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('invoice-badge')).toHaveText('Void')
        await backToCustomer(page, id)

        // A posted invoice, then corrected: the original is voided with `replaced_by`, the
        // correction keeps its number.
        await startTransaction(page, 'customer-new-invoice', 'invoices', id)
        await fillInvoice(page, { date: '2026-11-02', dueDate: today, rate: '140.00' })
        const { id: originalId, number: correctedNumber } = await postInvoice(page)
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?replaces=${originalId}$`))
        await expect(page.getByTestId('invoice-title')).toHaveText(`Edit ${correctedNumber}`)
        const lineId = await lineRowId(page, 0)
        await page.getByTestId(lineCellTestId(lineId, 'rate')).fill('145.00')
        await page.getByTestId('invoice-post').click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page).not.toHaveURL(new RegExp(`/books/invoices/${originalId}$`))
        await expect(page.getByTestId('invoice-title')).toHaveText(`Invoice ${correctedNumber}`)
        const correctedId = invoiceIdFromUrl(page)
        await backToCustomer(page, id)

        // An estimate on the voided invoice's date, made after it.
        await startTransaction(page, 'customer-new-estimate', 'estimates', id)
        await page.getByTestId('form-input-date').fill('2026-11-03')
        await pickEstimateLineProduct(page, 0, service)
        await page.getByTestId('estimate-save').click()
        await expect(page).toHaveURL(ESTIMATE_URL)
        await expect(page.getByTestId('estimate-title')).toHaveText(/^Estimate \d+$/)
        const estimateId = estimateIdFromUrl(page)
        await backToCustomer(page, id)

        // A posted sales receipt.
        await startTransaction(page, 'customer-new-sales-receipt', 'sales-receipts', id)
        await page.getByTestId('form-input-date').fill('2026-11-06')
        await pickReceiptLineProduct(page, 0, service)
        await chooseReceiptSelect(page, 'payment_method', 'Cash')
        await page.getByTestId('sales-receipt-post').click()
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        const receiptId = salesReceiptIdFromUrl(page)
        await backToCustomer(page, id)

        // Date desc, then created desc (the estimate was made after the void invoice of the
        // same day); the replaced original is left out, its correction shows once.
        const allIds = [openId, receiptId, draftId, estimateId, voidId, correctedId]
        const invoiceIds = [openId, draftId, voidId, correctedId]
        await expect(page.getByTestId('customer-transactions-table')).toBeVisible()
        await expect.poll(() => transactionIds(page)).toEqual(allIds)
        await expect(transaction(page, originalId)).toHaveCount(0)
        await expect(transaction(page, correctedId)).toContainText(correctedNumber)
        await expect(transaction(page, voidId)).toContainText('Void')
        await expect(transaction(page, draftId)).toContainText('Draft')
        await expect(transaction(page, openId)).toContainText('Open')
        await expect(transaction(page, receiptId)).toContainText('Paid')
        await expect(transaction(page, estimateId)).toContainText('—')

        // The type chips.
        await page.getByTestId('customer-transactions-filter-estimate').click()
        await expect.poll(() => transactionIds(page)).toEqual([estimateId])
        await page.getByTestId('customer-transactions-filter-invoice').click()
        await expect.poll(() => transactionIds(page)).toEqual(invoiceIds)

        // A row opens its document; the page stays mounted under it, chip and all.
        await transaction(page, openId).click()
        await expect(page).toHaveURL(new RegExp(`/books/invoices/${openId}$`))
        await page.goBack()
        await expect(page).toHaveURL(customerPath(id))
        await expect(transactionsTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('customer-transactions-filter-invoice')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        await expect.poll(() => transactionIds(page)).toEqual(invoiceIds)

        // Left and opened again, the page starts on All.
        await page.getByTestId('customer-back').click()
        await expect(page.getByTestId('customers-list')).toBeVisible()
        await searchCustomers(page, name)
        await customerEntry(page, name).click()
        await expect(page).toHaveURL(customerPath(id))
        await expect(transactionsTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('customer-transactions-filter-all')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        await expect.poll(() => transactionIds(page)).toEqual(allIds)

        // A customer with only an invoice: the Estimates chip has no match; Show all.
        await createCustomer(page, { name: nameB })
        const idB = openCustomerId(page)
        await startTransaction(page, 'customer-new-invoice', 'invoices', idB)
        await fillInvoice(page, { dueDate: today, rate: '150.00' })
        const { id: invoiceB } = await postInvoice(page)
        await backToCustomer(page, idB)
        await expect.poll(() => transactionIds(page)).toEqual([invoiceB])
        await page.getByTestId('customer-transactions-filter-estimate').click()
        await expect(page.getByTestId('customer-transactions-no-match')).toContainText(
            'No estimates for this customer'
        )
        await expect.poll(() => transactionIds(page)).toEqual([])
        await page.getByTestId('customer-transactions-show-all').click()
        await expect(page.getByTestId('customer-transactions-no-match')).toHaveCount(0)
        await expect.poll(() => transactionIds(page)).toEqual([invoiceB])
    })

    test('a phone shows cards, the loading and failed states, and one query per chip', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const prefix = uniqueName('Transactions phone')
        const name = `${prefix} A`
        const emptyName = `${prefix} B`
        const banner = page.getByTestId('customer-transactions-banner')
        const retry = page.getByTestId('customer-transactions-retry')
        const cards = page.getByTestId('customer-transactions-cards')

        // Both customers are saved with Save and new and the invoice is made from the
        // Journal Entries New menu, so neither customer's page has loaded yet: its first
        // reads go out when it opens.
        await openNewCustomer(page)
        await field(page, 'display_name').fill(name)
        await page.getByTestId('customer-save-new').click()
        await expect(field(page, 'display_name')).toHaveValue('')
        await field(page, 'display_name').fill(emptyName)
        await page.getByTestId('customer-save-new').click()
        await expect(field(page, 'display_name')).toHaveValue('')
        // The clean New form leaves at once, back to the list.
        const list = page.getByTestId('customers-list')
        await page.getByTestId('customer-back').click()
        await expect(list).toBeVisible()

        // The invoice from the sidebar's New menu, pushed over the list; Back returns.
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
        await page.getByTestId('books-new-invoice').click()
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await pickInvoiceCustomer(page, name)
        await fillInvoice(page, { dueDate: await localToday(page), rate: '120.00' })
        const { id: invoiceId, number } = await postInvoice(page)
        await page.goBack()
        await expect(list).toBeVisible()
        await page.setViewportSize(PHONE)

        // Invoices held, estimates refused, both before the page opens.
        const invoices = await holdLoads(page, INVOICES_URL)
        await page.route(ESTIMATES_URL, refusal)
        const estimatesFailed = refusedResponse(page, 'books_estimates')
        await searchCustomers(page, name)
        await customerEntry(page, name).click()
        await expect(page).toHaveURL(customerPageUrl)
        await expect.poll(() => invoices.held.length).toBeGreaterThan(0)
        await expect(page.getByTestId('customer-transactions-loading')).toBeVisible()
        await estimatesFailed

        // The release removes every route, the estimates refusal too. Put the refusal
        // back: the Invoices chip releases the estimates query, so All starts a fresh
        // estimates load, and that load must still be refused.
        await invoices.release()
        await expect(banner).toBeVisible()
        await expect(retry).toBeVisible()
        await page.route(ESTIMATES_URL, refusal)

        // The Invoices chip runs only the invoices query: no banner, the invoice's card.
        await page.getByTestId('customer-transactions-filter-invoice').click()
        await expect(banner).toHaveCount(0)
        await expect(cards).toBeVisible()
        const card = transaction(page, invoiceId)
        await expect(card).toContainText('Invoice')
        await expect(card).toContainText(number)
        await expect(card).toContainText('$120.00')
        await expect(card).toContainText('Open')

        // All again: the fresh estimates load is refused, so the banner and Retry show.
        const estimatesFailedAgain = refusedResponse(page, 'books_estimates')
        await page.getByTestId('customer-transactions-filter-all').click()
        await estimatesFailedAgain
        await expect(banner).toBeVisible()
        await expect(retry).toBeVisible()

        // Unroute, then Retry: the card, and no banner.
        await page.unrouteAll({ behavior: 'wait' })
        await retry.click()
        await expect(card).toBeVisible()
        await expect(banner).toHaveCount(0)
        await expect.poll(() => transactionIds(page)).toEqual([invoiceId])

        // An inactive customer with no transactions: New transaction is disabled.
        await openCustomersList(page)
        await searchCustomers(page, emptyName)
        await customerEntry(page, emptyName).click()
        await expect(page.getByTestId('customer-title')).toHaveText(emptyName)
        await expect(page.getByTestId('customer-transactions-empty')).toBeVisible()
        await page.getByTestId('customer-more').click()
        await page.getByTestId('customer-more-inactive').click()
        await expect(page.getByTestId('customer-inactive-badge')).toBeVisible()
        await expect
            .poll(() => isDisabled(page.getByTestId('customer-transactions-empty-new')))
            .toBe(true)
    })
})
