import { expect, type Page, test } from '@playwright/test'
import { hubRow } from '@tinycld/core/e2e-helpers'
import {
    AR_AGING_DESCRIPTION,
    AR_AGING_EMPTY_DAY,
    AR_AGING_TITLE,
} from '~/tinycld/books/lib/ar-aging-fixture'
import { CUSTOMER_BALANCE_TITLE } from '~/tinycld/books/lib/customer-balance-fixture'
import {
    AR_AGING_SHIPPED_KEY,
    CUSTOMER_BALANCE_SHIPPED_KEY,
} from '~/tinycld/books/lib/shipped-reports'
import { DESKTOP, PHONE } from './account-register-helpers'
import {
    type AgedCents,
    AR_DAY,
    agedCents,
    agingRow,
    expectAgingLinesFit,
    freshPageWithReports,
    openAgingRow,
    openArAging,
} from './ar-aging-helpers'
import {
    browserToday,
    chooseAsOf,
    dayWords,
    expectedHeading,
    expectTableFits,
    openBooksReports,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { chooseBalanceOrder, filterToCustomers } from './customer-balance-helpers'
import { openCustomersList } from './customer-form-helpers'
import { INVOICE_URL } from './invoice-helpers'
import {
    customerWithInvoices,
    openNewPayment,
    PAYMENT_URL,
    paymentIdFromUrl,
    pickPaymentCustomer,
    rowAmount,
} from './receive-payment-helpers'
import { openBooks } from './record-form-helpers'
import { expectRecordUrl } from './record-key-helpers'
import { fakeReadOnlyAccess } from './tax-rates-helpers'

// The A/R Aging (ar-aging checkpoint 2): the shipped report from the Books hub, and the
// customers each test creates through the UI with invoices dated AR_DAY.invoice, read with
// the report filtered to them and As of set to fixed days, so every exact figure is the
// test's own. Core's table mounts only the rows near the viewport; the filtered report is
// a few rows, read in one snapshot.

type SnapshotRow = ReportSnapshot['rows'][number]

const NO_MONEY: AgedCents = {
    current: null,
    d30: null,
    d60: null,
    d90: null,
    d91: null,
    total: null,
}

function aged(figures: Partial<AgedCents>): AgedCents {
    return { ...NO_MONEY, ...figures }
}

// The rows one depth below the row labelled `label`, until the next row at its depth or above.
function rowsUnder(snapshot: ReportSnapshot, label: string): SnapshotRow[] {
    const parent = agingRow(snapshot, label)
    const at = snapshot.rows.indexOf(parent)
    const out: SnapshotRow[] = []
    for (const row of snapshot.rows.slice(at + 1)) {
        if (row.depth <= parent.depth) break
        if (row.depth === parent.depth + 1) out.push(row)
    }
    return out
}

function totalRow(snapshot: ReportSnapshot): SnapshotRow | undefined {
    return snapshot.rows.find(row => row.kind === 'total')
}

// The day a Due date cell names, as YYYY-MM-DD: an ISO day as it is, any other date text
// through `new Date` in this process's zone.
function dayOf(text: string | undefined): string {
    const value = (text ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error(`not a day: "${value}"`)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// The number in a payment read view's title, "Payment <n>".
async function paymentNumber(page: Page): Promise<string> {
    const title = page.getByTestId('payment-title')
    await expect(title).toHaveText(/^Payment \d+$/)
    const number = /^Payment (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the payment read view title has no number')
    return number
}

// The distinct tops (rounded) of the row with id `rowId`: its label and every cell.
function rowTops(page: Page, rowId: string): Promise<number[]> {
    return page.evaluate(id => {
        const table = document.querySelector('[data-testid="report-table"]')
        const parts = [...(table?.querySelectorAll('[data-testid]') ?? [])].filter(element => {
            const testId = element.getAttribute('data-testid') ?? ''
            return (
                testId === `report-row-${id}` ||
                (testId.startsWith('report-cell-') && testId.endsWith(`-${id}`))
            )
        })
        const tops = parts
            .map(element => element.getBoundingClientRect())
            .filter(box => box.width > 0 && box.height > 0)
            .map(box => Math.round(box.top))
        return [...new Set(tops)]
    }, rowId)
}

test.describe('ar-aging: report', () => {
    test('opens from the Books hub as of today, and a day before every line is empty', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openBooksReports(page)
        await expect(
            hubRow(page, AR_AGING_TITLE).filter({
                has: page.getByText(AR_AGING_TITLE, { exact: true }),
            })
        ).toContainText(AR_AGING_DESCRIPTION)
        await openArAging(page)

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '',
            'the report header'
        )
        expect(snapshot.title).toBe(AR_AGING_TITLE)
        await expect
            .poll(async () => {
                const expected = await expectedHeading(page)
                return expected !== '' && (await reportSnapshot(page)).business === expected
            })
            .toBe(true)
        const today = await browserToday(page)
        await expect(page.getByTestId('report-document-period')).toHaveText(
            `As of ${dayWords(today)}`
        )
        await expect(page.getByTestId('report-param-asOf')).toContainText('Today')

        await chooseAsOf(page, { day: AR_AGING_EMPTY_DAY })
        await expect(page.getByTestId('report-empty')).toContainText(
            `No rows as of ${dayWords(AR_AGING_EMPTY_DAY)}`
        )
        await expect(page.locator('[data-testid^="report-row-"]')).toHaveCount(0)
    })

    test('an invoice moves through the age columns with the As of day', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { name } = await customerWithInvoices(page, [
            { rate: '1250.00', date: AR_DAY.invoice, dueDate: AR_DAY.due },
        ])
        await openArAging(page)
        await filterToCustomers(page, [name])

        const steps: [string, Partial<AgedCents>][] = [
            [AR_DAY.aged40, { d60: 125000, total: 125000 }],
            [AR_DAY.aged1, { d30: 125000, total: 125000 }],
            [AR_DAY.due, { current: 125000, total: 125000 }],
        ]
        for (const [day, figures] of steps) {
            await chooseAsOf(page, { day })
            const want = aged(figures)
            const snapshot = await snapshotWhen(
                page,
                reportSnapshot,
                s => s.rows.some(row => row.label === name && agedCents(row).total !== null),
                `${name}'s row as of ${day}`
            )
            expect(agedCents(agingRow(snapshot, name)), `${name} as of ${day}`).toEqual(want)
            const total = totalRow(snapshot)
            expect(total, `the Total as of ${day}`).toBeDefined()
            if (total) expect(agedCents(total), `the Total as of ${day}`).toEqual(want)
        }

        await chooseAsOf(page, { day: AR_DAY.beforeInvoice })
        await expect(page.getByTestId('report-empty')).toBeVisible()
        await expect(page.locator('[data-testid^="report-row-g:"]')).toHaveCount(0)
    })

    test('a customer opens into its items, an item into its lines, a line into its document', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '300.00', date: AR_DAY.invoice, dueDate: AR_DAY.due },
            { rate: '200.00', date: AR_DAY.invoice, dueDate: '2026-07-15' },
        ])
        const [later, older] = invoices
        await openArAging(page)
        await filterToCustomers(page, [name])
        await chooseAsOf(page, { day: AR_DAY.aged40 })
        // Ages 40 and 56: both in 31 - 60 only on this day.
        await snapshotWhen(
            page,
            reportSnapshot,
            s => s.rows.some(row => row.label === name && agedCents(row).d60 === 50000),
            `${name} reads 500.00 in 31 - 60 as of ${AR_DAY.aged40}`
        )

        await openAgingRow(page, name)
        const opened = await reportSnapshot(page)
        const items = rowsUnder(opened, name)
        expect(items.map(row => row.label)).toEqual([
            `Invoice ${older.number}`,
            `Invoice ${later.number}`,
        ])
        expect(items.map(row => agedCents(row).total)).toEqual([20000, 30000])
        expect(items.map(row => dayOf(row.cells.due))).toEqual(['2026-07-15', AR_DAY.due])
        expect(agingRow(opened, name).cells.due ?? '').toBe('')
        // A cut Due date ("Oct 27, 20…") keeps its whole text in the DOM, so the text
        // element's own overflow is read, not the cell's box.
        const itemIds = items.map(row => row.id)
        await expect
            .poll(
                () =>
                    page.evaluate(ids => {
                        // A row id holds quotes (g:["…","USD"]), so the test id is
                        // compared as a string, not put in a selector.
                        const dueCells = Array.from(
                            document.querySelectorAll('[data-testid^="report-cell-due-"]')
                        )
                        const overflows = ids.map(id => {
                            const cell = dueCells.find(
                                el => el.getAttribute('data-testid') === `report-cell-due-${id}`
                            )
                            const text = cell?.firstElementChild
                            if (!(text instanceof HTMLElement) || !text.textContent?.trim()) {
                                return Number.POSITIVE_INFINITY
                            }
                            return text.scrollWidth - text.clientWidth
                        })
                        return Math.max(...overflows)
                    }, itemIds),
                { message: 'the Due date text of each item row is not cut' }
            )
            .toBeLessThanOrEqual(0)

        const itemLabel = `Invoice ${older.number}`
        await openAgingRow(page, itemLabel)
        const lines = rowsUnder(await reportSnapshot(page), itemLabel)
        expect(lines.map(line => [line.kind, line.label, agedCents(line).total])).toEqual([
            ['detail', `${AR_DAY.invoice} · Invoice ${older.number}`, 20000],
        ])

        await page.getByTestId(`report-row-${lines[0].id}`).click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expectRecordUrl(page, 'invoices', older.id)
    })

    test('a part payment lowers the item in the open report', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '900.00', date: AR_DAY.invoice, dueDate: AR_DAY.due },
        ])
        const [invoice] = invoices
        const itemLabel = `Invoice ${invoice.number}`

        const viewer = await page.context().newPage()
        await openBooks(viewer, DESKTOP)
        await openArAging(viewer)
        await filterToCustomers(viewer, [name])
        await openAgingRow(viewer, name)
        const before = await reportSnapshot(viewer)
        expect(agedCents(agingRow(before, itemLabel)).total).toBe(90000)

        await openNewPayment(page)
        await pickPaymentCustomer(page, name)
        await rowAmount(page, invoice.id).fill('350.00')
        await expect(page.getByTestId('payment-amount')).toHaveValue('350.00')
        await page.getByTestId('payment-post').click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-read-only')).toBeVisible()
        const paymentId = await paymentIdFromUrl(page)
        const number = await paymentNumber(page)
        const today = await browserToday(page)

        const live = await snapshotWhen(
            viewer,
            reportSnapshot,
            s => s.rows.some(row => row.label === itemLabel && agedCents(row).total === 55000),
            `${itemLabel} reads 550.00 in the open report with no action on it`
        )
        expect(agedCents(agingRow(live, itemLabel)).total).toBe(55000)
        expect(agedCents(agingRow(live, name)).total).toBe(55000)

        await openAgingRow(viewer, itemLabel)
        const lines = rowsUnder(await reportSnapshot(viewer), itemLabel)
        expect(lines.map(line => [line.kind, line.label, agedCents(line).total])).toEqual([
            ['detail', `${AR_DAY.invoice} · Invoice ${invoice.number}`, 90000],
            ['detail', `${today} · Payment ${number}`, -35000],
        ])

        await viewer.getByTestId(`report-row-${lines[1].id}`).click()
        await expect(viewer).toHaveURL(PAYMENT_URL)
        await expectRecordUrl(viewer, 'payments', paymentId)
    })

    test('an overpayment shows as a negative item', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '200.00', date: AR_DAY.invoice, dueDate: AR_DAY.due },
        ])
        const [invoice] = invoices

        await openNewPayment(page)
        await pickPaymentCustomer(page, name)
        await page.getByTestId('payment-amount').fill('500.00')
        await expect(rowAmount(page, invoice.id)).toHaveValue('200.00')
        await expect(page.getByTestId('payment-to-credit')).toContainText('$300.00')
        await page.getByTestId('payment-post').click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(page.getByTestId('payment-read-only')).toBeVisible()
        const number = await paymentNumber(page)

        await openArAging(page)
        await filterToCustomers(page, [name])
        const snapshot = await reportSnapshot(page)
        expect(agedCents(agingRow(snapshot, name)).total).toBe(-30000)

        await openAgingRow(page, name)
        const items = rowsUnder(await reportSnapshot(page), name)
        expect(items.map(row => row.label)).toEqual([`Payment ${number}`])
        expect(agedCents(items[0])).toEqual(aged({ current: -30000, total: -30000 }))
        expect(items.filter(row => row.label.startsWith('Invoice'))).toEqual([])
    })

    test('the Customer filter names its picks, and Largest balance orders the rows', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const small = await customerWithInvoices(page, [
            { rate: '100.00', date: AR_DAY.invoice, dueDate: AR_DAY.due },
        ])
        const large = await customerWithInvoices(page, [
            { rate: '700.00', date: AR_DAY.invoice, dueDate: AR_DAY.due },
        ])
        const byName = [small.name, large.name].sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        )
        // uniqueName stamps the time, so the customer made first is first by name; the
        // balance order then differs from the name order.
        expect(byName).toEqual([small.name, large.name])

        await openArAging(page)
        await filterToCustomers(page, [small.name, large.name])
        const filtered = await reportSnapshot(page)
        const groups = (s: ReportSnapshot) =>
            s.rows.filter(row => row.kind === 'group').map(row => row.label)
        expect(groups(filtered)).toEqual(byName)
        expect(filtered.rows.some(row => row.label === 'No customer')).toBe(false)
        const filteredTotal = totalRow(filtered)
        expect(filteredTotal && agedCents(filteredTotal).total).toBe(80000)
        const header = page.getByTestId('report-header-param-customers')
        await expect(header).toContainText('Customer: ')
        await expect(header).toContainText(small.name)
        await expect(header).toContainText(large.name)

        await chooseBalanceOrder(page, 'balance')
        const byBalance = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.rows[0]?.label === large.name,
            `${large.name} (700.00) is the first row under Largest balance`
        )
        expect(groups(byBalance)).toEqual([large.name, small.name])
        const balanceTotal = totalRow(byBalance)
        expect(balanceTotal && agedCents(balanceTotal).total).toBe(80000)

        await page.setViewportSize({ width: 1024, height: 800 })
        const rowId = agingRow(byBalance, large.name).id
        await expect
            .poll(() => rowTops(page, rowId), {
                message: `${large.name}'s label and cells are on one line at 1024`,
            })
            .toHaveLength(1)
        await expectTableFits(page)
    })
})

const PHONE_375 = { width: 375, height: 812 }

// The phone flow of e2e 8 and 9: one customer with an invoice 40 days past due (31 - 60)
// and one not yet due (Current) on AR_DAY.aged40, the customer and the past-due invoice
// opened at the desktop width, then the phone arrangement read at `viewport`. The customer
// row then has a figure in Current, in 31 - 60 and in Total; the opened item has a Due
// date and its line. The customer's name is long enough to wrap to two lines at 375 and
// 390, so the "at most three lines" check reads a wrapped label.
const LONG_CUSTOMER = 'Willamette Valley Community Gardens Cooperative'

async function expectPhoneArrangement(
    page: Page,
    viewport: { width: number; height: number }
): Promise<void> {
    await openBooks(page, DESKTOP)
    const { name, invoices } = await customerWithInvoices(
        page,
        [
            { rate: '300.00', date: AR_DAY.invoice, dueDate: AR_DAY.due },
            { rate: '200.00', date: AR_DAY.invoice, dueDate: '2026-11-30' },
        ],
        LONG_CUSTOMER
    )
    const [pastDue] = invoices
    await openArAging(page)
    await filterToCustomers(page, [name])
    await chooseAsOf(page, { day: AR_DAY.aged40 })
    await snapshotWhen(
        page,
        reportSnapshot,
        s =>
            s.rows.some(
                row =>
                    row.label === name &&
                    agedCents(row).current === 20000 &&
                    agedCents(row).d60 === 30000 &&
                    agedCents(row).total === 50000
            ),
        `${name} reads 200.00 Current, 300.00 in 31 - 60 and 500.00 Total as of ${AR_DAY.aged40}`
    )
    await openAgingRow(page, name)
    await openAgingRow(page, `Invoice ${pastDue.number}`)

    await page.setViewportSize(viewport)
    // At a phone width the report toolbar moves its actions into More (lesson 13).
    await expect(page.getByTestId('toolbar-more-button')).toBeVisible()
    await expectAgingLinesFit(page, { wrappedLabel: name })
}

test.describe('ar-aging: entry points and narrow layouts', () => {
    test("the Customers list's Reports menu opens the report, and leaves the item out with no report", async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await openBooks(page, DESKTOP)
        await openCustomersList(page)
        await page.getByTestId('customers-reports').click()
        const aging = page.getByTestId('customers-reports-aging').filter({ visible: true })
        await expect(aging).toHaveText('A/R Aging')
        const itemIds = () =>
            page
                .locator('[data-testid^="customers-reports-"]')
                .filter({ visible: true })
                .evaluateAll(items => items.map(item => item.getAttribute('data-testid')))
        await expect
            .poll(itemIds, {
                message: 'A/R Aging stands between Customer Balance and Sales by Customer',
            })
            .toEqual([
                'customers-reports-balance',
                'customers-reports-aging',
                'customers-reports-sales',
            ])
        await aging.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(
            page.getByTestId('report-document-title').filter({ visible: true })
        ).toHaveText(AR_AGING_TITLE)

        // Core reopens Books at its last route, and the report is now on the Books route: a
        // new page would reopen on it, not on the list. Going back leaves the list as the
        // last route.
        await page.goBack()
        await openCustomersList(page)

        // Only the Customer Balance is found: after the A/R Aging read answered with no
        // row, the menu holds no A/R Aging item.
        const one = await freshPageWithReports(page, [
            {
                id: 'fakecbalance001',
                shipped_key: CUSTOMER_BALANCE_SHIPPED_KEY,
                title: CUSTOMER_BALANCE_TITLE,
            },
        ])
        await openBooks(one.fresh, DESKTOP)
        await openCustomersList(one.fresh)
        await expect
            .poll(() => one.answered.some(filter => filter.includes(AR_AGING_SHIPPED_KEY)), {
                message: 'the Customers list got its answer for the A/R Aging',
            })
            .toBe(true)
        await one.fresh.getByTestId('customers-reports').click()
        await expect(
            one.fresh.getByTestId('customers-reports-balance').filter({ visible: true })
        ).toHaveText('Customer Balance')
        await expect(one.fresh.getByTestId('customers-reports-aging')).toHaveCount(0)
        await one.fresh.close()
    })

    // Phone runs: the phone path is other code (core's wrapped row layout from
    // display.layouts, table-lines.ts rowLayout). 375 and 390 wrap differently (lesson 21).
    test('on a 390 phone each row keeps the phone arrangement, Total on the first figures line', async ({
        page,
    }) => {
        await expectPhoneArrangement(page, PHONE)
    })

    test('on a 375 phone each row keeps the phone arrangement, Total on the first figures line', async ({
        page,
    }) => {
        await expectPhoneArrangement(page, PHONE_375)
    })
})
