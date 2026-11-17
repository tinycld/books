import { expect, type Page, test } from '@playwright/test'
import { rangeWords } from '@tinycld/core/reports/lib/dates'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { TAX_IDS, TAX_RATE_ROWS } from '../../tinycld/books/lib/tax-rates-fixture'
import {
    browserToday,
    choosePeriod,
    csvRecords,
    exportReport,
    openReportAccount,
    openSalesTaxLiability,
} from './books-report-helpers'
import {
    CREDIT_MEMO_URL,
    creditMemoIdFromUrl,
    creditMemoUrlOf,
    pickCreditMemoLineProduct,
} from './credit-memo-helpers'
import {
    createCustomer,
    customerPath,
    DESKTOP,
    openBooks,
    openCustomer,
    PHONE,
    uniqueName,
} from './customer-form-helpers'
import { lineCellTestId, localToday, pickLineProduct, uniqueMemo } from './invoice-helpers'
import { nonTaxableService, postInvoice } from './receive-payment-helpers'

// Credit memos elsewhere in Books (credit memo spec §3.10): the customer page's
// Transactions tab (its Credit memos chip, rows, cards, statuses and empty text), the Open
// figure, the New transaction menu, and the Sales Tax Liability's credit memo row. Every
// test creates its own customers (unique names) and makes every invoice and memo through
// its form with a unique memo and today's date. No seeded row is changed.
//
// The Sales Tax Liability has no Customer filter (its params are Period, Method and
// Agency, server/report_sales_tax_liability.go): the test reads its own customer's rows,
// whose labels end in " · <customer>", from the report's CSV, where every group is open
// (memory p5-exports), and other workers' documents of today stay out of its sums.
//
// Not driven here: the Applied status (a posted memo with no credit left needs
// p2-apply-credit; pinned by the creditMemoStatus unit test and the gate-2 shot).

const CREDIT_MEMOS_URL = '**/api/collections/books_credit_memos/records*'
const REALTIME_URL = '**/api/realtime*'
const ROW_ID = /^customer-transaction-([a-z0-9]{15})$/
// U+2212, not the ASCII hyphen.
const CREDIT_250 = '−$250.00'
// A seeded rate's name, read from the rows seed.ts seeds (lesson 55).
function taxRateName(id: string) {
    const row = TAX_RATE_ROWS.find(r => r.id === id)
    if (!row) throw new Error(`no tax rate ${id} in the fixture`)
    return row.name
}

// The seeded single state rate: one component, so a document's tax shows under one rate.
const STATE_RATE = taxRateName(TAX_IDS.state)
const STATE_RATE_OPTION = new RegExp(`^${STATE_RATE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
const TALL = { width: DESKTOP.width, height: 2000 }

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

// A taxable seeded product.
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)

// The id of the customer whose page is open, read from the URL.
function openCustomerId(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

function transaction(page: Page, id: string) {
    return page.getByTestId(`customer-transaction-${id}`)
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

// A table row's cells keyed by their column heading (Date, Type, No., Due date, Total,
// Status), in one snapshot. The header's cells and the row's cells are in the same order.
function rowCells(page: Page, id: string): Promise<Record<string, string>> {
    return page.getByTestId('customer-transactions').evaluate((root, rowId) => {
        const header = root.querySelector('[data-testid="customer-transactions-header"]')
        const row = root.querySelector(`[data-testid="customer-transaction-${rowId}"]`)
        const out: Record<string, string> = {}
        const titles = [...(header?.children ?? [])].map(cell => (cell.textContent ?? '').trim())
        const cells = [...(row?.children ?? [])].map(cell => (cell.textContent ?? '').trim())
        titles.forEach((title, index) => {
            out[title] = cells[index] ?? ''
        })
        return out
    }, id)
}

// The open read view's number, from its title "Credit memo <n>".
async function memoNumberOf(page: Page) {
    const title = page.getByTestId('credit-memo-title')
    await expect(title).toHaveText(/^Credit memo \d+$/)
    const number = /^Credit memo (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('the read view title has no number')
    return number
}

// From the open customer page, the header's New transaction menu → one item.
async function startTransaction(page: Page, item: string, path: string, customerId: string) {
    await page.getByTestId('customer-new-transaction').click()
    await page.getByTestId(item).click()
    await expect(page).toHaveURL(new RegExp(`/books/${path}/new\\?customer=${customerId}$`))
}

// `openCustomer` ends on the Details tab: open the Transactions tab and wait for it.
async function openTransactionsTab(page: Page) {
    const tab = page.getByTestId('customer-tab-transactions')
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
}

// Back from a document to the customer page kept under it.
async function backToCustomer(page: Page, customerId: string) {
    await page.goBack()
    await expect(page).toHaveURL(customerPath(customerId))
    await expect(page.getByTestId('customer-transactions')).toBeVisible()
}

// From the open customer page, a new memo of one line of the seeded non-taxable service at
// `rate`, posted (leaves the read view) or saved as a draft (leaves the draft's form).
async function memoFromCustomer(
    page: Page,
    customerId: string,
    input: { rate: string; memo: string; action: 'post' | 'draft' }
): Promise<{ id: string; number: string }> {
    await startTransaction(page, 'customer-new-credit-memo', 'credit-memos', customerId)
    const rowId = await pickCreditMemoLineProduct(page, 0, nonTaxableService())
    await page.getByTestId(lineCellTestId(rowId, 'rate')).fill(input.rate)
    await page.getByTestId('form-input-memo').fill(input.memo)
    if (input.action === 'draft') {
        await page.getByTestId('credit-memo-save-draft').click()
        await expect(page).toHaveURL(CREDIT_MEMO_URL)
        await expect(page.getByTestId('credit-memo-title')).toHaveText('Draft credit memo')
        return { id: creditMemoIdFromUrl(page), number: '' }
    }
    await page.getByTestId('credit-memo-post').click()
    await expect(page).toHaveURL(CREDIT_MEMO_URL)
    await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
    const number = await memoNumberOf(page)
    return { id: creditMemoIdFromUrl(page), number }
}

// The open form's Tax → the seeded state rate.
async function chooseStateRate(page: Page) {
    await page.getByTestId('form-input-tax_rate').click()
    const option = page.getByRole('menuitem', { name: STATE_RATE_OPTION })
    await option.click()
    await expect(option).toHaveCount(0)
    await expect(page.getByTestId('form-input-tax_rate')).toContainText(STATE_RATE)
}

// A figure in cents: "1,000.00" → 100000; "-250.00", "−250.00" and "(250.00)" negative;
// 0 for an empty cell.
function cents(text: string | undefined): number {
    const value = (text ?? '').trim()
    if (value === '') return 0
    const isNegative = /^[-−(]/.test(value) || value.endsWith(')')
    const digits = value.replace(/[^0-9.]/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(digits)) throw new Error(`not an amount: "${text}"`)
    const [whole, fraction = ''] = digits.split('.')
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return isNegative ? -amount : amount
}

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type TaxRow = { label: string; gross: number; taxable: number; tax: number }

// The open report's rows of one customer's documents, read from its CSV (every group open).
async function customerTaxRows(page: Page, customer: string): Promise<TaxRow[]> {
    const [heading, ...records] = csvRecords((await exportReport(page, 'csv')).bytes)
    const column = (title: string) => {
        const index = heading.indexOf(title)
        if (index < 0) throw new Error(`no column "${title}" in ${heading.join(' | ')}`)
        return index
    }
    const gross = column('Gross total')
    const taxable = column('Taxable amount')
    const tax = column('Tax amount')
    return records
        .filter(record => (record[0] ?? '').trim().endsWith(` · ${customer}`))
        .map(record => ({
            label: record[0].trim(),
            gross: cents(record[gross]),
            taxable: cents(record[taxable]),
            tax: cents(record[tax]),
        }))
}

function oneRow(rows: TaxRow[], label: RegExp): TaxRow {
    const found = rows.filter(row => label.test(row.label))
    if (found.length !== 1) {
        throw new Error(
            `${found.length} rows match ${label} in ${rows.map(r => r.label).join(' | ')}`
        )
    }
    return found[0]
}

function sumOf(rows: TaxRow[], key: 'gross' | 'taxable' | 'tax') {
    return rows.reduce((sum, row) => sum + row[key], 0)
}

// Scrolls the report table, screen by screen, until a row holding `text` is mounted (the
// table is a FlashList), and returns it.
async function scrollToReportRow(page: Page, text: string) {
    const row = page.locator('[data-testid^="report-row-d:"]').filter({ hasText: text })
    for (let step = 0; step < 200; step++) {
        if ((await row.count()) > 0) return row.first()
        // Scrolls one screen, then waits two frames so the list mounts the rows in view.
        const moved = await page.getByTestId('report-table').evaluate(async table => {
            let list = table.querySelector('[data-testid^="report-row-"]')?.parentElement ?? null
            while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement
            if (!list) return false
            const before = list.scrollTop
            list.scrollTop = before + list.clientHeight * 0.8
            await new Promise(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
            return list.scrollTop !== before
        })
        if (!moved && (await row.count()) === 0) break
    }
    await expect(row.first(), `a report row holding "${text}"`).toBeVisible()
    return row.first()
}

test.describe('credit-memo-form: elsewhere in Books', () => {
    test("a customer's credit memos show on the Transactions tab", async ({ page }) => {
        await openBooks(page, DESKTOP)
        const prefix = uniqueName('Credit memo tab')
        const name = `${prefix} A`
        const emptyName = `${prefix} B`
        const service = nonTaxableService()
        const chip = page.getByTestId('customer-transactions-filter-credit-memo')

        await createCustomer(page, { name: emptyName })
        await createCustomer(page, { name })
        const customerId = openCustomerId(page)

        // A posted memo of 250.00, a draft, and a posted memo then voided (V, confirm), each
        // from the customer's New transaction menu.
        const posted = await memoFromCustomer(page, customerId, {
            rate: '250.00',
            memo: uniqueMemo('Credit memo tab posted'),
            action: 'post',
        })
        await backToCustomer(page, customerId)
        const { id: draftId } = await memoFromCustomer(page, customerId, {
            rate: '250.00',
            memo: uniqueMemo('Credit memo tab draft'),
            action: 'draft',
        })
        await backToCustomer(page, customerId)
        const voided = await memoFromCustomer(page, customerId, {
            rate: '250.00',
            memo: uniqueMemo('Credit memo tab void'),
            action: 'post',
        })
        await page.keyboard.press('v')
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('credit-memo-badge')).toHaveText('Void')
        await backToCustomer(page, customerId)

        // The posted memo's credit names the customer: Open reads as a credit of 250.00;
        // Overdue sums invoice balances only.
        await expect(page.getByTestId('customer-balance-open-label')).toHaveText('Credit')
        await expect(page.getByTestId('customer-balance-open')).toHaveText(CREDIT_250)
        await expect(page.getByTestId('customer-balance-overdue')).toHaveText('$0.00')

        // The Credit memos chip: the three memos, newest first.
        await chip.click()
        await expect(chip).toHaveAttribute('aria-pressed', 'true')
        await expect(page.getByTestId('customer-transactions-table')).toBeVisible()
        await expect.poll(() => transactionIds(page)).toEqual([voided.id, draftId, posted.id])
        await expect
            .poll(() => rowCells(page, posted.id))
            .toMatchObject({
                Type: 'Credit memo',
                'No.': posted.number,
                'Due date': '—',
                Total: CREDIT_250,
                Status: 'Unapplied',
            })
        await expect
            .poll(() => rowCells(page, draftId))
            .toMatchObject({ Type: 'Credit memo', 'No.': '', Status: 'Draft' })
        await expect
            .poll(() => rowCells(page, voided.id))
            .toMatchObject({ Type: 'Credit memo', 'No.': voided.number, Status: 'Void' })

        // The posted memo's row opens the memo.
        await transaction(page, posted.id).click()
        await expect(page).toHaveURL(creditMemoUrlOf(posted.id))
        await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
        await backToCustomer(page, customerId)

        // New transaction → Credit memo starts with the customer; Post & new keeps it.
        await startTransaction(page, 'customer-new-credit-memo', 'credit-memos', customerId)
        await expect(page.getByTestId('form-input-customer')).toContainText(name)
        const rowId = await pickCreditMemoLineProduct(page, 0, service)
        await page.getByTestId(lineCellTestId(rowId, 'rate')).fill('40.00')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Credit memo tab post new'))
        await page.getByTestId('credit-memo-post-new').click()
        // The memo field empties only on the new form, after the post landed.
        await expect(page.getByTestId('form-input-memo')).toHaveValue('')
        await expect(page.getByTestId('credit-memo-title')).toHaveText('New credit memo')
        await expect(page).toHaveURL(
            new RegExp(`/books/credit-memos/new\\?(?:[^#]*&)?customer=${customerId}(?:&|$)`)
        )
        await expect(page.getByTestId('form-input-customer')).toContainText(name)

        // A customer with no documents: the chip's empty text. Back to the customer page
        // first, so the customers list opens from its back button.
        for (let step = 0; step < 3; step++) {
            if (customerPath(customerId).test(new URL(page.url()).pathname)) break
            await page.goBack()
        }
        await expect(page).toHaveURL(customerPath(customerId))
        await openCustomer(page, emptyName)
        await expect(page.getByTestId('customer-title')).toHaveText(emptyName)
        await openTransactionsTab(page)
        await chip.click()
        await expect(page.getByTestId('customer-transactions-no-match')).toContainText(
            'No credit memos for this customer'
        )
        await expect.poll(() => transactionIds(page)).toEqual([])
    })

    test("a failed credit memo read keeps the tab's Retry", async ({ context }) => {
        const name = uniqueName('Credit memo retry')
        const setup = await context.newPage()
        await openBooks(setup, DESKTOP)
        await createCustomer(setup, { name })
        const customerId = openCustomerId(setup)
        const posted = await memoFromCustomer(setup, customerId, {
            rate: '250.00',
            memo: uniqueMemo('Credit memo retry'),
            action: 'post',
        })
        // Books reopens at its last route: the customer page, not the memo.
        await backToCustomer(setup, customerId)
        await setup.close()

        // Realtime cut before login, and the memo read refused.
        const page = await context.newPage()
        await page.route(REALTIME_URL, route => route.abort())
        await page.route(CREDIT_MEMOS_URL, route => route.fulfill({ status: 400 }))
        await openBooks(page, DESKTOP)
        await openCustomer(page, name)
        await openTransactionsTab(page)
        const banner = page.getByTestId('customer-transactions-banner')
        const retry = page.getByTestId('customer-transactions-retry')
        await expect(banner).toBeVisible()
        await expect(retry).toBeVisible()
        await expect(transaction(page, posted.id)).toHaveCount(0)

        // Unroute, then Retry: the memo's row, and no banner.
        await page.unrouteAll({ behavior: 'wait' })
        await page.route(REALTIME_URL, route => route.abort())
        await retry.click()
        await expect(transaction(page, posted.id)).toBeVisible()
        await expect(banner).toHaveCount(0)

        // At 390 the memo is a card.
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('customer-transactions-cards')).toBeVisible()
        const card = transaction(page, posted.id)
        await expect(card).toContainText('Credit memo')
        await expect(card).toContainText(posted.number)
        await expect(card).toContainText(CREDIT_250)
        await expect(card).toContainText('Unapplied')
        await card.click()
        await expect(page).toHaveURL(creditMemoUrlOf(posted.id))
        await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
    })

    test('a credit memo lowers the Sales Tax Liability and opens from its row', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const name = uniqueName('Credit memo tax')
        await createCustomer(page, { name })
        const customerId = openCustomerId(page)
        const today = await localToday(page)

        // An invoice of 1,000.00 of a taxable product under the state rate.
        await startTransaction(page, 'customer-new-invoice', 'invoices', customerId)
        const invoiceLine = await pickLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId(lineCellTestId(invoiceLine, 'quantity')).fill('1')
        await page.getByTestId(lineCellTestId(invoiceLine, 'rate')).fill('1000.00')
        await expect(page.getByTestId(lineCellTestId(invoiceLine, 'amount'))).toContainText(
            '$1,000.00'
        )
        await chooseStateRate(page)
        await page.getByTestId('form-input-due_date').fill(today)
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Credit memo tax invoice'))
        await expect(page.getByTestId('invoice-total-tax')).toBeVisible()
        const invoice = await postInvoice(page)
        await backToCustomer(page, customerId)

        // A credit memo of 250.00 of the same product under the same rate.
        await startTransaction(page, 'customer-new-credit-memo', 'credit-memos', customerId)
        const memoLine = await pickCreditMemoLineProduct(page, 0, ACCESS_POINT)
        await page.getByTestId(lineCellTestId(memoLine, 'quantity')).fill('1')
        await page.getByTestId(lineCellTestId(memoLine, 'rate')).fill('250.00')
        await chooseStateRate(page)
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Credit memo tax memo'))
        await expect(page.getByTestId('credit-memo-total-tax')).toBeVisible()
        await page.getByTestId('credit-memo-post').click()
        await expect(page.getByTestId('credit-memo-read-only')).toBeVisible()
        const memoNumber = await memoNumberOf(page)
        const memoId = creditMemoIdFromUrl(page)

        // The report, this month to date, on Accrual.
        await page.setViewportSize(TALL)
        await openSalesTaxLiability(page)
        await choosePeriod(page, { preset: 'thisMonthToDate' })
        const reportToday = await browserToday(page)
        await expect(page.getByTestId('report-document-period')).toHaveText(
            rangeWords(`${reportToday.slice(0, 8)}01`, reportToday)
        )
        await expect(page.getByTestId('report-header-param-method')).toHaveText('Accrual basis')

        const customer = escapeRegExp(name)
        const invoiceLabel = new RegExp(`· Invoice ${invoice.number} · ${customer}$`)
        const memoLabel = new RegExp(`· Credit memo ${memoNumber} · ${customer}$`)
        const accrual = await customerTaxRows(page, name)
        const invoiceRow = oneRow(accrual, invoiceLabel)
        const memoRow = oneRow(accrual, memoLabel)
        expect(invoiceRow.taxable, "the invoice's taxable amount (cents)").toBe(100_000)
        expect(invoiceRow.tax, "the invoice's tax (cents)").toBeGreaterThan(0)
        expect(memoRow, "the memo's row: negative figures (cents)").toMatchObject({
            gross: -25_000,
            taxable: -25_000,
        })
        expect(memoRow.tax, "the memo's tax (cents)").toBeLessThan(0)
        expect(sumOf(accrual, 'taxable'), "the customer's taxable amount (cents)").toBe(75_000)
        expect(sumOf(accrual, 'tax'), "the customer's tax: the invoice's less the memo's").toBe(
            invoiceRow.tax + memoRow.tax
        )

        // The rate opens into its documents; the memo's row opens the memo.
        await openReportAccount(page, STATE_RATE)
        const row = await scrollToReportRow(page, `Credit memo ${memoNumber} · ${name}`)
        await row.click()
        await expect(page).toHaveURL(creditMemoUrlOf(memoId))
        await expect(page.getByTestId('credit-memo-title')).toHaveText(`Credit memo ${memoNumber}`)

        // Cash: neither document is paid or applied, so the customer's figures are zero.
        await page.goBack()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await page.getByTestId('report-param-method').click()
        await page.getByTestId('report-filter-option-cash').click()
        await expect(page.getByTestId('report-header-param-method')).toHaveText('Cash basis')
        const cash = await customerTaxRows(page, name)
        expect(
            {
                gross: sumOf(cash, 'gross'),
                taxable: sumOf(cash, 'taxable'),
                tax: sumOf(cash, 'tax'),
            },
            "the customer's figures on Cash (cents)"
        ).toEqual({ gross: 0, taxable: 0, tax: 0 })
    })
})
