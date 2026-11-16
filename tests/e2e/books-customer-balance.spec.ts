import { expect, type Page, test } from '@playwright/test'
import { hubRow } from '@tinycld/core/e2e-helpers'
import {
    CUSTOMER_BALANCE_DESCRIPTION,
    CUSTOMER_BALANCE_SEED,
    CUSTOMER_BALANCE_TITLE,
} from '~/tinycld/books/lib/customer-balance-fixture'
import { CUSTOMER_IDS, CUSTOMERS } from '~/tinycld/books/lib/customer-form-fixture'
import { DESKTOP } from './account-register-helpers'
import {
    browserToday,
    chooseAsOf,
    dayWords,
    expectedHeading,
    openBooksReports,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import {
    centsOf,
    chooseBalanceRows,
    customerBalanceCsv,
    openCustomerBalance,
    withoutLineRecords,
} from './customer-balance-helpers'
import {
    createCustomer,
    customerPageUrl,
    customerPath,
    field,
    openBooks,
    uniqueName,
} from './customer-form-helpers'
import { customerWithInvoices, fillInvoice, localDay, postInvoice } from './receive-payment-helpers'

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
})
