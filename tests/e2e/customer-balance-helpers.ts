import { expect, type Page } from '@playwright/test'
import { chooseParamOption, hubRow } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_BALANCE_TITLE } from '~/tinycld/books/lib/customer-balance-fixture'
import {
    csvRecords,
    expectTableFits,
    exportReport,
    openBooksReports,
    reportLinesUnder,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'

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

/**
 * Narrows the open report to the customers named, through core's Customer picker, as
 * chooseAgencies does for the Sales Tax Liability: an unset Customer has no chip (core lists
 * it under Add filter), so the first name starts from Add filter and each later one from the
 * chip, each found through the picker's search. It then waits until the URL holds the pick
 * and the mounted group rows are only those customers, with the Total: core keeps the
 * previous run's rows until the new run lands. The names must be customers with no
 * sub-customer lines (each is one plain row).
 */
export async function filterToCustomers(page: Page, names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) {
        await chooseParamOption(page, 'customers', {
            from: index === 0 ? 'add-filter' : 'chip',
            search: name,
            labels: [name],
        })
    }
    await expect.poll(() => new URL(page.url()).searchParams.get('p-customers')).not.toBeNull()
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
        `the rows show only the customers ${wanted.join(', ')} and the Total`
    )
}

const BALANCE_ORDER_LABELS = { name: 'Name', balance: 'Largest balance' } as const

// Sets Order through its chip (it has a default, so the chip shows) and waits until the URL
// holds the new value and the chip shows its label.
export async function chooseBalanceOrder(
    page: Page,
    choice: keyof typeof BALANCE_ORDER_LABELS
): Promise<void> {
    const label = BALANCE_ORDER_LABELS[choice]
    await chooseParamOption(page, 'order', { from: 'chip', labels: [label] })
    await expect.poll(() => new URL(page.url()).searchParams.get('p-order') ?? 'name').toBe(choice)
    await expect(page.getByTestId('report-param-order')).toContainText(label)
}

// Presses the customer row labelled `label` and waits until a line row (core `d:` row)
// shows under it. It presses the first row with that label, so a parent's name opens the
// family header, not the parent's own row (they share the label); pass a customer with no
// sub-customers or a sub-customer.
export async function openBalanceRow(page: Page, label: string): Promise<void> {
    await page
        .getByTestId('report-table')
        .locator('[data-testid^="report-row-"]')
        .filter({ has: page.getByText(label, { exact: true }) })
        .first()
        .click()
    await expect
        .poll(async () =>
            reportLinesUnder(await reportSnapshot(page), label).map(row => row.id.slice(0, 2))
        )
        .toContainEqual('d:')
}

// One mounted row of the report table as drawn: its row, label and Balance boxes, the
// label's drawn lines, and whether the label and the Balance show their whole text.
interface DrawnBalanceRow {
    id: string
    label: string
    balance: string
    row: { left: number; right: number; top: number; bottom: number }
    labelBox: { left: number; right: number; top: number; bottom: number }
    balanceBox: { left: number; right: number; top: number; bottom: number } | null
    labelLines: number
    labelCut: boolean
    balanceCut: boolean
}

interface DrawnBalanceRows {
    rows: DrawnBalanceRow[]
    pageScrollWidth: number
    pageClientWidth: number
}

// Every mounted row of the report table, read in ONE pass (lesson 11). A label's lines are
// its text box's height over its line height: core clamps a wrapped label with
// line-clamp, whose hidden lines still have boxes, so the text's own rects would count
// them. A box is cut when its content is wider (or, for a clamped label, taller) than it.
function readBalanceRows(page: Page): Promise<DrawnBalanceRows> {
    return page.evaluate(() => {
        const boxOf = (element: Element) => {
            const rect = element.getBoundingClientRect()
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        }
        // The deepest element that holds the whole text of `element`.
        const textElementOf = (element: Element): HTMLElement | null => {
            const whole = (element.textContent ?? '').trim()
            if (whole === '') return null
            let found: HTMLElement | null = element instanceof HTMLElement ? element : null
            for (const node of element.querySelectorAll('*')) {
                if (node instanceof HTMLElement && (node.textContent ?? '').trim() === whole) {
                    found = node
                }
            }
            return found
        }
        const isCut = (element: HTMLElement | null) =>
            element !== null &&
            [element, ...element.querySelectorAll('*')].some(
                node =>
                    node instanceof HTMLElement &&
                    (node.scrollWidth > node.clientWidth + 1 ||
                        node.scrollHeight > node.clientHeight + 1)
            )
        const linesOf = (element: HTMLElement | null) => {
            if (!element) return 0
            const style = getComputedStyle(element)
            const parsed = Number.parseFloat(style.lineHeight)
            const lineHeight = Number.isNaN(parsed)
                ? Number.parseFloat(style.fontSize) * 1.2
                : parsed
            return Math.round(element.getBoundingClientRect().height / lineHeight)
        }
        const table = document.querySelector('[data-testid="report-table"]')
        // Row ids hold quotes and brackets, so the cells are keyed by id, not selected by it.
        const BALANCE_CELL = 'report-cell-balance-'
        const cells = new Map<string, Element>()
        for (const cell of table?.querySelectorAll(`[data-testid^="${BALANCE_CELL}"]`) ?? []) {
            cells.set((cell.getAttribute('data-testid') ?? '').slice(BALANCE_CELL.length), cell)
        }
        const rows: DrawnBalanceRow[] = []
        for (const label of table?.querySelectorAll('[data-testid^="report-row-"]') ?? []) {
            const id = (label.getAttribute('data-testid') ?? '').slice('report-row-'.length)
            const cell = cells.get(id) ?? null
            // The row: the nearest box that holds both the label and its Balance.
            let row: Element = label
            while (cell && row.parentElement && !row.contains(cell)) row = row.parentElement
            const labelText = textElementOf(label)
            const balanceText = cell ? textElementOf(cell) : null
            rows.push({
                id,
                label: (label.textContent ?? '').trim(),
                balance: (cell?.textContent ?? '').trim(),
                row: boxOf(row),
                labelBox: boxOf(label),
                balanceBox: cell ? boxOf(cell) : null,
                labelLines: linesOf(labelText),
                labelCut: labelText !== null && linesOf(labelText) < 3 && isCut(labelText),
                balanceCut: isCut(balanceText),
            })
        }
        rows.sort((a, b) => a.row.top - b.row.top)
        const scroller = document.scrollingElement ?? document.documentElement
        return {
            rows,
            pageScrollWidth: scroller.scrollWidth,
            pageClientWidth: scroller.clientWidth,
        }
    })
}

// What the phone check asks beyond every row fitting (vendor-balance plan D12): a
// family header on two or three lines (the default, the Customer Balance), and the row
// labelled `wrappedLabel` on two or three lines (a report with no family, the Vendor
// Balance, names its long vendor here).
export interface BalanceRowsFitOptions {
    familyHeader?: boolean
    wrappedLabel?: string
}

// What is wrong with the drawn rows, in words; empty when every row fits.
function balanceRowProblems(
    read: DrawnBalanceRows,
    options: BalanceRowsFitOptions = { familyHeader: true }
): string[] {
    const problems: string[] = []
    if (read.rows.length === 0) problems.push('no report row is mounted')
    const labels = new Set(read.rows.map(row => row.label))
    // A family's header: the group row whose "Total <name>" row is mounted. Open, it
    // leaves its figure to that total, so core draws it no Balance cell.
    const isFamilyHeader = (row: DrawnBalanceRows['rows'][number]) =>
        row.id.startsWith('g:') && row.balance === '' && labels.has(`Total ${row.label}`)
    // The 2-to-3-line check below runs only on these rows; with none it would pass unseen.
    const familyHeaders = read.rows.filter(isFamilyHeader).length
    if (options.familyHeader !== false && familyHeaders === 0) {
        problems.push(
            'no family header (no figure, its total mounted) was checked for 2 or 3 lines'
        )
    }
    if (options.wrappedLabel !== undefined) {
        const wanted = options.wrappedLabel
        const wrapped = read.rows.filter(row => row.label === wanted)
        if (wrapped.length === 0) {
            problems.push(`no mounted row is labelled "${wanted.slice(0, 40)}"`)
        }
        for (const row of wrapped) {
            if (row.labelLines < 2 || row.labelLines > 3) {
                problems.push(
                    `row ${row.id} "${wanted.slice(0, 40)}": its label takes ${row.labelLines} line(s), not 2 or 3`
                )
            }
        }
    }
    for (const row of read.rows) {
        const name = `row ${row.id} "${row.label.slice(0, 40)}"`
        if (isFamilyHeader(row) && row.labelLines < 2) {
            problems.push(`${name}: the family header takes ${row.labelLines} line, not 2 or 3`)
        }
        if (row.labelLines > 3) problems.push(`${name}: its label takes ${row.labelLines} lines`)
        if (row.labelCut) problems.push(`${name}: its label is cut before three lines`)
        const balance = row.balanceBox
        if (!balance) {
            if (!isFamilyHeader(row)) problems.push(`${name} has no Balance cell`)
            continue
        }
        const inside =
            balance.left >= row.row.left - 1 &&
            balance.right <= row.row.right + 1 &&
            balance.top >= row.row.top - 1 &&
            balance.bottom <= row.row.bottom + 1
        if (!inside) problems.push(`${name}: its Balance lies outside the row`)
        if (balance.left < row.labelBox.right - 1) {
            problems.push(`${name}: its Balance is not right of the label`)
        }
        const oneBand = balance.top < row.labelBox.bottom && balance.bottom > row.labelBox.top
        if (!oneBand) problems.push(`${name}: its Balance is not on the label's line band`)
        if (row.balance !== '') {
            if (row.balanceCut) problems.push(`${name}: its Balance "${row.balance}" is cut`)
            if (!/\d\)?$/.test(row.balance)) {
                problems.push(`${name}: its Balance "${row.balance}" does not end in a digit`)
            }
        }
    }
    if (read.pageScrollWidth > read.pageClientWidth) {
        problems.push(
            `the page scrolls sideways (scrollWidth ${read.pageScrollWidth}, clientWidth ${read.pageClientWidth})`
        )
    }
    return problems
}

/**
 * Asserts the Customer Balance fits a phone (spec §3 "Phone"): every mounted row (an open
 * family header has no Balance cell) has its label and its Balance on one line band, the Balance inside the row and right of the
 * label, its text whole and ending in the figure's last digit; every label at most three
 * lines and not cut before the third; a family's header label (a long parent name) on two
 * or three lines, unless `options.familyHeader` is false; the row labelled
 * `options.wrappedLabel`, when given, on two or three lines; and nothing scrolls sideways.
 * Polled: the layout settles a frame after a resize or a press; each poll is one read.
 */
export async function expectBalanceRowsFit(
    page: Page,
    options: BalanceRowsFitOptions = { familyHeader: true }
): Promise<void> {
    await expect
        .poll(async () => balanceRowProblems(await readBalanceRows(page), options), {
            message: 'the balance report rows fit the phone',
        })
        .toEqual([])
    await expectTableFits(page)
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
