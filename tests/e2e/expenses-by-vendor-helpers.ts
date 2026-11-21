import { expect, type Page } from '@playwright/test'
import { chooseParamOption, hubRow } from '@tinycld/core/e2e-helpers'
import { EXPENSES_BY_VENDOR_TITLE } from '~/tinycld/books/lib/expenses-by-vendor-fixture'
import {
    accountLineRows,
    BILL_URL,
    billCellTestId,
    billIdFromUrl,
    openNewBill,
    pickBillVendor,
    pickLineAccount,
    postBill,
} from './bill-helpers'
import { openBooksReports, type ReportSnapshot } from './books-report-helpers'
import { centsOf } from './customer-balance-helpers'
import { openVendorsList, searchVendors, vendorEntry } from './vendor-form-helpers'

// Steps and row readers of the Expenses by Vendor e2e (expenses-by-vendor checkpoint 1).
// They use the shared report, bill and vendor helpers and change none of them.

// The shipped Expenses by Vendor from the Books hub, reached as openVendorBalance reaches
// the Vendor Balance: Reports in the Books sidebar, then the hub row. It has an empty state,
// so the table or the empty text shows.
export async function openExpensesByVendor(page: Page): Promise<void> {
    await openBooksReports(page)
    const row = hubRow(page, EXPENSES_BY_VENDOR_TITLE).filter({
        has: page.getByText(EXPENSES_BY_VENDOR_TITLE, { exact: true }),
    })
    await expect(row, `the Books hub lists ${EXPENSES_BY_VENDOR_TITLE}`).toBeVisible()
    await row.click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
    await expect(page.getByTestId('report-document-title').filter({ visible: true })).toHaveText(
        EXPENSES_BY_VENDOR_TITLE
    )
}

// Waits for the run whose params satisfy `matches`: core keeps the previous run's rows on
// screen until the new run lands. Start it before the change and await it after.
export function runLanded(page: Page, matches: (params: Record<string, unknown>) => boolean) {
    return page.waitForResponse(response => {
        if (!response.url().includes('/api/reports/run') || !response.ok()) return false
        const body = response.request().postDataJSON() as {
            params?: Record<string, unknown>
        } | null
        return matches(body?.params ?? {})
    })
}

const METHOD_VALUES = { Accrual: 'accrual', Cash: 'cash' } as const

// Sets Method through its chip, as pay-bills-cash-basis.spec.ts does, waits for the run
// of the new method, and for the document header's basis line.
export async function chooseExpenseMethod(page: Page, choice: 'Accrual' | 'Cash'): Promise<void> {
    const value = METHOD_VALUES[choice]
    const landed = runLanded(page, params => (params.method ?? 'accrual') === value)
    await page.getByTestId('report-param-method').click()
    await page.getByTestId(`report-filter-option-${value}`).click()
    await landed
    await expect(page.getByTestId('report-param-method')).toContainText(choice)
    await expect(page.getByTestId('report-header-param-method')).toHaveText(`${choice} basis`)
}

const ORDER_LABELS = { name: 'Name', amount: 'Largest expenses' } as const

// Sets Order through its chip (it has a default, so the chip shows), as chooseBalanceOrder
// does with this report's values, and waits for the run of the new order, the URL and the
// chip's label.
export async function chooseExpenseOrder(
    page: Page,
    choice: keyof typeof ORDER_LABELS
): Promise<void> {
    const label = ORDER_LABELS[choice]
    const landed = runLanded(page, params => (params.order ?? 'name') === choice)
    await chooseParamOption(page, 'order', { from: 'chip', labels: [label] })
    await landed
    await expect.poll(() => new URL(page.url()).searchParams.get('p-order') ?? 'name').toBe(choice)
    await expect(page.getByTestId('report-param-order')).toContainText(label)
}

// Voids the posted bill `billId` of `vendor` from the vendor's page, the path of
// books-vendor-balance.spec.ts: the vendor's transaction row, the read view's Void, the
// confirm, then the Void badge.
export async function voidBill(
    page: Page,
    vendor: { id: string; name: string },
    billId: string
): Promise<void> {
    await openVendorsList(page)
    await searchVendors(page, vendor.name)
    await vendorEntry(page, vendor.name).click()
    await expect(page.getByTestId('vendor-title')).toHaveText(vendor.name)
    await page.getByTestId(`vendor-transaction-${billId}`).click()
    await expect(page).toHaveURL(BILL_URL)
    await expect(page.getByTestId('bill-read-only').filter({ visible: true })).toBeVisible()
    await page.getByTestId('bill-read-void').filter({ visible: true }).click()
    await page.getByTestId('void-confirm').click()
    await expect(page.getByTestId('bill-badge').filter({ visible: true })).toHaveText('Void')
}

/**
 * Books must be open. Posts a bill of `vendor` dated today with one account line for each
 * of `lines` (the account's "<number> <name>" label and the amount), the second and later
 * lines added with Add account line. Returns the bill's id and number.
 */
export async function postBillOnAccounts(
    page: Page,
    vendor: string,
    lines: readonly { account: string; amount: string }[]
): Promise<{ id: string; number: string }> {
    await openNewBill(page)
    await pickBillVendor(page, vendor)
    for (const [index, line] of lines.entries()) {
        if (index > 0) {
            await page.getByTestId('form-table-account_lines-add').click()
            await expect(accountLineRows(page)).toHaveCount(index + 1)
        }
        const rowId = await pickLineAccount(page, index, line.account)
        await page.getByTestId(billCellTestId('account_lines', rowId, 'amount')).fill(line.amount)
    }
    const number = await postBill(page)
    return { id: billIdFromUrl(page), number }
}

// The % of expenses of the row labelled exactly `label` (a vendor's group row, or "Total"
// for the Total row), as a number of percent; null when the row is not mounted or its
// share is blank.
export function expenseShare(snapshot: ReportSnapshot, label: string): number | null {
    const row = snapshot.rows.find(r =>
        label === 'Total' ? r.kind === 'total' : r.kind === 'group' && r.label === label
    )
    const text = (row?.cells.pct ?? '').trim()
    if (text === '') return null
    const value = Number(text.replace(/%$/, '').replace(/^[−(]/, '-').replace(/[),]/g, ''))
    if (Number.isNaN(value)) throw new Error(`not a share: "${text}"`)
    return value
}

// The Total of the row labelled exactly `label` (a vendor's group row, or "Total" for the
// Total row), in cents; null when the row is not mounted.
export function expenseCents(snapshot: ReportSnapshot, label: string): number | null {
    const row = snapshot.rows.find(r =>
        label === 'Total' ? r.kind === 'total' : r.kind === 'group' && r.label === label
    )
    if (!row) return null
    return centsOf(row.cells.amount ?? '')
}
