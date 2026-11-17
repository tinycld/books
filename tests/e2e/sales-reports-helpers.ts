import { expect, type Locator, type Page } from '@playwright/test'
import { chooseParamOption, hubRow } from '@tinycld/core/e2e-helpers'
import {
    SALES_BY_CUSTOMER_TITLE,
    SALES_BY_PRODUCT_TITLE,
} from '~/tinycld/books/lib/sales-reports-fixture'
import { openBooksReports, reportSnapshot } from './books-report-helpers'
import { centsOf } from './customer-balance-helpers'
import { createCustomer, customerPath } from './customer-form-helpers'
import { INVOICE_URL, invoiceIdFromUrl, lineCellTestId, pickLineProduct } from './invoice-helpers'
import { createProduct } from './products-services-helpers'
import { uniqueName } from './record-form-helpers'
import {
    chooseReceiptSelect,
    pickReceiptLineProduct,
    SALES_RECEIPT_URL,
    salesReceiptIdFromUrl,
} from './sales-receipt-helpers'

// Steps of the sales reports e2e (sales-reports plan D10): they import the other helper
// files and change none of them, so no other spec's helper moves.

// A mounted row of a sales report: its core row id and kind, its outline depth, its label,
// and each cell's text as printed, by the column's heading ("Sales", "% of sales").
export interface SalesRow {
    id: string
    kind: 'group' | 'detail' | 'subtotal' | 'computed' | 'total'
    depth: number
    label: string
    cells: Record<string, string>
}

// A posted document of a SaleBook: its id and number, its Subtotal as the read view prints
// it, and each sale line's amount as the form printed it, in line order.
export interface SaleDocument {
    id: string
    number: string
    subtotalCents: number
    lines: { product: string; amountCents: number }[]
}

export interface SaleBook {
    customer: { id: string; name: string }
    // The names of the two products the book makes.
    service: string
    goods: string
    invoice: SaleDocument
    receipt: SaleDocument
}

// The seeded percent-line product (seed.ts, the posted invoice's discount line).
export const DISCOUNT_PRODUCT = 'Discount'

// The amount in a page's text ("Subtotal $1,250.00", "-$23.00"), in integer cents. It only
// cuts the "$…" figure out of the text; centsOf is the one rule that reads it. Throws when
// the text holds no amount.
export function amountCents(text: string): number {
    const figure = /[-−(]?\$[\d,]+(\.\d{1,2})?\)?/.exec(text)?.[0]
    if (figure === undefined) throw new Error(`no amount in "${text}"`)
    return centsOf(figure)
}

async function centsIn(locator: Locator): Promise<number> {
    await expect(locator).toContainText('$')
    return amountCents(await locator.innerText())
}

// The Sales by Customer row of the Books hub: its title alone, not a longer title that
// holds it.
export function salesByCustomerHubRow(page: Page): Locator {
    return hubRow(page, SALES_BY_CUSTOMER_TITLE).filter({
        has: page.getByText(SALES_BY_CUSTOMER_TITLE, { exact: true }),
    })
}

// The shipped Sales by Customer from the Books hub, reached as openCustomerBalance reaches
// the Customer Balance, through the viewer share Books keeps. It has an empty state, so the
// table or the empty text shows.
export async function openSalesByCustomer(page: Page): Promise<void> {
    await openBooksReports(page)
    const row = salesByCustomerHubRow(page)
    await expect(row, `the Books hub lists ${SALES_BY_CUSTOMER_TITLE}`).toBeVisible()
    await row.click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page.getByTestId('report-document-title')).toHaveText(SALES_BY_CUSTOMER_TITLE)
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// The Sales by Product/Service row of the Books hub: its title alone.
export function salesByProductHubRow(page: Page): Locator {
    return hubRow(page, SALES_BY_PRODUCT_TITLE).filter({
        has: page.getByText(SALES_BY_PRODUCT_TITLE, { exact: true }),
    })
}

// The shipped Sales by Product/Service from the Books hub, as openSalesByCustomer opens its
// report: the table or the empty text shows.
export async function openSalesByProduct(page: Page): Promise<void> {
    await openBooksReports(page)
    const row = salesByProductHubRow(page)
    await expect(row, `the Books hub lists ${SALES_BY_PRODUCT_TITLE}`).toBeVisible()
    await row.click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page.getByTestId('report-document-title')).toHaveText(SALES_BY_PRODUCT_TITLE)
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// The labels of the mounted depth-0 group rows before the Total, sorted.
function depth0Labels(rows: SalesRow[]): string[] {
    const end = rows.findIndex(row => row.kind === 'total')
    return (end < 0 ? rows : rows.slice(0, end))
        .filter(row => row.kind === 'group' && row.depth === 0)
        .map(row => row.label)
        .sort()
}

/**
 * Narrows the open Sales by Product/Service to the products `names` (filterSalesTo on
 * `products`), settled when the mounted depth-0 rows before the Total are exactly the names.
 * An inactive product's row carries " (inactive)", so pick it with filterSalesTo.
 */
export function filterToProducts(page: Page, names: readonly string[]): Promise<SalesRow[]> {
    const want = JSON.stringify([...names].sort())
    return filterSalesTo(
        page,
        'products',
        names.map(label => ({ label })),
        rows => rows.at(-1)?.kind === 'total' && JSON.stringify(depth0Labels(rows)) === want
    )
}

// The amount cell of an invoice or receipt line, read once its figure shows.
async function lineAmount(page: Page, rowId: string): Promise<number> {
    return centsIn(page.getByTestId(lineCellTestId(rowId, 'amount')))
}

// From the open customer's page: New transaction → `item`, for that customer.
async function startTransaction(page: Page, item: string, path: string, customerId: string) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId(item).click()
    await expect(page).toHaveURL(new RegExp(`/books/${path}/new\\?customer=${customerId}$`))
}

// Back from a document to the customer page kept under it.
async function backToCustomer(page: Page, customerId: string) {
    await page.goBack()
    await expect(page).toHaveURL(customerPath(customerId))
    await expect(page.getByTestId('customer-transactions')).toBeVisible()
}

async function titleNumber(page: Page, testId: string, word: string): Promise<string> {
    const title = page.getByTestId(testId)
    await expect(title).toHaveText(new RegExp(`^${word} \\d+$`))
    const number = new RegExp(`^${word} (\\d+)$`).exec(await title.innerText())?.[1]
    if (!number) throw new Error(`the ${word} title has no number`)
    return number
}

/**
 * Books must be open at desktop width. Creates a Service and a Non-inventory product and a
 * customer, each with a unique name, and from the customer's page posts, dated today:
 * an invoice with the service at quantity 1.5, the product at quantity 2 and a −10 percent
 * line on the seeded Discount product; and a sales receipt with the service at quantity 1.
 * Every amount is read from the screen: each line's from the form, each Subtotal from the
 * read view. Leaves the page on the customer.
 */
export async function postSaleBook(page: Page): Promise<SaleBook> {
    const service = uniqueName('Sale service')
    const goods = uniqueName('Sale goods')
    await createProduct(page, { type: 'service', name: service, price: '100.00' })
    await createProduct(page, { type: 'non_inventory', name: goods, price: '40.00' })
    const name = uniqueName('Sale customer')
    // From the products list back to the Lists hub, where the customer steps start.
    await page.getByTestId('books-nav-lists').click()
    await expect(
        page.getByTestId('books-list-card-customers').filter({ visible: true })
    ).toBeVisible()
    await createCustomer(page, { name })
    const customerId = new URL(page.url()).pathname.split('/').pop() ?? ''

    await startTransaction(page, 'customer-new-invoice', 'invoices', customerId)
    const first = await pickLineProduct(page, 0, service)
    await page.getByTestId(lineCellTestId(first, 'quantity')).fill('1.5')
    await page.getByTestId(lineCellTestId(first, 'rate')).fill('100.00')
    await expect(page.getByTestId(lineCellTestId(first, 'amount'))).toContainText('$150.00')
    await page.getByTestId('form-table-lines-add').click()
    const second = await pickLineProduct(page, 1, goods)
    await page.getByTestId(lineCellTestId(second, 'quantity')).fill('2')
    await page.getByTestId(lineCellTestId(second, 'rate')).fill('40.00')
    await expect(page.getByTestId(lineCellTestId(second, 'amount'))).toContainText('$80.00')
    // Add… → Percent line from the last line's menu (invoice-form-draft.spec.ts).
    await page.getByTestId(`form-table-lines-menu-${second}`).focus()
    await page.getByTestId('form-table-lines-add-more').click()
    await page.getByTestId('form-table-lines-add-percent').click()
    const percent = await pickLineProduct(page, 2, DISCOUNT_PRODUCT)
    await page.getByTestId(lineCellTestId(percent, 'percent')).fill('-10')
    await page.getByTestId(lineCellTestId(percent, 'description')).focus()
    await expect
        .poll(async () => {
            const text = await page.getByTestId(lineCellTestId(percent, 'amount')).innerText()
            return /\$\d/.test(text) && amountCents(text) < 0
        })
        .toBe(true)
    const invoiceLines = [
        { product: service, amountCents: await lineAmount(page, first) },
        { product: goods, amountCents: await lineAmount(page, second) },
        { product: DISCOUNT_PRODUCT, amountCents: await lineAmount(page, percent) },
    ]
    await page.getByTestId('invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
    const invoice: SaleDocument = {
        id: invoiceIdFromUrl(page),
        number: await titleNumber(page, 'invoice-title', 'Invoice'),
        subtotalCents: await centsIn(page.getByTestId('invoice-total-subtotal')),
        lines: invoiceLines,
    }
    await backToCustomer(page, customerId)

    await startTransaction(page, 'customer-new-sales-receipt', 'sales-receipts', customerId)
    const line = await pickReceiptLineProduct(page, 0, service)
    await page.getByTestId(lineCellTestId(line, 'quantity')).fill('1')
    await page.getByTestId(lineCellTestId(line, 'rate')).fill('100.00')
    await expect(page.getByTestId(lineCellTestId(line, 'amount'))).toContainText('$100.00')
    const receiptLines = [{ product: service, amountCents: await lineAmount(page, line) }]
    await chooseReceiptSelect(page, 'payment_method', 'Cash')
    await page.getByTestId('sales-receipt-post').click()
    await expect(page).toHaveURL(SALES_RECEIPT_URL)
    await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
    const receipt: SaleDocument = {
        id: salesReceiptIdFromUrl(page),
        number: await titleNumber(page, 'sales-receipt-title', 'Sales receipt'),
        subtotalCents: await centsIn(page.getByTestId('sales-receipt-total-subtotal')),
        lines: receiptLines,
    }
    await backToCustomer(page, customerId)

    return { customer: { id: customerId, name }, service, goods, invoice, receipt }
}

// Every mounted row of the open sales report, read in ONE reportSnapshot, with each cell
// keyed by its column's heading.
export async function salesRows(page: Page): Promise<SalesRow[]> {
    const snapshot = await reportSnapshot(page)
    return snapshot.rows.map(row => {
        const cells: Record<string, string> = {}
        for (const [column, text] of Object.entries(row.cells)) {
            cells[snapshot.headings[column] ?? column] = text
        }
        return { id: row.id, kind: row.kind, depth: row.depth, label: row.label, cells }
    })
}

/**
 * Narrows the open report through core's picker of `param` (sales-reports plan D16): an
 * unset param has no chip, so the first pick starts from Add filter and each later one from
 * the chip. A pick with a `group` presses that group's "All …" row; any other ticks the
 * option labelled `label`; each is found through the picker's search for `label`. It then
 * polls the mounted rows until `settled` holds (core keeps the previous run's rows until
 * the new run lands) and returns those rows.
 */
export async function filterSalesTo(
    page: Page,
    param: 'customers' | 'products',
    picks: readonly { label: string; group?: string }[],
    settled: (rows: SalesRow[]) => boolean
): Promise<SalesRow[]> {
    for (const [index, pick] of picks.entries()) {
        const from = index === 0 ? 'add-filter' : 'chip'
        if (pick.group !== undefined) {
            await chooseParamOption(page, param, { from, search: pick.label, group: pick.group })
        } else {
            await chooseParamOption(page, param, { from, search: pick.label, labels: [pick.label] })
        }
    }
    await expect.poll(() => new URL(page.url()).searchParams.get(`p-${param}`)).not.toBeNull()
    const last: { rows: SalesRow[] } = { rows: [] }
    await expect
        .poll(
            async () => {
                last.rows = await salesRows(page)
                return settled(last.rows)
            },
            { message: `the rows after the ${param} filter settle` }
        )
        .toBe(true)
    return last.rows
}

const SALES_ORDER_LABELS = { name: 'Name', sales: 'Largest sales' } as const

// Sets Order through its chip (it has a default, so the chip shows) and waits until the run
// for it has landed, by its request body: the rows of the two orders can be the same.
export async function chooseSalesOrder(page: Page, choice: 'name' | 'sales'): Promise<void> {
    const label = SALES_ORDER_LABELS[choice]
    const landed = page.waitForResponse(response => {
        if (!response.url().includes('/api/reports/run') || !response.ok()) return false
        const body = response.request().postDataJSON() as { params?: { order?: string } } | null
        return (body?.params?.order ?? 'name') === choice
    })
    await chooseParamOption(page, 'order', { from: 'chip', labels: [label] })
    await expect.poll(() => new URL(page.url()).searchParams.get('p-order') ?? 'name').toBe(choice)
    await landed
    await expect(page.getByTestId('report-param-order')).toContainText(label)
}

// Presses the mounted row `rowId` as a user does: core's sticky copy of a group header
// (`report-sticky-row-<id>`) can lie over the row, and then that copy is what a press
// reaches. The copy is pressed only when it is what lies over the row's middle (as
// journal-report.spec.ts presses a block heading).
export async function pressReportRow(page: Page, rowId: string): Promise<void> {
    const row = page.getByTestId(`report-row-${rowId}`)
    const stickyId = `report-sticky-row-${rowId}`
    const isCovered = await row.evaluate(async (element, sticky) => {
        element.scrollIntoView({ block: 'center' })
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const box = element.getBoundingClientRect()
        const onTop = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        const copy = onTop?.closest('[data-testid^="report-sticky-row-"]')
        return copy?.getAttribute('data-testid') === sticky
    }, stickyId)
    if (isCovered) return page.getByTestId(stickyId).click()
    await row.click()
}

// The computed text color of a mounted row's label and of its `column` figure: each read
// on the deepest element that holds the whole text, in ONE pass.
export function rowColors(
    page: Page,
    rowId: string,
    column: string
): Promise<{ label: string; figure: string }> {
    return page.evaluate(
        ({ id, col }) => {
            const table = document.querySelector('[data-testid="report-table"]')
            const find = (testId: string) =>
                [...(table?.querySelectorAll('[data-testid]') ?? [])].find(
                    element => element.getAttribute('data-testid') === testId
                )
            const colorOf = (element: Element | undefined) => {
                if (!element) return ''
                const whole = (element.textContent ?? '').trim()
                let found: Element = element
                for (const node of element.querySelectorAll('*')) {
                    if ((node.textContent ?? '').trim() === whole) found = node
                }
                return getComputedStyle(found).color
            }
            return {
                label: colorOf(find(`report-row-${id}`)),
                figure: colorOf(find(`report-cell-${col}-${id}`)),
            }
        },
        { id: rowId, col: column }
    )
}
