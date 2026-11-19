import { expect, type Page, test } from '@playwright/test'
import {
    CUSTOMER_BALANCE_SEED,
    CUSTOMER_BALANCE_TITLE,
} from '~/tinycld/books/lib/customer-balance-fixture'
import { CUSTOMER_IDS, CUSTOMERS } from '~/tinycld/books/lib/customer-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '~/tinycld/books/lib/products-services-fixture'
import {
    SALES_BY_CUSTOMER_DESCRIPTION,
    SALES_BY_CUSTOMER_TITLE,
    SALES_BY_PRODUCT_DESCRIPTION,
    SALES_BY_PRODUCT_TITLE,
    SALES_REPORTS_SEED,
} from '~/tinycld/books/lib/sales-reports-fixture'
import {
    CUSTOMER_BALANCE_SHIPPED_KEY,
    SALES_BY_CUSTOMER_SHIPPED_KEY,
    SALES_BY_PRODUCT_SHIPPED_KEY,
} from '~/tinycld/books/lib/shipped-reports'
import { DESKTOP, PHONE } from './account-register-helpers'
import {
    browserToday,
    choosePeriod,
    csvRecords,
    dayWords,
    exportReport,
    openBooksReports,
} from './books-report-helpers'
import { CREDIT_MEMO_URL, postCreditMemo } from './credit-memo-helpers'
import { centsOf } from './customer-balance-helpers'
import {
    customerEntries,
    customerPageUrl,
    customerPath,
    field,
    openBooks,
    openCustomersList,
    uniqueName,
} from './customer-form-helpers'
import { INVOICE_URL, lineCellTestId, pickLineProduct } from './invoice-helpers'
import { openProductsList, productEntries } from './products-services-helpers'
import { SALES_RECEIPT_URL } from './sales-receipt-helpers'
import {
    amountCents,
    chooseSalesOrder,
    DISCOUNT_PRODUCT,
    expectSalesPhoneLines,
    expectSalesRowsFit,
    filterSalesTo,
    filterToProducts,
    openSalesByCustomer,
    openSalesByProduct,
    postSaleBook,
    pressReportRow,
    rowColors,
    type SaleDocument,
    type SalesRow,
    salesByCustomerHubRow,
    salesByProductHubRow,
    salesRows,
    scrollToSalesRow,
} from './sales-reports-helpers'
import { fakeReadOnlyAccess } from './tax-rates-helpers'

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

// The depth-0 group labels before the Total, in screen order.
function topLabels(rows: SalesRow[]): string[] {
    const end = rows.findIndex(row => row.kind === 'total')
    return (end < 0 ? rows : rows.slice(0, end))
        .filter(row => row.kind === 'group' && row.depth === 0)
        .map(row => row.label)
}

// Only the run filtered to `name` holds `name` as its one depth-0 row, then the Total: the
// mounted rows of an unfiltered run hold other customers too.
function onlyTopRow(rows: SalesRow[], name: string): boolean {
    return (
        rows.at(-1)?.kind === 'total' && JSON.stringify(topLabels(rows)) === JSON.stringify([name])
    )
}

// The report filtered to one customer: its row and the Total, nothing else.
async function filterToOwnCustomer(page: Page, name: string): Promise<SalesRow[]> {
    return filterSalesTo(page, 'customers', [{ label: name }], rows => onlyTopRow(rows, name))
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

// The seeded family (seed.ts seedSalesFamily).
const SEEDED_FAMILY = SALES_REPORTS_SEED.family

type FamilyNames = { parent: string; small: string; big: string }

// The parent's own row (depth 1) shows only in the run of the final pick: the first pick,
// "All <parent> sub-customers", leaves it out. The family as the one depth-0 row before the
// Total holds only for the filtered run: an unfiltered run also holds the family, but beside
// other customers.
function familyShows(rows: SalesRow[], { parent, small, big }: FamilyNames): boolean {
    return (
        onlyTopRow(rows, parent) &&
        rows.some(row => row.kind === 'group' && row.label === parent && row.depth === 1) &&
        rows.some(row => row.kind === 'subtotal' && row.label === `Total ${parent}`) &&
        rows.some(row => row.label === small) &&
        rows.some(row => row.label === big) &&
        !rows.some(row => row.label === 'No customer')
    )
}

// The report filtered to the whole family of `names.parent`: its sub-customers' group,
// then the parent itself. Core's picker search keeps the options whose own label holds it
// (server/reports/options.go optionConds), and a group head shows only over options the
// search kept: so the "All <parent> sub-customers" head is reached by a search for a
// sub-customer. A search for the parent lists only the parent's own option, in no group.
function filterToFamily(page: Page, names: FamilyNames): Promise<SalesRow[]> {
    return filterSalesTo(
        page,
        'customers',
        [{ label: names.small, group: names.parent }, { label: names.parent }],
        rows => familyShows(rows, names)
    )
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
        // sells more than the parent's own row, A less. The fold and the Largest sales order
        // are checked on the seeded family (the next test), so this test does no more runs.
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
        const rows = await filterToFamily(page, { parent, small, big })
        const family = rows.slice(0, 5)
        expect(family.map(row => [row.kind, row.label, row.depth])).toEqual([
            ['group', parent, 0],
            ['group', parent, 1],
            ['group', small, 1],
            ['group', big, 1],
            ['subtotal', `Total ${parent}`, 0],
        ])
        // The family's five rows, then only the report's Total.
        expect(rows.slice(5).map(row => row.kind)).toEqual(['total'])
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
    })

    test('a folded family shows its figures on its header, and Largest sales puts the bigger sub-customer first', async ({
        page,
    }) => {
        const names = {
            parent: SEEDED_FAMILY.parent.name,
            small: SEEDED_FAMILY.small.name,
            big: SEEDED_FAMILY.big.name,
        }
        const { parent, small, big } = names
        await openBooks(page, DESKTOP)
        await openSalesByCustomer(page)
        // The seeded family's day, which holds no other sale (sales-reports-fixture.ts), as
        // seed.ts dates it: `yearsAgo` years before the year the seed (and the test) runs.
        const year = Number((await browserToday(page)).slice(0, 4)) - SEEDED_FAMILY.yearsAgo
        const day = `${year}-${SEEDED_FAMILY.day}`
        await choosePeriod(page, { from: day, to: day })
        const rows = await filterToFamily(page, names)
        await expect(page.getByTestId('report-document-period')).toHaveText(dayWords(day))
        const family = rows.slice(0, 5)
        expect(family.map(row => [row.kind, row.label, row.depth])).toEqual([
            ['group', parent, 0],
            ['group', parent, 1],
            ['group', small, 1],
            ['group', big, 1],
            ['subtotal', `Total ${parent}`, 0],
        ])
        const [header, own, smallRow, bigRow, familyTotal] = family
        expect(salesOf(own)).toBe(SEEDED_FAMILY.parent.cents)
        expect(salesOf(smallRow)).toBe(SEEDED_FAMILY.small.cents)
        expect(salesOf(bigRow)).toBe(SEEDED_FAMILY.big.cents)
        const total = salesOf(familyTotal)
        expect(total).toBe(salesOf(own) + salesOf(smallRow) + salesOf(bigRow))

        // D3: a folded family shows its figures on the header.
        await pressReportRow(page, header.id)
        const folded = await filterSettled(
            page,
            r => onlyTopRow(r, parent) && !r.some(row => row.label === small || row.label === big),
            `the ${parent} family folds`
        )
        const familyRows = folded.filter(row => row.kind !== 'total')
        expect(familyRows.map(row => [row.kind, row.label])).toEqual([['group', parent]])
        expect(salesOf(familyRows[0])).toBe(total)
        expect(shareOf(familyRows[0])).toBe('100.00%')

        await pressReportRow(page, header.id)
        await filterSettled(page, r => familyShows(r, names), `the ${parent} family opens again`)
        await chooseSalesOrder(page, 'sales')
        // Only the Largest sales run puts B before A (the Name run has A first).
        const indexOf = (r: SalesRow[], label: string) => r.findIndex(row => row.label === label)
        const bySales = await filterSettled(
            page,
            r => familyShows(r, names) && indexOf(r, big) < indexOf(r, small),
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
        const rows = await filterSalesTo(page, 'customers', [{ label: oldMill.display_name }], r =>
            onlyTopRow(r, inactiveLabel)
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

// Sales by Product/Service (sales-reports checkpoint 2), read under the Customer filter set to
// the test's own customer, so every product row and the Total are the test's own.

const QUANTITY = 'Quantity'
const AMOUNT = 'Amount'
const AVG = 'Avg price'

// The seeded inactive product with a posted sale (seed.ts seedSalesReports, plan D4).
const FAX_SETUP = PRODUCTS.find(product => product.id === PRODUCT_IDS.faxSetup)?.name ?? ''
// The seeded bundles (seed.ts creates every product of PRODUCTS).
const SEEDED_BUNDLES = PRODUCTS.filter(product => product.type === 'bundle').map(p => p.name)

function textIn(row: SalesRow | undefined, column: string): string {
    return row?.cells[column] ?? ''
}

function centsIn(row: SalesRow | undefined, column: string): number {
    const text = textIn(row, column)
    if (text === '') throw new Error(`no ${column} figure on the row "${row?.label}"`)
    return centsOf(text)
}

// A % of sales text as a number: "12.35%", "-1.20%", "−1.20%" or "(1.20%)".
function percentOf(text: string): number {
    const isNegative = /^[-−(]/.test(text)
    const magnitude = Number.parseFloat(text.replace(/[^\d.]/g, ''))
    return isNegative ? -magnitude : magnitude
}

function productRow(rows: SalesRow[], name: string): SalesRow | undefined {
    return rows.find(row => row.kind === 'group' && row.depth === 0 && row.label === name)
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
}

function lineCents(document: SaleDocument, index: number): number {
    const line = document.lines[index]
    if (!line) throw new Error(`no line ${index + 1} on document ${document.number}`)
    return line.amountCents
}

// Sales by Product/Service filtered to the customer `name`: settled when its product rows
// are exactly `products` and `extra` holds.
function filterProductsToCustomer(
    page: Page,
    name: string,
    products: readonly string[],
    extra: (rows: SalesRow[]) => boolean = () => true
): Promise<SalesRow[]> {
    return filterSalesTo(
        page,
        'customers',
        [{ label: name }],
        rows => rows.at(-1)?.kind === 'total' && sameSet(topLabels(rows), products) && extra(rows)
    )
}

test.describe('sales-reports: Sales by Product/Service', () => {
    test("each product's quantity, amount, share and average price, with a Total that has no quantity", async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const book = await postSaleBook(page)
        const name = book.customer.name

        await openBooksReports(page)
        const hub = salesByProductHubRow(page)
        await expect(hub).toBeVisible()
        await expect(hub).toContainText(SALES_BY_PRODUCT_DESCRIPTION)
        await openSalesByProduct(page)

        const rows = await filterProductsToCustomer(page, name, [
            book.service,
            book.goods,
            DISCOUNT_PRODUCT,
        ])
        await expect(page.getByTestId('report-header-param-customers')).toHaveText(
            `Customer: ${name}`
        )
        const serviceAmount = lineCents(book.invoice, 0) + lineCents(book.receipt, 0)
        const goodsAmount = lineCents(book.invoice, 1)
        const discountAmount = lineCents(book.invoice, 2)
        expect(discountAmount).toBeLessThan(0)

        const service = productRow(rows, book.service)
        expect(textIn(service, QUANTITY)).toBe('2.5')
        expect(centsIn(service, AMOUNT)).toBe(serviceAmount)
        expect(centsIn(service, AVG)).toBe(Math.round(serviceAmount / 2.5))
        const goods = productRow(rows, book.goods)
        expect(textIn(goods, QUANTITY)).toBe('2')
        expect(centsIn(goods, AMOUNT)).toBe(goodsAmount)
        expect(centsIn(goods, AVG)).toBe(Math.round(goodsAmount / 2))
        const discount = productRow(rows, DISCOUNT_PRODUCT)
        expect(centsIn(discount, AMOUNT)).toBe(discountAmount)
        expect(textIn(discount, QUANTITY)).toBe('')
        expect(textIn(discount, AVG)).toBe('')

        const shares = [service, goods, discount].map(row => textIn(row, SHARE))
        for (const share of shares) expect(share).toMatch(/^[-−(]?\d+\.\d{2}%\)?$/)
        expect(percentOf(textIn(discount, SHARE))).toBeLessThan(0)
        const shareSum = shares.reduce((acc, share) => acc + percentOf(share), 0)
        expect(Math.abs(shareSum - 100)).toBeLessThanOrEqual(0.02)

        const total = rows.at(-1)
        const totalAmount = centsIn(total, AMOUNT)
        expect(totalAmount).toBe(serviceAmount + goodsAmount + discountAmount)
        expect(textIn(total, SHARE)).toBe('100.00%')
        expect(textIn(total, QUANTITY)).toBe('')
        expect(textIn(total, AVG)).toBe('')

        await openSalesByCustomer(page)
        const customerRows = await filterToOwnCustomer(page, name)
        expect(salesOf(customerRows.at(-1))).toBe(totalAmount)
    })

    test('opening a product shows its sale lines, and a sale line opens its sales receipt', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const book = await postSaleBook(page)
        const name = book.customer.name
        const today = await browserToday(page)

        await openSalesByProduct(page)
        await filterProductsToCustomer(page, name, [book.service, book.goods, DISCOUNT_PRODUCT])
        const opened = await openSalesRow(page, book.service)
        const lines = linesUnder(opened, book.service)
        const invoiceLabel = `${today} · Invoice ${book.invoice.number} · ${name}`
        const receiptLabel = `${today} · Sales receipt ${book.receipt.number} · ${name}`
        expect(lines.map(line => line.label).sort()).toEqual([invoiceLabel, receiptLabel].sort())

        const invoiceLine = lines.find(line => line.label === invoiceLabel)
        const invoiceAmount = lineCents(book.invoice, 0)
        expect(textIn(invoiceLine, QUANTITY)).toBe('1.5')
        expect(centsIn(invoiceLine, AMOUNT)).toBe(invoiceAmount)
        expect(centsIn(invoiceLine, AVG)).toBe(Math.round(invoiceAmount / 1.5))
        expect(textIn(invoiceLine, SHARE)).toBe('')
        const receiptLine = lines.find(line => line.label === receiptLabel)
        const receiptAmount = lineCents(book.receipt, 0)
        expect(textIn(receiptLine, QUANTITY)).toBe('1')
        expect(centsIn(receiptLine, AMOUNT)).toBe(receiptAmount)
        expect(centsIn(receiptLine, AVG)).toBe(receiptAmount)
        expect(textIn(receiptLine, SHARE)).toBe('')

        if (!receiptLine) throw new Error('no sale line of the sales receipt')
        await pressReportRow(page, receiptLine.id)
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await expect(page).toHaveURL(new RegExp(`/books/sales-receipts/${book.receipt.id}$`))
        await expect(page.getByTestId('sales-receipt-title')).toHaveText(
            `Sales receipt ${book.receipt.number}`
        )
    })

    test('a void of the sales receipt lowers both reports', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const book = await postSaleBook(page)
        const name = book.customer.name
        const products = [book.service, book.goods, DISCOUNT_PRODUCT]

        await openSalesByProduct(page)
        const before = await filterProductsToCustomer(page, name, products)
        const serviceBefore = productRow(before, book.service)
        expect(textIn(serviceBefore, QUANTITY)).toBe('2.5')
        expect(centsIn(serviceBefore, AMOUNT)).toBe(
            lineCents(book.invoice, 0) + lineCents(book.receipt, 0)
        )
        const totalBefore = centsIn(before.at(-1), AMOUNT)

        // To the receipt's read view through its sale line, and void it there.
        const opened = await openSalesRow(page, book.service)
        const receiptLine = linesUnder(opened, book.service).find(line =>
            line.label.includes(` · Sales receipt ${book.receipt.number}`)
        )
        if (!receiptLine) throw new Error('no sale line of the sales receipt')
        await pressReportRow(page, receiptLine.id)
        await expect(page).toHaveURL(new RegExp(`/books/sales-receipts/${book.receipt.id}$`))
        await page.getByTestId('sales-receipt-read-void').click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('sales-receipt-badge')).toHaveText('Void')

        await openSalesByProduct(page)
        const after = await filterProductsToCustomer(
            page,
            name,
            products,
            rows => textIn(productRow(rows, book.service), QUANTITY) === '1.5'
        )
        expect(centsIn(productRow(after, book.service), AMOUNT)).toBe(lineCents(book.invoice, 0))
        const totalAfter = centsIn(after.at(-1), AMOUNT)
        expect(totalAfter).toBe(totalBefore - book.receipt.subtotalCents)

        await openSalesByCustomer(page)
        const customerRows = await filterToOwnCustomer(page, name)
        expect(salesOf(customerRows.at(-1))).toBe(totalAfter)
    })

    test('the Product filter and the Order choice', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const book = await postSaleBook(page)
        const name = book.customer.name
        const products = [book.service, book.goods, DISCOUNT_PRODUCT]

        await openSalesByProduct(page)
        const all = await filterProductsToCustomer(page, name, products)
        const amounts = new Map(products.map(p => [p, centsIn(productRow(all, p), AMOUNT)]))

        const one = await filterToProducts(page, [book.service])
        expect(topLabels(one)).toEqual([book.service])
        expect(centsIn(one.at(-1), AMOUNT)).toBe(amounts.get(book.service))
        await expect(page.getByTestId('report-header-param-products')).toHaveText(
            `Product: ${book.service}`
        )

        await page.getByTestId('report-param-products').click()
        const picker = page.getByTestId('report-filter-picker')
        await expect(picker).toBeVisible()
        await expect(picker.getByTestId('report-filter-group-service')).toContainText(
            'All Service items'
        )
        await expect(picker.getByTestId('report-filter-group-non_inventory')).toContainText(
            'All Non-inventory items'
        )
        await expect(picker.getByTestId('report-filter-group-bundle')).toHaveCount(0)
        expect(SEEDED_BUNDLES.length).toBeGreaterThan(0)
        for (const bundle of SEEDED_BUNDLES) {
            await picker.getByTestId('report-filter-search').fill(bundle)
            await expect(picker.getByTestId('report-filter-no-matches')).toBeVisible()
        }
        await page.keyboard.press('Escape')
        await expect(picker).toBeHidden()

        await page.getByTestId('report-filter-remove-products').click()
        await expect(page.getByTestId('report-param-products')).toHaveCount(0)
        await filterSettled(
            page,
            rows => sameSet(topLabels(rows), products),
            'the three products back after the Product filter is removed'
        )
        const byAmount = [...products].sort((a, b) => (amounts.get(b) ?? 0) - (amounts.get(a) ?? 0))
        const byName = [...products].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
        expect(byAmount).not.toEqual(byName)
        await chooseSalesOrder(page, 'sales')
        await filterSettled(
            page,
            rows => JSON.stringify(topLabels(rows)) === JSON.stringify(byAmount),
            'the products in Amount order, largest first'
        )
        await chooseSalesOrder(page, 'name')
        await filterSettled(
            page,
            rows => JSON.stringify(topLabels(rows)) === JSON.stringify(byName),
            'the products in name order'
        )

        // The seeded sale of an inactive product (plan D4), in a period that holds it.
        await page.getByTestId('report-filter-remove-customers').click()
        await expect(page.getByTestId('report-param-customers')).toHaveCount(0)
        await choosePeriod(page, { from: SEEDED_PERIOD.from, to: SEEDED_PERIOD.to })
        await expect(page.getByTestId('report-document-period')).toHaveText(SEEDED_PERIOD.words)
        expect(FAX_SETUP, 'Fax line setup in the product fixture').not.toBe('')
        const inactiveLabel = `${FAX_SETUP} (inactive)`
        const fax = await filterSalesTo(page, 'products', [{ label: FAX_SETUP }], rows =>
            onlyTopRow(rows, inactiveLabel)
        )
        const faxRow = productRow(fax, inactiveLabel)
        const total = fax.at(-1)
        if (!faxRow || !total) throw new Error(`no mounted row "${inactiveLabel}" and Total`)
        const colors = await rowColors(page, faxRow.id, 'amount')
        const totalColors = await rowColors(page, total.id, 'amount')
        expect(colors.label).not.toBe('')
        expect(colors.label).toBe(colors.figure)
        expect(colors.label).not.toBe(totalColors.label)

        // Empty: a period with no posted sale line shows core's empty text and no row.
        await choosePeriod(page, { from: '2020-01-01', to: '2020-12-31' })
        await expect(page.getByTestId('report-empty')).toContainText(
            'No rows for January 1 – December 31, 2020'
        )
        await expect(page.locator('[data-testid^="report-row-"]')).toHaveCount(0)
    })
})

// The list entries and the phone (sales-reports checkpoint 3).

const SALES_COLUMNS = ['sales', 'pct'] as const
const PRODUCT_COLUMNS = ['quantity', 'amount', 'pct', 'avg'] as const
// Spec §3 "Phone": Sales by Customer puts the name on line 1 and Sales and % of sales on
// line 2; Sales by Product/Service puts Quantity and Amount on line 2, % of sales and Avg
// price on line 3.
const CUSTOMER_PHONE_LINES = [['sales', 'pct']] as const
const PRODUCT_PHONE_LINES = [
    ['quantity', 'amount'],
    ['pct', 'avg'],
] as const
// Lesson 32: CI's 390 viewport leaves a 375 px row; the two widths wrap differently.
const PHONE_375 = { width: 375, height: 812 }

// The seeded long-named family (St. Jude) and its sub-customer the gala, which holds the
// seeded posted invoice (customer-balance-fixture.ts), and the seeded long-named product,
// on the seeded posted invoice 1004 of 2026-10-21 (invoice-form-fixture.ts).
const ST_JUDE = CUSTOMERS.find(customer => customer.id === CUSTOMER_IDS.stJude)
const ST_JUDE_GALA = CUSTOMERS.find(
    customer => customer.id === CUSTOMER_BALANCE_SEED.galaInvoice.customer
)
const NETWORK_VISIT = PRODUCTS.find(product => product.id === PRODUCT_IDS.networkVisit)

// A reports list answer of the given rows, as PocketBase pages it: the asked page at the
// asked page size, so the SDK's full-list read stops after the last page.
function reportRows(items: readonly Record<string, string>[], url: URL) {
    const page = Math.max(Number(url.searchParams.get('page') ?? '1') || 1, 1)
    const perPage = Math.max(Number(url.searchParams.get('perPage') ?? '30') || 30, 1)
    const start = (page - 1) * perPage
    return JSON.stringify({
        page,
        perPage,
        totalItems: items.length,
        totalPages: Math.ceil(items.length / perPage),
        items: items.slice(start, start + perPage),
    })
}

/**
 * A fresh page of the same context, for a Books reader, whose reports list read answers
 * only the rows of `rows` whose shipped key the read asks for: realtime is cut first
 * (fakeReadOnlyAccess), so no row arrives by another path. Returns the page and the
 * filters of the reads that were answered (a filter is added only after its answer was
 * sent to the page).
 */
async function freshPageWithReports(
    page: Page,
    rows: readonly { id: string; shipped_key: string; title: string }[]
) {
    const fresh = await page.context().newPage()
    const answered: string[] = []
    await fakeReadOnlyAccess(fresh)
    await fresh.route('**/api/collections/reports/records**', async route => {
        const url = new URL(route.request().url())
        const filter = url.searchParams.get('filter') ?? ''
        const items = rows
            .filter(row => filter.includes(row.shipped_key))
            .map(row => ({ ...row, collectionName: 'reports' }))
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: reportRows(items, url),
        })
        answered.push(filter)
    })
    return { fresh, answered }
}

// The number of elements in the row of the list header's title: the title alone when the
// header draws no button group.
function titleRowChildren(page: Page, titleTestId: string): Promise<number> {
    return page
        .getByTestId(titleTestId)
        .filter({ visible: true })
        .evaluate(title => title.parentElement?.children.length ?? -1)
}

// The visible report's document title.
function shownReportTitle(page: Page) {
    return page.getByTestId('report-document-title').filter({ visible: true })
}

test.describe('sales-reports: entry points and phone', () => {
    test("the Customers list's Reports menu opens both reports, for a reader too", async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await openBooks(page, DESKTOP)
        await openCustomersList(page)
        const button = page.getByTestId('customers-reports')
        await expect(button).toHaveText('Reports')
        await expect(page.getByTestId('customer-new-header')).toHaveCount(0)
        const items = page.locator('[data-testid^="customers-reports-"]').filter({ visible: true })

        await button.click()
        await expect(items).toHaveText(['Customer Balance', 'Sales by Customer'])
        await page.getByTestId('customers-reports-sales').click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(shownReportTitle(page)).toHaveText(SALES_BY_CUSTOMER_TITLE)

        await page.goBack()
        await expect(page.getByTestId('customers-title').filter({ visible: true })).toBeVisible()
        await button.click()
        await expect(items).toHaveText(['Customer Balance', 'Sales by Customer'])
        await page.getByTestId('customers-reports-balance').click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(shownReportTitle(page)).toHaveText(CUSTOMER_BALANCE_TITLE)

        // Only the Customer Balance is found: the menu holds only its item.
        const one = await freshPageWithReports(page, [
            {
                id: 'fakecbalance001',
                shipped_key: CUSTOMER_BALANCE_SHIPPED_KEY,
                title: CUSTOMER_BALANCE_TITLE,
            },
        ])
        await openBooks(one.fresh, DESKTOP)
        await openCustomersList(one.fresh)
        const oneButton = one.fresh.getByTestId('customers-reports')
        await expect(oneButton).toBeVisible()
        await oneButton.click()
        await expect(
            one.fresh.locator('[data-testid^="customers-reports-"]').filter({ visible: true })
        ).toHaveText(['Customer Balance'])
        await one.fresh.close()

        // No report is found: no menu, and no empty button group beside the title.
        const none = await freshPageWithReports(page, [])
        await openBooks(none.fresh, DESKTOP)
        await openCustomersList(none.fresh)
        await expect(none.fresh.getByTestId('customers-title')).toBeVisible()
        // The reads of both reports were answered with no row, and the list's own rows
        // show: `useShippedReportHref` also gives null while its read loads, so without
        // this the absent button below would prove nothing.
        await expect
            .poll(
                () =>
                    [CUSTOMER_BALANCE_SHIPPED_KEY, SALES_BY_CUSTOMER_SHIPPED_KEY].every(key =>
                        none.answered.some(filter => filter.includes(key))
                    ),
                'the Customers list got its answer for both shipped reports'
            )
            .toBe(true)
        await expect(customerEntries(none.fresh).first()).toBeVisible()
        await expect(none.fresh.getByTestId('customers-reports')).toHaveCount(0)
        await expect.poll(() => titleRowChildren(none.fresh, 'customers-title')).toBe(1)
    })

    test("the Products list's Sales report button opens the report for a reader, and hides with no report", async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await openBooks(page, DESKTOP)
        await openProductsList(page)
        const button = page.getByTestId('products-sales-report')
        await expect(button).toHaveText('Sales report')
        await expect(page.getByTestId('product-new-header')).toHaveCount(0)
        await button.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(shownReportTitle(page)).toHaveText(SALES_BY_PRODUCT_TITLE)

        const none = await freshPageWithReports(page, [])
        await openBooks(none.fresh, DESKTOP)
        await openProductsList(none.fresh)
        await expect(none.fresh.getByTestId('products-title')).toBeVisible()
        // The read was answered with no row, and the list's own rows show (see the
        // Customers test).
        await expect
            .poll(
                () => none.answered.some(filter => filter.includes(SALES_BY_PRODUCT_SHIPPED_KEY)),
                'the Products list got its answer for the shipped Sales by Product/Service'
            )
            .toBe(true)
        await expect(productEntries(none.fresh).first()).toBeVisible()
        await expect(none.fresh.getByTestId('products-sales-report')).toHaveCount(0)
        await expect.poll(() => titleRowChildren(none.fresh, 'products-title')).toBe(1)
    })

    // A phone run: the phone path is other code (each report's `mobile` arrangement, core's
    // phone row layout).
    test('on a 390 phone both reports keep their arrangements', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const book = await postSaleBook(page)
        const name = book.customer.name

        await openSalesByCustomer(page)
        const filtered = await filterToOwnCustomer(page, name)
        const own = customerRow(filtered, name)
        if (!own) throw new Error(`no mounted row "${name}"`)
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('toolbar-more-button')).toBeVisible()
        await expectSalesPhoneLines(page, own.id, CUSTOMER_PHONE_LINES)
        expect(shareOf(customerRow(await salesRows(page), name))).toBe('100.00%')
        await pressReportRow(page, own.id)
        const opened = await filterSettled(
            page,
            rows => linesUnder(rows, name).length === 4,
            `${name}'s four sale lines show`
        )
        const [firstLine] = linesUnder(opened, name)
        await expectSalesPhoneLines(page, firstLine.id, CUSTOMER_PHONE_LINES)
        await expectSalesRowsFit(page, SALES_COLUMNS)

        await page.setViewportSize(DESKTOP)
        await openSalesByProduct(page)
        const products = await filterProductsToCustomer(page, name, [
            book.service,
            book.goods,
            DISCOUNT_PRODUCT,
        ])
        const service = productRow(products, book.service)
        if (!service) throw new Error(`no mounted row "${book.service}"`)
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('toolbar-more-button')).toBeVisible()
        await expectSalesPhoneLines(page, service.id, PRODUCT_PHONE_LINES)
        await pressReportRow(page, service.id)
        const serviceLines = linesUnder(
            await filterSettled(
                page,
                rows => linesUnder(rows, book.service).length === 2,
                `${book.service}'s two sale lines show`
            ),
            book.service
        )
        for (const line of serviceLines) {
            await expectSalesPhoneLines(page, line.id, PRODUCT_PHONE_LINES)
        }
        await expectSalesRowsFit(page, PRODUCT_COLUMNS)
    })

    test('on a 375 phone the seeded long names wrap and no figure is cut', async ({ page }) => {
        if (!ST_JUDE || !ST_JUDE_GALA || !NETWORK_VISIT) {
            throw new Error('no St. Jude family or long-named product in the fixtures')
        }
        await openBooks(page, DESKTOP)
        await openSalesByCustomer(page)
        // A fixed period that holds the seeded sales, so the test does not hang on the day
        // it runs.
        await choosePeriod(page, { from: SEEDED_PERIOD.from, to: SEEDED_PERIOD.to })
        await expect(page.getByTestId('report-document-period')).toHaveText(SEEDED_PERIOD.words)
        await page.setViewportSize(PHONE_375)
        await expect(page.getByTestId('toolbar-more-button')).toBeVisible()
        await scrollToSalesRow(page, ST_JUDE.display_name)
        const gala = customerRow(await salesRows(page), ST_JUDE_GALA.display_name)
        if (!gala) throw new Error(`no mounted row "${ST_JUDE_GALA.display_name}"`)
        await expectSalesPhoneLines(page, gala.id, CUSTOMER_PHONE_LINES)
        await expectSalesRowsFit(page, SALES_COLUMNS)

        await page.setViewportSize(DESKTOP)
        await openSalesByProduct(page)
        await choosePeriod(page, { from: SEEDED_PERIOD.from, to: SEEDED_PERIOD.to })
        await expect(page.getByTestId('report-document-period')).toHaveText(SEEDED_PERIOD.words)
        await page.setViewportSize(PHONE_375)
        await expect(page.getByTestId('toolbar-more-button')).toBeVisible()
        const visitId = await scrollToSalesRow(page, NETWORK_VISIT.name)
        await expectSalesPhoneLines(page, visitId, PRODUCT_PHONE_LINES)
        await expectSalesRowsFit(page, PRODUCT_COLUMNS)
    })
})

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
