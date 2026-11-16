import { expect, type Page, test } from '@playwright/test'
import { chooseParamOption, hubRow, inStatement, waitForTableFit } from '@tinycld/core/e2e-helpers'
import {
    CUSTOMER_BALANCE_DESCRIPTION,
    CUSTOMER_BALANCE_SEED,
    CUSTOMER_BALANCE_TITLE,
} from '~/tinycld/books/lib/customer-balance-fixture'
import { CUSTOMER_IDS, CUSTOMERS } from '~/tinycld/books/lib/customer-form-fixture'
import { CUSTOMER_BALANCE_SHIPPED_KEY } from '~/tinycld/books/lib/shipped-reports'
import { DESKTOP } from './account-register-helpers'
import {
    browserToday,
    chooseAsOf,
    dayWords,
    drillPanel,
    expectedHeading,
    openBooksReports,
    type ReportSnapshot,
    reportLinesUnder,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import {
    centsOf,
    chooseBalanceOrder,
    chooseBalanceRows,
    customerBalanceCsv,
    expectBalanceRowsFit,
    filterToCustomers,
    openBalanceRow,
    openCustomerBalance,
    withoutLineRecords,
} from './customer-balance-helpers'
import {
    createCustomer,
    customerPageUrl,
    customerPath,
    field,
    openBooks,
    openCustomer,
    openCustomersList,
    uniqueName,
} from './customer-form-helpers'
import { INVOICE_URL } from './invoice-helpers'
import {
    customerWithInvoices,
    fillInvoice,
    localDay,
    openNewPayment,
    PAYMENT_URL,
    pickPaymentCustomer,
    postInvoice,
    rowAmount,
} from './receive-payment-helpers'
import { WIDE } from './record-form-helpers'
import { fakeReadOnlyAccess } from './tax-rates-helpers'

// The Customer Balance (customer-balance checkpoint 1): the shipped report from the Books
// hub, a customer the test creates read against its page's Open figure, a family made by a
// sub-customer, With activity, and the seeded edges (plan D2). Each test creates its own
// customers with unique names and posts its invoices today, so it asserts exact figures only
// for its own customers and for the seeded rows no other spec posts to; the Total is read
// only as a relation inside one CSV. Core's table mounts only the rows near the viewport, so
// every row read goes through the report's CSV.

// From the open customer's page: New transaction → Invoice, for that customer.
async function startInvoice(page: Page, customerId: string) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId('customer-new-invoice').click()
    await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?customer=${customerId}$`))
}

function openCustomerId(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

// A record's balance in cents, null for a blank cell (a family header).
function balanceOf(record: readonly string[] | undefined): number | null {
    const text = record?.[1] ?? ''
    return text === '' ? null : centsOf(text)
}

function isTotalLine(label: string) {
    return label === 'Total' || label.startsWith('Total ')
}

// A mounted row's Balance in cents; null when the row shows no figure.
function rowCents(row: ReportSnapshot['rows'][number] | undefined): number | null {
    const text = row?.cells.balance ?? ''
    return text === '' ? null : centsOf(text)
}

// The rows of one snapshot as [kind, label, balance in cents].
function rowsOf(snapshot: ReportSnapshot): [string, string, number | null][] {
    return snapshot.rows.map(row => [row.kind, row.label, rowCents(row)])
}

// The width core fitted the report's own table to, once the fit has settled.
async function fittedTableWidth(page: Page): Promise<number> {
    await waitForTableFit(page)
    return Number(await inStatement(page, 'report-table').getAttribute('data-fit-width'))
}

// The seeded sub-customers of Harborview Hospitality Group (seed.ts reads CUSTOMERS).
const HARBORVIEW = CUSTOMERS.find(customer => customer.id === CUSTOMER_IDS.harborview)
const HARBORVIEW_SUBS = CUSTOMERS.filter(customer => customer.parent === CUSTOMER_IDS.harborview)

// The seeded long-named family (plan D2): the parent's name wraps on a phone, and its
// sub-customer the gala holds the seeded invoice with the long memo.
const ST_JUDE = CUSTOMERS.find(customer => customer.id === CUSTOMER_IDS.stJude)
const ST_JUDE_GALA = CUSTOMERS.find(
    customer => customer.id === CUSTOMER_BALANCE_SEED.galaInvoice.customer
)

// An empty answer to the reports list read: the reader has no shipped report to open.
function noReportRows() {
    return JSON.stringify({ page: 1, perPage: 0, totalItems: 0, totalPages: 0, items: [] })
}

/**
 * Spec §3 "Phone" at `size`: at the default viewport, the report narrowed to the whole
 * St. Jude family; then at the phone size every row's label and Balance share a line band,
 * the long parent name wraps to two or three lines, the gala opens into its transaction,
 * whose long label is at most three lines with its Balance whole, and More holds Customize
 * and Export.
 */
async function expectPhoneFamilyFits(page: Page, size: { width: number; height: number }) {
    if (!ST_JUDE || !ST_JUDE_GALA) throw new Error('no St. Jude family in the customer fixture')
    const parent = ST_JUDE.display_name
    const gala = ST_JUDE_GALA.display_name
    await openBooks(page, DESKTOP)
    await openCustomerBalance(page)
    await chooseParamOption(page, 'customers', {
        from: 'add-filter',
        search: 'St. Jude',
        group: parent,
    })
    await expect(page.getByTestId('report-param-customers')).toHaveText(
        `Customer: All ${parent} sub-customers`
    )
    await snapshotWhen(
        page,
        reportSnapshot,
        s =>
            s.rows.some(row => row.kind === 'group' && row.label === parent) &&
            s.rows.some(row => row.kind === 'subtotal' && row.label === `Total ${parent}`) &&
            !s.rows.some(row => row.label === 'No customer'),
        `the ${parent} header row and its total`
    )

    await page.setViewportSize(size)
    // The phone toolbar: Customize is folded into "⋯".
    const more = page.getByTestId('toolbar-more-button')
    await expect(more).toBeVisible()
    await expect(page.getByTestId('report-customize-open')).toHaveCount(0)
    await expectBalanceRowsFit(page)

    await openBalanceRow(page, gala)
    const memo = CUSTOMER_BALANCE_SEED.galaInvoice.memo
    const opened = await reportSnapshot(page)
    const memoLine = reportLinesUnder(opened, gala).find(line => line.label.includes(memo))
    expect(memoLine, `a transaction of ${gala} labelled with the seeded memo`).toBeDefined()
    await expectBalanceRowsFit(page)

    await more.click()
    await expect(page.getByRole('menuitem', { name: 'Customize', exact: true })).toBeVisible()
    await expect(page.getByTestId('report-export-csv')).toHaveAttribute('role', 'menuitem')
}

test.describe('customer-balance: report', () => {
    test('opens from the Books hub as of today, and a day before every line is empty', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openBooksReports(page)
        const title = CUSTOMER_BALANCE_TITLE
        const row = hubRow(page, title).filter({
            has: page.getByText(title, { exact: true }),
        })
        await expect(row).toBeVisible()
        await expect(row).toContainText(CUSTOMER_BALANCE_DESCRIPTION)
        await row.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()

        await expect(page.getByTestId('report-param-asOf')).toContainText('Today')
        await expect(page.getByTestId('report-param-rows')).toContainText('Non-zero')
        const today = await browserToday(page)
        await expect(page.getByTestId('report-document-period')).toHaveText(
            `As of ${dayWords(today)}`
        )
        await expect
            .poll(async () => {
                const snapshot = await reportSnapshot(page)
                const expected = await expectedHeading(page)
                return { matches: snapshot.business === expected && expected !== '', expected }
            })
            .toMatchObject({ matches: true })
        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '' && Object.keys(s.headings).length > 0,
            'the report header and its column headings'
        )
        expect(snapshot.title).toBe(title)
        expect(snapshot.headings).toEqual({ name: 'Customer', balance: 'Balance' })

        // The seeded book's first Accounts receivable line is dated 2024-08-15.
        await chooseAsOf(page, { day: '2020-01-01' })
        await expect(page.getByTestId('report-empty')).toContainText(
            `No rows as of ${dayWords('2020-01-01')}`
        )
        await expect(page.locator('[data-testid^="report-row-g:"]')).toHaveCount(0)
    })

    test("a new customer's balance is its page's Open figure, on one row", async ({ page }) => {
        await openBooks(page, DESKTOP)
        const dueDate = await localDay(page, 30)
        const { name } = await customerWithInvoices(page, [{ rate: '1250.00', dueDate }])
        const open = page.getByTestId('customer-balance-open')
        await expect(open).toHaveText('$1,250.00')
        const openCents = centsOf(await open.innerText())

        await openCustomerBalance(page)
        const records = await customerBalanceCsv(page)
        const first = records.find(record => record[0] === name)
        expect(first, `a CSV record labelled ${name}`).toBeDefined()
        // The first record with the name carries the figure: no family header before it.
        expect(balanceOf(first)).toBe(125000)
        expect(balanceOf(first)).toBe(openCents)
        expect(withoutLineRecords(records).filter(record => record[0] === name)).toEqual([first])
        expect(records.filter(record => record[0] === `Total ${name}`)).toEqual([])
    })

    test('a sub-customer turns its parent into a family with a total', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const dueDate = await localDay(page, 30)
        const { name: parent } = await customerWithInvoices(page, [{ rate: '300.00', dueDate }])

        const sub = uniqueName('Branch')
        await page.getByTestId('customer-more').click()
        await page.getByTestId('customer-more-add-sub').click()
        await field(page, 'display_name').fill(sub)
        await page.getByTestId('customer-save').click()
        await expect(page).toHaveURL(customerPageUrl)
        await expect(page.getByTestId('customer-title')).toHaveText(sub)
        const subId = openCustomerId(page)
        await expect(page).toHaveURL(customerPath(subId))
        await startInvoice(page, subId)
        await fillInvoice(page, { dueDate, rate: '200.00' })
        await postInvoice(page)

        await openCustomerBalance(page)
        const records = withoutLineRecords(await customerBalanceCsv(page))
        const start = records.findIndex(record => record[0] === parent)
        expect(start, `a CSV record labelled ${parent}`).toBeGreaterThanOrEqual(0)
        const family = records.slice(start, start + 4).map(record => [record[0], balanceOf(record)])
        expect(family).toEqual([
            [parent, null],
            [parent, 30000],
            [sub, 20000],
            [`Total ${parent}`, 50000],
        ])
    })

    test('With activity shows a customer whose voided invoice nets to zero', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const dueDate = await localDay(page, 30)
        const name = uniqueName('Voided')
        await createCustomer(page, { name })
        await startInvoice(page, openCustomerId(page))
        await fillInvoice(page, { dueDate, rate: '75.00' })
        await postInvoice(page)
        await page.getByTestId('invoice-read-void').click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('invoice-badge')).toHaveText('Void')

        await openCustomerBalance(page)
        const nonzero = await customerBalanceCsv(page)
        expect(nonzero.filter(record => record[0] === name)).toEqual([])

        await chooseBalanceRows(page, 'activity')
        const activity = await customerBalanceCsv(page)
        const row = activity.find(record => record[0] === name)
        expect(row, `a CSV record labelled ${name} under With activity`).toBeDefined()
        expect(balanceOf(row)).toBe(0)
    })

    test('the seeded book shows an inactive customer, No customer last, and the Total', async ({
        page,
    }) => {
        const oldMill = CUSTOMERS.find(customer => customer.id === CUSTOMER_IDS.oldMill)
        if (!oldMill) throw new Error('no Old Mill Bakery in the customer fixture')
        await openBooks(page, DESKTOP)
        await openCustomerBalance(page)
        const records = withoutLineRecords(await customerBalanceCsv(page))
        const labels = records.map(record => record[0] ?? '')

        const inactive = records.find(record => record[0] === `${oldMill.display_name} (inactive)`)
        expect(inactive, `a CSV record "${oldMill.display_name} (inactive)"`).toBeDefined()
        expect(balanceOf(inactive)).toBe(CUSTOMER_BALANCE_SEED.inactiveEntry.cents)

        expect(labels.at(-1)).toBe('Total')
        expect(labels.filter(label => label === 'No customer')).toEqual(['No customer'])
        expect(labels.indexOf('No customer')).toBe(labels.length - 2)

        const total = balanceOf(records.at(-1))
        const rows = records.filter(
            record => !isTotalLine(record[0] ?? '') && balanceOf(record) !== null
        )
        const sum = rows.reduce((acc, record) => acc + (balanceOf(record) ?? 0), 0)
        expect(total).toBe(sum)
    })

    test('a customer opens into its transactions, and a transaction opens its document', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const dueDate = await localDay(page, 30)
        const { name, invoices } = await customerWithInvoices(page, [{ rate: '640.00', dueDate }])
        const [invoice] = invoices
        const today = await browserToday(page)

        await openCustomerBalance(page)
        await filterToCustomers(page, [name])
        expect(rowsOf(await reportSnapshot(page))).toEqual([
            ['group', name, 64000],
            ['total', 'Total', 64000],
        ])
        await expect(page.getByTestId('report-param-customers')).toHaveText(`Customer: ${name}`)

        await openBalanceRow(page, name)
        const lines = reportLinesUnder(await reportSnapshot(page), name)
        expect(lines.map(line => [line.kind, rowCents(line)])).toEqual([['detail', 64000]])
        const [line] = lines
        expect(line.label).toMatch(new RegExp(`^${today} · Invoice ${invoice.number}(?!\\d)`))

        const reportUrl = page.url()
        const lineRow = page.getByTestId(`report-row-${line.id}`)
        const invoicePath = new RegExp(`/books/invoices/${invoice.id}$`)
        await lineRow.click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page).toHaveURL(invoicePath)
        await expect(page.getByTestId('invoice-title')).toHaveText(`Invoice ${invoice.number}`)

        await page.goBack()
        await expect(page).toHaveURL(reportUrl)
        // Core keeps a report's open groups for the session (report-ui-store), and Back is a
        // same-document popstate, so the customer row is still open with its line.
        await snapshotWhen(
            page,
            reportSnapshot,
            snapshot => reportLinesUnder(snapshot, name).some(row => row.id === line.id),
            `${name}'s row is still open with its invoice line after Back`
        )
        const desktopFit = await fittedTableWidth(page)
        await page.setViewportSize(WIDE)
        // The wide layout is drawn when the report's table has re-fitted to the wider window.
        await expect
            .poll(() => fittedTableWidth(page), {
                message: 'the report table re-fits to the wide window',
            })
            .toBeGreaterThan(desktopFit)
        // Spec §3 "Opening a transaction": beside the report only where Books registers a
        // report panel for the path (it registers none for invoices), else its own screen.
        await lineRow.click()
        await expect(page).toHaveURL(invoicePath)
        await expect(page.getByTestId('invoice-title')).toHaveText(`Invoice ${invoice.number}`)
        await expect(drillPanel(page)).toHaveCount(0)
    })

    test('a part payment lowers the balance in the open report', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const dueDate = await localDay(page, 30)
        const { name, invoices } = await customerWithInvoices(page, [{ rate: '900.00', dueDate }])
        const [invoice] = invoices

        const viewer = await page.context().newPage()
        await openBooks(viewer, DESKTOP)
        await openCustomerBalance(viewer)
        await filterToCustomers(viewer, [name])
        expect(rowsOf(await reportSnapshot(viewer))).toEqual([
            ['group', name, 90000],
            ['total', 'Total', 90000],
        ])

        await openNewPayment(page)
        await pickPaymentCustomer(page, name)
        await rowAmount(page, invoice.id).fill('350.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('350.00')
        await page.getByTestId('payment-post').click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-read-only')).toBeVisible()

        const live = await snapshotWhen(
            viewer,
            reportSnapshot,
            snapshot => rowCents(snapshot.rows.find(row => row.label === name)) === 55000,
            `${name} reads 550.00 in the open report with no action on it`
        )
        expect(rowsOf(live)).toEqual([
            ['group', name, 55000],
            ['total', 'Total', 55000],
        ])
    })

    test('Largest balance orders the rows', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const dueDate = await localDay(page, 30)
        const one = await customerWithInvoices(page, [{ rate: '100.00', dueDate }])
        const two = await customerWithInvoices(page, [{ rate: '100.00', dueDate }])
        const [first, second] = [one, two].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        )
        // customerWithInvoices leaves the page on the customer it made last.
        if (second.customerId !== two.customerId) await openCustomer(page, second.name)
        await expect(page).toHaveURL(customerPath(second.customerId))
        await page.getByTestId('customer-new-transaction').click()
        await page.getByTestId('customer-new-invoice').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/invoices/new\\?customer=${second.customerId}$`)
        )
        await fillInvoice(page, { dueDate, rate: '600.00' })
        await postInvoice(page)

        await openCustomerBalance(page)
        await filterToCustomers(page, [first.name, second.name])
        expect(rowsOf(await reportSnapshot(page))).toEqual([
            ['group', first.name, 10000],
            ['group', second.name, 70000],
            ['total', 'Total', 80000],
        ])

        await chooseBalanceOrder(page, 'balance')
        const byBalance = await snapshotWhen(
            page,
            reportSnapshot,
            snapshot => snapshot.rows[0]?.label === second.name,
            `${second.name} (700.00) is the first row under Largest balance`
        )
        expect(rowsOf(byBalance)).toEqual([
            ['group', second.name, 70000],
            ['group', first.name, 10000],
            ['total', 'Total', 80000],
        ])
    })

    test('a whole-group pick keeps the sub-customers', async ({ page }) => {
        if (!HARBORVIEW) throw new Error('no Harborview Hospitality Group in the customer fixture')
        const parent = HARBORVIEW.display_name
        const pick = `All ${parent} sub-customers`
        const subNames = HARBORVIEW_SUBS.map(customer => customer.display_name)
        await openBooks(page, DESKTOP)
        await openCustomerBalance(page)
        await chooseParamOption(page, 'customers', {
            from: 'add-filter',
            search: 'Harborview',
            group: parent,
        })
        await expect(page.getByTestId('report-param-customers')).toHaveText(`Customer: ${pick}`)

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s =>
                s.rows.some(row => row.kind === 'subtotal' && row.label === `Total ${parent}`) &&
                s.rows.at(-1)?.kind === 'total' &&
                !s.rows.some(row => row.label === 'No customer'),
            `the rows of ${pick} only`
        )
        const rows = snapshot.rows
        expect([rows[0]?.kind, rows[0]?.label, rows[0]?.depth]).toEqual(['group', parent, 0])
        expect([rows.at(-2)?.kind, rows.at(-2)?.label]).toEqual(['subtotal', `Total ${parent}`])
        expect([rows.at(-1)?.kind, rows.at(-1)?.label]).toEqual(['total', 'Total'])
        const members = rows.slice(1, -2)
        expect(members.map(row => row.label)).toContain('Harborview Kitchen')
        for (const member of members) {
            expect([member.kind, member.depth]).toEqual(['group', 1])
            expect(subNames).toContain(member.label)
        }
        expect(members.map(row => row.label)).not.toContain(parent)
        expect(rows.map(row => row.label)).not.toContain('No customer')

        const kitchen = members.find(row => row.label === 'Harborview Kitchen')
        expect(rowCents(kitchen)).toBeGreaterThanOrEqual(CUSTOMER_BALANCE_SEED.kitchenInvoice.cents)
        const sum = members.reduce((acc, row) => acc + (rowCents(row) ?? 0), 0)
        expect(rowCents(rows.at(-2))).toBe(sum)
    })

    test('the Customers list opens the report, and hides the button with no report', async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await openBooks(page, DESKTOP)
        await openCustomersList(page)
        const button = page.getByTestId('customers-balance-report')
        await expect(button).toHaveText('Balance report')
        await expect(page.getByTestId('customer-new-header')).toHaveCount(0)
        await button.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '',
            'the report title'
        )
        expect(snapshot.title).toBe(CUSTOMER_BALANCE_TITLE)

        // A fresh page whose reports list read answers no row, so it has no shipped report
        // to open. Realtime is cut first, so no row arrives by another path.
        const fresh = await page.context().newPage()
        const asked: string[] = []
        await fresh.route('**/api/realtime*', route => route.abort())
        await fresh.route('**/api/collections/reports/records**', route => {
            asked.push(new URL(route.request().url()).searchParams.get('filter') ?? '')
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: noReportRows(),
            })
        })
        await openBooks(fresh, DESKTOP)
        await openCustomersList(fresh)
        await expect(fresh.getByTestId('customers-title')).toBeVisible()
        // The list asked for the shipped report and got none: without this the absent
        // button below would prove nothing.
        await expect
            .poll(
                () => asked.some(filter => filter.includes(CUSTOMER_BALANCE_SHIPPED_KEY)),
                'the Customers list asks for the shipped Customer Balance'
            )
            .toBe(true)
        await expect(fresh.getByTestId('customers-balance-report')).toHaveCount(0)
    })

    // A phone run: the report's phone path is other code (core's phone row layout from the
    // `display` block, the toolbar's More).
    test('on a 390 phone the family and an opened customer fit their rows', async ({ page }) => {
        await expectPhoneFamilyFits(page, { width: 390, height: 844 })
    })

    // Lesson 32: CI's 390 viewport leaves a 375 px row; the two widths wrap differently.
    test('on a 375 phone the family and an opened customer fit their rows', async ({ page }) => {
        await expectPhoneFamilyFits(page, { width: 375, height: 812 })
    })
})
