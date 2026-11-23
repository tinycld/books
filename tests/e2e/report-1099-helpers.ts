import { expect, type Page, type Request } from '@playwright/test'
import { chooseParamOption, hubRow, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { REPORT_1099_TITLE } from '~/tinycld/books/lib/report-1099-fixture'
import {
    openBooksReports,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { centsOf } from './customer-balance-helpers'
import {
    expenseCellTestId,
    openNewExpense,
    pickExpenseLineAccount,
    pickExpenseVendor,
    pickPaidFrom,
    pickSelectOption,
    postExpense,
} from './expense-helpers'
import { runLanded } from './expenses-by-vendor-helpers'
import { CHECKING } from './pay-bills-helpers'
import { expectSalesRowsFit } from './sales-reports-helpers'
import {
    accountRecordPath,
    chooseBox,
    createExpenseAccount,
    openForm1099,
} from './vendor-1099-helpers'
import {
    field,
    insertAnswered,
    openNewVendor,
    openVendorsList,
    searchVendors,
    vendorIdOf,
    vendorSurface,
} from './vendor-form-helpers'

// Shared by the 1099 Summary and Detail specs (report-1099 checkpoints 2, 3 and 5).

// The change-signal topics (core changesignal.Topic) of the ledger tables the report reads,
// as books-expenses-by-vendor.spec.ts lists them: a live report subscribes to them.
export const LEDGER_TOPICS = [
    'collection/books_journal_lines',
    'collection/books_cash_basis_lines',
    'collection/books_journal_entries',
]

// The topics of one realtime subscribe request (`{ clientId, subscriptions }`).
export function realtimeTopics(request: Request): string[] {
    const body = request.postDataJSON() as { subscriptions?: unknown } | null
    const topics = body?.subscriptions
    return Array.isArray(topics) ? topics.filter(t => typeof t === 'string') : []
}

// Opens the shipped 1099 Summary and Detail from the Books hub, as openExpensesByVendor
// opens the Expenses by Vendor, and waits for its table or its empty state.
export async function openForm1099Report(page: Page): Promise<void> {
    await openBooksReports(page)
    const row = hubRow(page, REPORT_1099_TITLE).filter({
        has: page.getByText(REPORT_1099_TITLE, { exact: true }),
    })
    await expect(row, `the Books hub lists ${REPORT_1099_TITLE}`).toBeVisible()
    await row.click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
    await expect(page.getByTestId('report-document-title').filter({ visible: true })).toHaveText(
        REPORT_1099_TITLE
    )
}

export const SHOW_LABELS = {
    meets: 'At or above the threshold',
    below: 'Below the threshold',
    tracked: 'All 1099 vendors',
    untracked: 'Not tracked for 1099',
} as const

export const FORM_LABELS = { all: 'NEC and MISC', nec: '1099-NEC', misc: '1099-MISC' } as const

export const ORDER_LABELS = { name: 'Name', amount: 'Largest reportable' } as const

// Sets a single choice param through its chip (each has a default, so the chip shows), as
// chooseExpenseOrder does, and waits for the run of the new value, the URL and the chip.
async function chooseSingle(
    page: Page,
    paramId: string,
    value: string,
    label: string,
    defaultValue: string
): Promise<void> {
    const landed = runLanded(page, params => (params[paramId] ?? defaultValue) === value)
    await chooseParamOption(page, paramId, { from: 'chip', labels: [label] })
    await landed
    await expect
        .poll(() => new URL(page.url()).searchParams.get(`p-${paramId}`) ?? defaultValue)
        .toBe(value)
    await expect(page.getByTestId(`report-param-${paramId}`)).toContainText(label)
}

export function chooseShow(page: Page, value: keyof typeof SHOW_LABELS): Promise<void> {
    return chooseSingle(page, 'show', value, SHOW_LABELS[value], 'meets')
}

export function chooseForm(page: Page, value: keyof typeof FORM_LABELS): Promise<void> {
    return chooseSingle(page, 'form', value, FORM_LABELS[value], 'all')
}

export function chooseForm1099Order(page: Page, value: keyof typeof ORDER_LABELS): Promise<void> {
    return chooseSingle(page, 'order', value, ORDER_LABELS[value], 'name')
}

// Gives each account its box through Settings → 1099s, waiting for the server to store
// each box.
export async function boxAccounts(
    page: Page,
    accounts: readonly { id: string; boxLabel: string }[]
): Promise<void> {
    await openForm1099(page)
    for (const { id, boxLabel } of accounts) {
        const stored = page.waitForResponse(
            response =>
                response.request().method() === 'PATCH' &&
                new URL(response.url()).pathname.endsWith(accountRecordPath(id))
        )
        await chooseBox(page, id, boxLabel)
        expect((await stored).status()).toBe(200)
    }
}

// Creates a number-less Expense account and gives it the box `boxLabel` through Settings →
// 1099s. createExpenseAccount fails once Settings is open over the chart (the stack keeps
// the chart mounted, so its New toolbar is there twice): create every account of a test
// before its first box, and give several accounts their boxes with boxAccounts.
export async function ownBoxedAccount(
    page: Page,
    name: string,
    boxLabel: string
): Promise<{ id: string; name: string }> {
    const id = await createExpenseAccount(page, name)
    await boxAccounts(page, [{ id, boxLabel }])
    return { id, name }
}

// Posts an expense dated today (the form's default) for `vendor` with one account line,
// paid from `paidFrom` (1000 Business Checking, whose method is Check, unless given) with
// the payment method `method` when given.
export async function expenseFor(
    page: Page,
    values: {
        vendor: string
        account: string
        amount: string
        method?: string
        paidFrom?: string
        description?: string
    }
): Promise<string> {
    await navigateToPackage(page, 'books')
    await openNewExpense(page)
    await pickExpenseVendor(page, values.vendor)
    await pickPaidFrom(page, values.paidFrom ?? CHECKING)
    if (values.method !== undefined) {
        await pickSelectOption(page, 'form-input-payment_method', values.method)
    }
    const line = await pickExpenseLineAccount(page, 0, values.account)
    if (values.description !== undefined) {
        await page
            .getByTestId(expenseCellTestId('account_lines', line, 'description'))
            .fill(values.description)
    }
    await page.getByTestId(expenseCellTestId('account_lines', line, 'amount')).fill(values.amount)
    return postExpense(page)
}

// The report's figure columns, in the order its rows draw them.
export const FORM_1099_FIGURES = ['reportable', 'excluded', 'all'] as const

// The phone arrangement of D1: the label (`name`) on line 1, the three figures on line 2.
// expectSalesPhoneLines places the label on line 1 itself; these are the lines below it.
export const FORM_1099_PHONE_LINES = [FORM_1099_FIGURES] as const

/**
 * Spec §3 "Phone": on every mounted row of the open 1099 report the label (the `name`
 * column) takes at most three lines, and each of Reportable, Excluded and All payments that
 * shows a figure shows it whole on one line inside the table; nothing scrolls sideways.
 * expectBalanceRowsFit reads the Customer Balance's Balance column, so this report reads
 * its own columns through the column-generic sales check. Polled.
 */
export async function expectForm1099RowsFit(page: Page): Promise<void> {
    await expectSalesRowsFit(page, FORM_1099_FIGURES)
}

const THRESHOLD_LINE = /^1099 threshold: (.+)$/

// The threshold the open report's heading prints ("1099 threshold: $2,000.00"), in cents.
export async function thresholdOf(page: Page): Promise<number> {
    const line = page.getByTestId('report-header-param-header-0')
    await expect(line).toHaveText(THRESHOLD_LINE)
    const match = THRESHOLD_LINE.exec((await line.textContent()) ?? '')
    return centsOf(match?.[1] ?? '')
}

// Adds `names` to the Vendor filter (from Add filter while it is unset, from its chip
// after), then waits for the URL and for the heading's Vendor line to name each pick. No
// rows condition: a box row is a group row too, a vendor label can hold a legal name, and
// a vendor under another Show choice has no row.
export async function filterTo1099Vendors(page: Page, names: readonly string[]): Promise<void> {
    for (const name of names) {
        const hasChip = await page.getByTestId('report-param-vendors').isVisible()
        await chooseParamOption(page, 'vendors', {
            from: hasChip ? 'chip' : 'add-filter',
            search: name,
            labels: [name],
        })
    }
    await expect.poll(() => new URL(page.url()).searchParams.get('p-vendors')).not.toBeNull()
    const header = page.getByTestId('report-header-param-vendors')
    await expect(header).toContainText('Vendor: ')
    for (const name of names) await expect(header).toContainText(name)
}

// Creates a vendor with Track payments for 1099 left off, through the same New vendor form
// steps as createTrackedVendor, and returns its id.
export async function createUntrackedVendor(page: Page, name: string): Promise<string> {
    await openNewVendor(page)
    await field(page, 'display_name').fill(name)
    const inserted = insertAnswered(page)
    await page.getByTestId('vendor-save').click()
    expect((await inserted).status()).toBe(200)
    await expect(page.getByTestId('vendor-title')).toHaveText(name)
    await openVendorsList(page)
    await expect(page.getByTestId('vendors-list')).toBeVisible()
    await expect(vendorSurface(page)).toBeHidden()
    await searchVendors(page, name)
    return vendorIdOf(page, name)
}

type SnapshotRow = ReportSnapshot['rows'][number]

// The cents of a figure cell; null when the cell is blank.
export function cellCents(row: SnapshotRow | undefined, col: string): number | null {
    const text = (row?.cells[col] ?? '').trim()
    return text === '' ? null : centsOf(text)
}

// The vendor rows (the outer group level), top to bottom.
export function vendorRows(snapshot: ReportSnapshot): SnapshotRow[] {
    const top = Math.min(...snapshot.rows.filter(r => r.kind === 'group').map(r => r.depth))
    return snapshot.rows.filter(r => r.kind === 'group' && r.depth === top)
}

export function vendorRow(snapshot: ReportSnapshot, name: string): SnapshotRow | undefined {
    return vendorRows(snapshot).find(r => r.label === name)
}

// The box rows under the vendor row `name`, top to bottom.
export function boxRows(snapshot: ReportSnapshot, name: string): SnapshotRow[] {
    const vendor = vendorRow(snapshot, name)
    if (!vendor) return []
    const at = snapshot.rows.indexOf(vendor)
    const out: SnapshotRow[] = []
    for (const row of snapshot.rows.slice(at + 1)) {
        if (row.kind === 'total' || (row.kind === 'group' && row.depth <= vendor.depth)) break
        if (row.kind === 'group' && row.depth === vendor.depth + 1) out.push(row)
    }
    return out
}

export function totalRow(snapshot: ReportSnapshot): SnapshotRow | undefined {
    return snapshot.rows.find(r => r.kind === 'total')
}

// The payment rows (core `d:` rows) under the box row `boxLabel` of the vendor row `vendor`,
// top to bottom (report-1099 checkpoint 3). Empty when the box is closed or not mounted.
export function paymentLines(
    snapshot: ReportSnapshot,
    vendor: string,
    boxLabel: string
): SnapshotRow[] {
    const box = boxRows(snapshot, vendor).find(r => r.label === boxLabel)
    if (!box) return []
    const out: SnapshotRow[] = []
    for (const row of snapshot.rows.slice(snapshot.rows.indexOf(box) + 1)) {
        if (row.kind !== 'detail') break
        out.push(row)
    }
    return out
}

// Presses the box row `boxLabel` of the vendor row `vendor` in the open report (the vendor
// level is open, the box level closed) and waits until its payment rows show under it.
export async function openBox(page: Page, vendor: string, boxLabel: string): Promise<void> {
    const shown = await snapshotWhen(
        page,
        reportSnapshot,
        s => boxRows(s, vendor).some(r => r.label === boxLabel),
        `${vendor} shows the box ${boxLabel}`
    )
    const box = boxRows(shown, vendor).find(r => r.label === boxLabel)
    if (!box) throw new Error(`${vendor} has no box ${boxLabel}`)
    const label = page.getByTestId('report-table').getByTestId(`report-row-${box.id}`)
    await expect(label).toHaveAttribute('aria-expanded', 'false')
    await label.click()
    await expect(label).toHaveAttribute('aria-expanded', 'true')
    await snapshotWhen(
        page,
        reportSnapshot,
        s => paymentLines(s, vendor, boxLabel).length > 0,
        `the payment rows of ${vendor}'s ${boxLabel} show`
    )
}

// A row's Reportable, Excluded and All payments in cents (null for a blank cell).
export function figures(row: SnapshotRow | undefined) {
    return {
        reportable: cellCents(row, 'reportable'),
        excluded: cellCents(row, 'excluded'),
        all: cellCents(row, 'all'),
    }
}
