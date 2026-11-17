import { expect, type Page, test } from '@playwright/test'
import { CUSTOMER_IDS, CUSTOMERS } from '~/tinycld/books/lib/customer-form-fixture'
import { SALES_BY_CUSTOMER_DESCRIPTION } from '~/tinycld/books/lib/sales-reports-fixture'
import { DESKTOP } from './account-register-helpers'
import {
    browserToday,
    choosePeriod,
    csvRecords,
    exportReport,
    openBooksReports,
} from './books-report-helpers'
import { CREDIT_MEMO_URL, postCreditMemo } from './credit-memo-helpers'
import { centsOf } from './customer-balance-helpers'
import {
    customerPageUrl,
    customerPath,
    field,
    openBooks,
    uniqueName,
} from './customer-form-helpers'
import { INVOICE_URL, lineCellTestId, pickLineProduct } from './invoice-helpers'
import {
    amountCents,
    chooseSalesOrder,
    filterSalesTo,
    openSalesByCustomer,
    postSaleBook,
    pressReportRow,
    rowColors,
    type SalesRow,
    salesByCustomerHubRow,
    salesRows,
} from './sales-reports-helpers'

// Sales by Customer (sales-reports checkpoint 1): the shipped report from the Books hub,
// read for the customers each test creates. Every test posts its documents today and reads
// exact figures only with the Customer filter set to its own customer, so the Total is its
// own too (plan run rules). Core's table mounts only the rows near the viewport: a test
// reads its filtered rows in one snapshot, or the whole report's labels through the CSV.

const SALES = 'Sales'
const SHARE = '% of sales'

// Holds every seeded sale and no day before 2026-07-01 (plan run rules).
const SEEDED_PERIOD = {
    from: '2026-07-01',
    to: '2026-12-31',
    words: 'July 1 – December 31, 2026',
} as const

function salesOf(row: SalesRow | undefined): number {
    const text = row?.cells[SALES] ?? ''
    if (text === '') throw new Error(`no Sales figure on the row "${row?.label}"`)
    return centsOf(text)
}

function shareOf(row: SalesRow | undefined): string {
    return row?.cells[SHARE] ?? ''
}

// The detail rows right after the non-detail row `label`.
function linesUnder(rows: SalesRow[], label: string): SalesRow[] {
    const start = rows.findIndex(row => row.kind !== 'detail' && row.label === label)
    if (start < 0) return []
    const after = rows.slice(start + 1)
    const end = after.findIndex(row => row.kind !== 'detail')
    return end < 0 ? after : after.slice(0, end)
}

function customerRow(rows: SalesRow[], name: string): SalesRow | undefined {
    return rows.find(row => row.kind === 'group' && row.label === name)
}

// The report filtered to one customer: its row and the Total, nothing else.
async function filterToOwnCustomer(page: Page, name: string): Promise<SalesRow[]> {
    return filterSalesTo(
        page,
        'customers',
        [{ label: name }],
        rows =>
            customerRow(rows, name) !== undefined &&
            rows.at(-1)?.kind === 'total' &&
            !rows.some(row => row.label === 'No customer')
    )
}

// Presses a customer row and waits for its sale lines.
async function openSalesRow(page: Page, name: string): Promise<SalesRow[]> {
    const row = (await salesRows(page)).find(r => r.kind === 'group' && r.label === name)
    if (!row) throw new Error(`no mounted row "${name}"`)
    await page.getByTestId(`report-row-${row.id}`).click()
    const last: { rows: SalesRow[] } = { rows: [] }
    await expect
        .poll(
            async () => {
                last.rows = await salesRows(page)
                return linesUnder(last.rows, name).length
            },
            { message: `${name}'s sale lines show` }
        )
        .toBeGreaterThan(0)
    return last.rows
}

// A share as the view prints it at 2 places: sales ÷ total.
function shareText(sales: number, total: number): string {
    return `${(Math.round((sales * 10000) / total) / 100).toFixed(2)}%`
}

test.describe('sales-reports: Sales by Customer', () => {
    test("a customer's posted sales, its sale lines, and a sale line that opens its invoice", async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const book = await postSaleBook(page)
        const name = book.customer.name
        const today = await browserToday(page)

        await openBooksReports(page)
        const hub = salesByCustomerHubRow(page)
        await expect(hub).toBeVisible()
        await expect(hub).toContainText(SALES_BY_CUSTOMER_DESCRIPTION)
        await openSalesByCustomer(page)

        const rows = await filterToOwnCustomer(page, name)
        await expect(page.getByTestId('report-header-param-customers')).toHaveText(
            `Customer: ${name}`
        )
        const own = customerRow(rows, name)
        const total = rows.at(-1)
        expect(salesOf(own)).toBe(book.invoice.subtotalCents + book.receipt.subtotalCents)
        expect(salesOf(total)).toBe(salesOf(own))
        expect(shareOf(own)).toBe('100.00%')
        expect(shareOf(total)).toBe('100.00%')
        expect(rows.map(row => row.label)).not.toContain('No customer')

        const opened = await openSalesRow(page, name)
        const lines = linesUnder(opened, name)
        const invoiceWords = `${today} · Invoice ${book.invoice.number}`
        const receiptWords = `${today} · Sales receipt ${book.receipt.number}`
        expect(lines.map(line => line.label).sort()).toEqual(
            [
                ...book.invoice.lines.map(line => `${invoiceWords} · ${line.product}`),
                ...book.receipt.lines.map(line => `${receiptWords} · ${line.product}`),
            ].sort()
        )
        for (const line of lines) expect(shareOf(line), `${line.label} has no share`).toBe('')
        const discount = lines.find(line => line.label === `${invoiceWords} · Discount`)
        expect(salesOf(discount)).toBeLessThan(0)
        expect(salesOf(discount)).toBe(book.invoice.lines[2]?.amountCents)
        const sum = lines.reduce((acc, line) => acc + salesOf(line), 0)
        expect(sum).toBe(salesOf(customerRow(opened, name)))

        const serviceLine = lines.find(line => line.label === `${invoiceWords} · ${book.service}`)
        if (!serviceLine) throw new Error('no invoice line of the service')
        await page.getByTestId(`report-row-${serviceLine.id}`).click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page).toHaveURL(new RegExp(`/books/invoices/${book.invoice.id}$`))
        await expect(page.getByTestId('invoice-title')).toHaveText(`Invoice ${book.invoice.number}`)
    })

    test('a posted credit memo lowers the customer and opens as a credit memo', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const book = await postSaleBook(page)
        const name = book.customer.name
        const memo = await postCreditMemo(page, {
            customer: name,
            product: book.service,
            qty: '1',
            rate: '60.00',
            memo: uniqueName('Sales memo'),
        })
        const memoSubtotal = page.getByTestId('credit-memo-total-subtotal')
        await expect(memoSubtotal).toContainText('$')
        const memoCents = amountCents(await memoSubtotal.innerText())
        expect(memoCents).toBeGreaterThan(0)

        await openSalesByCustomer(page)
        const rows = await filterToOwnCustomer(page, name)
        expect(salesOf(customerRow(rows, name))).toBe(
            book.invoice.subtotalCents + book.receipt.subtotalCents - memoCents
        )

        const opened = await openSalesRow(page, name)
        const memoLines = linesUnder(opened, name).filter(line =>
            line.label.includes(` · Credit memo ${memo.number} · `)
        )
        expect(memoLines.map(line => line.label)).toHaveLength(1)
        const [memoLine] = memoLines
        expect(salesOf(memoLine)).toBe(-memoCents)
        await page.getByTestId(`report-row-${memoLine.id}`).click()
        await expect(page).toHaveURL(CREDIT_MEMO_URL)
        await expect(page).toHaveURL(new RegExp(`/books/credit-memos/${memo.id}$`))
    })

    test('a sub-customer sale turns the row into a family with a total', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const book = await postSaleBook(page)
        const parent = book.customer.name
        await expect(page).toHaveURL(customerPath(book.customer.id))

        // Two sub-customers whose name order (A, B) is the reverse of their sales order: B
        // sells more than the parent's own row, A less, so only a Largest sales run puts B
        // before A, and the parent's own row stays first under both orders.
        const small = uniqueName('Sale branch A')
        const big = uniqueName('Sale branch B')
        await addSubCustomer(page, small)
        await postSubInvoice(page, book.service, '10.00', '$100.00')
        // Back to the sub-customer's page, then through its parent link to the parent's.
        await page.goBack()
        await expect(page.getByTestId('customer-title')).toHaveText(small)
        await page.getByTestId('customer-parent-link').click()
        await expect(page).toHaveURL(customerPath(book.customer.id))
        await addSubCustomer(page, big)
        await postSubInvoice(page, book.service, '100.00', '$1,000.00')

        await openSalesByCustomer(page)
        // The parent's own row (depth 1) shows only in the run of the final pick: the first
        // pick, "All <parent> sub-customers", leaves it out.
        const familyShows = (rows: SalesRow[]) =>
            rows.some(row => row.kind === 'group' && row.label === parent && row.depth === 0) &&
            rows.some(row => row.kind === 'group' && row.label === parent && row.depth === 1) &&
            rows.some(row => row.kind === 'subtotal' && row.label === `Total ${parent}`) &&
            rows.some(row => row.label === small) &&
            rows.some(row => row.label === big) &&
            !rows.some(row => row.label === 'No customer')
        const indexOf = (rows: SalesRow[], label: string) =>
            rows.findIndex(row => row.label === label)
        const rows = await filterSalesTo(
            page,
            'customers',
            [{ label: parent, group: parent }, { label: parent }],
            familyShows
        )
        const family = rows.slice(0, 5)
        expect(family.map(row => [row.kind, row.label, row.depth])).toEqual([
            ['group', parent, 0],
            ['group', parent, 1],
            ['group', small, 1],
            ['group', big, 1],
            ['subtotal', `Total ${parent}`, 0],
        ])
        const [, own, smallRow, bigRow, familyTotal] = family
        expect(salesOf(own)).toBe(book.invoice.subtotalCents + book.receipt.subtotalCents)
        expect(salesOf(bigRow)).toBeGreaterThan(salesOf(own))
        expect(salesOf(smallRow)).toBeLessThan(salesOf(own))
        expect(salesOf(familyTotal)).toBe(salesOf(own) + salesOf(smallRow) + salesOf(bigRow))
        expect(shareOf(familyTotal)).toBe('100.00%')
        const total = salesOf(familyTotal)
        const members = [own, smallRow, bigRow]
        for (const member of members) {
            expect(shareOf(member), `${member.label}'s share`).toBe(
                shareText(salesOf(member), total)
            )
        }
        // In hundredths of a percent, so float error does not count against the 0.01.
        const hundredths = members.reduce(
            (acc, member) => acc + Math.round(Number.parseFloat(shareOf(member)) * 100),
            0
        )
        expect(Math.abs(hundredths - 10000)).toBeLessThanOrEqual(1)

        // D3: a folded family shows its figures on the header.
        const header = family[0]
        await pressReportRow(page, header.id)
        const folded = await filterSettled(
            page,
            r => !r.some(row => row.label === small || row.label === big),
            `the ${parent} family folds`
        )
        const familyRows = folded.filter(row => row.kind !== 'total')
        expect(familyRows.map(row => [row.kind, row.label])).toEqual([['group', parent]])
        expect(salesOf(familyRows[0])).toBe(total)
        expect(shareOf(familyRows[0])).toBe('100.00%')

        await pressReportRow(page, header.id)
        await filterSettled(page, familyShows, `the ${parent} family opens again`)
        await chooseSalesOrder(page, 'sales')
        // Only the Largest sales run puts B before A (the Name run has A first).
        const bySales = await filterSettled(
            page,
            r => familyShows(r) && indexOf(r, big) < indexOf(r, small),
            'the family under Largest sales'
        )
        expect(bySales.slice(0, 4).map(row => [row.label, row.depth])).toEqual([
            [parent, 0],
            [parent, 1],
            [big, 1],
            [small, 1],
        ])
    })

    test('the seeded book: No customer last, an inactive customer marked, an empty period', async ({
        page,
    }) => {
        const oldMill = CUSTOMERS.find(customer => customer.id === CUSTOMER_IDS.oldMill)
        if (!oldMill) throw new Error('no Old Mill Bakery in the customer fixture')
        const inactiveLabel = `${oldMill.display_name} (inactive)`
        await openBooks(page, DESKTOP)
        await openSalesByCustomer(page)
        // A fixed period that holds the seeded sales (Old Mill Bakery's receipt of 2026-10-16,
        // the No customer receipt of 2026-10-14), so the test does not hang on the day it
        // runs. The document period is the run result's, so it shows only once that run lands.
        await choosePeriod(page, { from: SEEDED_PERIOD.from, to: SEEDED_PERIOD.to })
        await expect(page.getByTestId('report-document-period')).toHaveText(SEEDED_PERIOD.words)

        const { bytes } = await exportReport(page, 'csv')
        const labels = csvRecords(bytes)
            .slice(1)
            .map(record => record[0] ?? '')
            .filter(label => label !== '')
        // CSV opens every group, so No customer's own sale lines follow it. It is the last
        // customer-level label: only its sale lines (`<date> · Sales receipt <n>[ · …]`) lie
        // between it and the Total, and it comes after Old Mill Bakery, which a by-name order
        // with no "last" rule would put after it.
        expect(labels.at(-1)).toBe('Total')
        expect(labels.filter(label => label === 'No customer')).toEqual(['No customer'])
        const noCustomer = labels.indexOf('No customer')
        const afterNoCustomer = labels.slice(noCustomer + 1, -1)
        expect(afterNoCustomer.length).toBeGreaterThan(0)
        for (const label of afterNoCustomer) {
            expect(label, 'only No customer sale lines follow it').toMatch(
                / · Sales receipt \d+( · .*)?$/
            )
        }
        expect(labels).toContain(inactiveLabel)
        expect(labels.indexOf(inactiveLabel)).toBeLessThan(noCustomer)

        const unfiltered = await salesRows(page)
        const active = unfiltered.find(
            row =>
                row.kind === 'group' &&
                row.depth === 0 &&
                row.label !== 'No customer' &&
                !row.label.endsWith('(inactive)') &&
                row.cells[SALES] !== ''
        )
        if (!active) throw new Error('no mounted active customer row')
        const activeColors = await rowColors(page, active.id, 'sales')

        // Only the filtered run has Old Mill Bakery as its one customer row.
        const rows = await filterSalesTo(
            page,
            'customers',
            [{ label: oldMill.display_name }],
            r =>
                JSON.stringify(
                    r.filter(row => row.kind === 'group' && row.depth === 0).map(row => row.label)
                ) === JSON.stringify([inactiveLabel]) && r.at(-1)?.kind === 'total'
        )
        await expect(page.getByTestId('report-document-period')).toHaveText(SEEDED_PERIOD.words)
        const inactive = customerRow(rows, inactiveLabel)
        if (!inactive) throw new Error(`no mounted row "${inactiveLabel}"`)
        const colors = await rowColors(page, inactive.id, 'sales')
        expect(colors.label).not.toBe('')
        expect(colors.label).toBe(colors.figure)
        expect(colors.label).not.toBe(activeColors.label)

        await choosePeriod(page, { from: '2020-01-01', to: '2020-12-31' })
        await expect(page.getByTestId('report-empty')).toContainText(
            'No rows for January 1 – December 31, 2020'
        )
        await expect(page.locator('[data-testid^="report-row-"]')).toHaveCount(0)
    })
})

// From the open customer's page: More → Add sub-customer, saved as `name`; leaves the page on
// the new sub-customer.
async function addSubCustomer(page: Page, name: string) {
    await page.getByTestId('customer-more').click()
    await page.getByTestId('customer-more-add-sub').click()
    await field(page, 'display_name').fill(name)
    await page.getByTestId('customer-save').click()
    await expect(page).toHaveURL(customerPageUrl)
    await expect(page.getByTestId('customer-title')).toHaveText(name)
}

// From the open customer's page: posts an invoice, dated today, of `product` at quantity 10
// and `rate`, once the form shows the line's `amount`.
async function postSubInvoice(page: Page, product: string, rate: string, amount: string) {
    const customerId = new URL(page.url()).pathname.split('/').pop() ?? ''
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customerId}$`))
    const line = await pickLineProduct(page, 0, product)
    await page.getByTestId(lineCellTestId(line, 'quantity')).fill('10')
    await page.getByTestId(lineCellTestId(line, 'rate')).fill(rate)
    await expect(page.getByTestId(lineCellTestId(line, 'amount'))).toContainText(amount)
    await page.getByTestId('invoice-post').click()
    await expect(page).toHaveURL(INVOICE_URL)
    await expect(page.getByTestId('invoice-read-only')).toBeVisible()
}

// Polls the mounted rows until `settled` holds; returns them.
async function filterSettled(
    page: Page,
    settled: (rows: SalesRow[]) => boolean,
    message: string
): Promise<SalesRow[]> {
    const last: { rows: SalesRow[] } = { rows: [] }
    await expect
        .poll(
            async () => {
                last.rows = await salesRows(page)
                return settled(last.rows)
            },
            { message }
        )
        .toBe(true)
    return last.rows
}
