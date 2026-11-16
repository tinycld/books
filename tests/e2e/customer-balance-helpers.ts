import { expect, type Page } from '@playwright/test'
import { chooseParamOption, hubRow } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_BALANCE_TITLE } from '~/tinycld/books/lib/customer-balance-fixture'
import { csvRecords, exportReport, openBooksReports } from './books-report-helpers'

// Steps of the Customer Balance e2e (customer-balance plan D8): they import
// books-report-helpers.ts and leave it unchanged, so no other spec's helper moves.

// The shipped Customer Balance from the Books hub, reached as openSalesTaxLiability reaches
// the Sales Tax Liability: Reports in the Books sidebar, then the hub row, through the
// viewer share Books keeps. It has an empty state, so the table or the empty text shows.
export async function openCustomerBalance(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, CUSTOMER_BALANCE_TITLE)
        .filter({ has: page.getByText(CUSTOMER_BALANCE_TITLE, { exact: true }) })
        .click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// The records of the open report's CSV after its heading line: label, then balance. Core's
// table mounts only the rows near the viewport, so a test reads the whole report here.
export async function customerBalanceCsv(page: Page): Promise<string[][]> {
    const { bytes } = await exportReport(page, 'csv')
    return csvRecords(bytes).slice(1)
}

const BALANCE_ROWS_LABELS = { nonzero: 'Non-zero', activity: 'With activity' } as const

// Sets Rows through its chip and waits until the URL holds the new value and the chip
// shows its label.
export async function chooseBalanceRows(
    page: Page,
    choice: keyof typeof BALANCE_ROWS_LABELS
): Promise<void> {
    const label = BALANCE_ROWS_LABELS[choice]
    await chooseParamOption(page, 'rows', { from: 'chip', labels: [label] })
    await expect
        .poll(() => new URL(page.url()).searchParams.get('p-rows') ?? 'nonzero')
        .toBe(choice)
    await expect(page.getByTestId('report-param-rows')).toContainText(label)
}

// A figure's text in integer cents: "$1,250.00", "1250.00" → 125000; a leading minus or
// parentheses is negative ("-12.00", "(12.00)" → -1200). Any other text throws.
export function centsOf(text: string): number {
    const value = text.trim()
    const isNegative = /^[-−(]/.test(value) || value.endsWith(')')
    const digits = value
        .replace(/^[-−(]/, '')
        .replace(/\)$/, '')
        .replace(/^\$/, '')
    if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(digits)) {
        throw new Error(`not an amount: "${text}"`)
    }
    const [whole, fraction = ''] = digits.replace(/,/g, '').split('.')
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return isNegative ? -amount : amount
}

// A line of the report's day: core's detail label once the report has one (checkpoint 2).
const LINE_LABEL = /^\d{4}-\d{2}-\d{2} · /

/**
 * The report's own rows among the CSV records. Core's CSV opens every group (export.go
 * ExpandAll), so each customer record is followed by its posted lines. A line is labelled by
 * the report's detail label ("<date> · …"), or, with no detail label, by its first column
 * (core assemble.go firstLabel): the customer's name without " (inactive)", or "(none)"
 * (or nothing) on a line with no customer. Such a line follows a record that has a figure
 * and carries that record's name; a family header (no figure) followed by the parent's own
 * row is kept.
 *
 * Limits at checkpoint 1, where the report has no detail label yet (checkpoint 2 adds
 * `detail.label`), so a line record carries its customer's name as its label. These are
 * misread: a customer whose name starts with "Total" (its lines are kept as records), a
 * sub-customer named like its parent (its row is dropped as the parent's line), and a
 * customer named "(none)" or "No customer" (taken for, or confused with, the No customer
 * row and its lines). The tests' data has none of them: every customer they create has a
 * unique name from `uniqueName`, and no seeded customer has such a name.
 */
export function withoutLineRecords(records: readonly string[][]): string[][] {
    const kept: string[][] = []
    for (const record of records) {
        const label = record[0] ?? ''
        const previous = kept.at(-1)
        const previousName = (previous?.[0] ?? '').replace(/ \(inactive\)$/, '')
        const previousHasFigure = (previous?.[1] ?? '') !== ''
        const isLine =
            LINE_LABEL.test(label) ||
            label === '(none)' ||
            label === '' ||
            (previous !== undefined &&
                previousHasFigure &&
                !previousName.startsWith('Total') &&
                label === previousName)
        if (!isLine) kept.push(record)
    }
    return kept
}
