import { expect, type Page } from '@playwright/test'
import { chooseParamOption, hubRow } from '@tinycld/core/e2e-helpers'
import { AP_AGING_EMPTY_DAY, AP_AGING_TITLE } from '~/tinycld/books/lib/ap-aging-fixture'
import { type AgedCents, agingRow } from './ar-aging-helpers'
import {
    openBooksReports,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import {
    CHECKING,
    filterToVendor,
    openPayBills,
    payBillsRowAmount,
    pickSelect,
    postedNumber,
    uniqueCheckNo,
    vendorWithBills,
} from './pay-bills-helpers'

// Steps and row readers of the A/P Aging e2e (ap-aging plan, checkpoint 3): they import
// agingRow and AgedCents from ar-aging-helpers.ts, the report helpers of
// books-report-helpers.ts, the Pay bills helpers of pay-bills-helpers.ts and hubRow and
// chooseParamOption from @tinycld/core/e2e-helpers, and leave each of them unchanged.

type SnapshotRow = ReportSnapshot['rows'][number]

const NO_MONEY: AgedCents = {
    current: null,
    d30: null,
    d60: null,
    d90: null,
    d91: null,
    total: null,
}

// The cents of a row with `figures` and no figure in every other column.
export function aged(figures: Partial<AgedCents>): AgedCents {
    return { ...NO_MONEY, ...figures }
}

// The rows one depth below the row labelled `label`, until the next row at its depth or above.
export function rowsUnder(snapshot: ReportSnapshot, label: string): SnapshotRow[] {
    const parent = agingRow(snapshot, label)
    const at = snapshot.rows.indexOf(parent)
    const out: SnapshotRow[] = []
    for (const row of snapshot.rows.slice(at + 1)) {
        if (row.depth <= parent.depth) break
        if (row.depth === parent.depth + 1) out.push(row)
    }
    return out
}

export function totalRow(snapshot: ReportSnapshot): SnapshotRow | undefined {
    return snapshot.rows.find(row => row.kind === 'total')
}

export const groups = (snapshot: ReportSnapshot) =>
    snapshot.rows.filter(row => row.kind === 'group').map(row => row.label)

// The distinct tops (rounded) of the row with id `rowId`: its label and every cell.
export function rowTops(page: Page, rowId: string): Promise<number[]> {
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

// The fixed days of the e2e (plan: no document before 2026-07-01, As of set to fixed days).
// vendorWithBills dates a bill that is due before today on its due date, so a bill due
// `due` is dated `due`: it is 40 days past due on `aged40` (31 - 60), not yet past due on
// `due` (Current), and not open on `beforeBill`. `empty` is a day before every posted
// Accounts payable line of the seeded book.
export const AP_DAY = {
    due: '2026-07-20',
    aged40: '2026-08-29',
    beforeBill: '2026-07-19',
    empty: AP_AGING_EMPTY_DAY,
} as const

// The shipped A/P Aging from the Books hub, reached as openArAging reaches the A/R Aging:
// Reports in the Books sidebar, then the hub row, through the viewer share Books keeps. It
// has an empty state, so the table or the empty text shows.
export async function openApAging(page: Page): Promise<void> {
    await openBooksReports(page)
    const row = hubRow(page, AP_AGING_TITLE).filter({
        has: page.getByText(AP_AGING_TITLE, { exact: true }),
    })
    await expect(row, `the Books hub lists ${AP_AGING_TITLE}`).toBeVisible()
    await row.click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
    await expect(page.getByTestId('report-document-title').filter({ visible: true })).toHaveText(
        AP_AGING_TITLE
    )
}

/**
 * Narrows the open report to the vendors named, through core's Vendor picker, as
 * filterToCustomers does for the Customer param: an unset Vendor has no chip (core lists it
 * under Add filter), so the first name starts from Add filter and each later one from the
 * chip, each found through the picker's search. It then waits until the URL holds the pick,
 * the document header prints "Vendor: " with every name, and the mounted group rows are
 * only those vendors, with the Total: core keeps the previous run's rows until the new run
 * lands. The vendors' rows are closed.
 */
export async function filterToVendors(page: Page, names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) {
        await chooseParamOption(page, 'vendors', {
            from: index === 0 ? 'add-filter' : 'chip',
            search: name,
            labels: [name],
        })
    }
    await expect.poll(() => new URL(page.url()).searchParams.get('p-vendors')).not.toBeNull()
    const header = page.getByTestId('report-header-param-vendors')
    await expect(header).toContainText('Vendor: ')
    for (const name of names) await expect(header).toContainText(name)
    const wanted = [...names].sort((a, b) => a.localeCompare(b))
    await snapshotWhen(
        page,
        reportSnapshot,
        snapshot => {
            const groups = snapshot.rows
                .filter(row => row.kind === 'group')
                .map(row => row.label)
                .sort((a, b) => a.localeCompare(b))
            const hasTotal = snapshot.rows.some(row => row.kind === 'total')
            return hasTotal && groups.join('|') === wanted.join('|')
        },
        `the rows show only the vendors ${wanted.join(', ')} and the Total`
    )
}

/**
 * Books must be open at desktop width. Creates a vendor (a unique name unless `name` is
 * given) with one posted bill of `amount` due `due` (dated `due` when that is before today),
 * through vendorWithBills. Returns the vendor and the bill's id and number.
 */
export async function apVendorWithBill(
    page: Page,
    input: { amount: string; due: string; name?: string }
): Promise<{ vendor: { id: string; name: string }; billId: string; billNo: string }> {
    const { vendor, bills } = await vendorWithBills(page, {
        name: input.name,
        bills: [{ amount: input.amount, due: input.due }],
    })
    return { vendor, billId: bills[0].id, billNo: bills[0].number }
}

/**
 * Books must be open. Pays `amount` of one bill of `vendor` through Pay bills, by check
 * from Business Checking with a check number no other run takes, dated today by the
 * screen. Returns the bill payment's number from the posted toast.
 */
export async function payPartOfBill(
    page: Page,
    input: { vendor: { id: string; name: string }; billId: string; amount: string }
): Promise<string> {
    await openPayBills(page)
    await pickSelect(page, 'pay-bills-paid-from', CHECKING)
    await expect(page.getByTestId('pay-bills-method')).toContainText('Check')
    await page.getByTestId('pay-bills-check-no').fill(uniqueCheckNo())
    await filterToVendor(page, input.vendor)
    const amount = payBillsRowAmount(page, input.billId)
    await amount.fill(input.amount)
    await expect(amount).toHaveValue(input.amount)
    await page.getByTestId('pay-bills-pay').click()
    return postedNumber(page)
}
