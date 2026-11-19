import { expect, type Page } from '@playwright/test'
import { hubRow } from '@tinycld/core/e2e-helpers'
import { AR_AGING_TITLE } from '~/tinycld/books/lib/ar-aging-fixture'
import {
    expectTableFits,
    openBooksReports,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { centsOf } from './customer-balance-helpers'
import { fakeReadOnlyAccess } from './tax-rates-helpers'

// Steps of the A/R Aging e2e (ar-aging plan): they import books-report-helpers.ts and
// customer-balance-helpers.ts and leave both unchanged.

// The fixed days of the e2e (plan: no document before 2026-07-01, As of set to fixed days).
// An invoice dated `invoice` and due `due` is 40 days past due on `aged40` (31 - 60), one
// day on `aged1` (1 - 30), not yet past due on `due` (Current), and not open on
// `beforeInvoice`. The invoices are posted on the shared e2e database and charge the
// default tax rate, so `invoice` is a day no report spec reads: not September 2026, the
// Sales Tax Liability's empty month, nor October 2026, its seeded month.
export const AR_DAY = {
    invoice: '2026-07-01',
    due: '2026-07-31',
    aged40: '2026-09-09',
    aged1: '2026-08-01',
    beforeInvoice: '2026-06-30',
} as const

// The shipped A/R Aging from the Books hub, reached as openCustomerBalance reaches the
// Customer Balance: Reports in the Books sidebar, then the hub row, through the viewer share
// Books keeps. It has an empty state, so the table or the empty text shows.
export async function openArAging(page: Page): Promise<void> {
    await openBooksReports(page)
    const row = hubRow(page, AR_AGING_TITLE).filter({
        has: page.getByText(AR_AGING_TITLE, { exact: true }),
    })
    await expect(row, `the Books hub lists ${AR_AGING_TITLE}`).toBeVisible()
    await row.click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// Presses the group row labelled exactly `label` (a customer or an item) and waits, in one
// snapshot, until the row right after it is one depth or more deeper: its items or lines.
export async function openAgingRow(page: Page, label: string): Promise<void> {
    await page
        .getByTestId('report-table')
        .locator('[data-testid^="report-row-"]')
        .filter({ has: page.getByText(label, { exact: true }) })
        .click()
    await snapshotWhen(
        page,
        reportSnapshot,
        snapshot => {
            const at = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
            const next = snapshot.rows[at + 1]
            return at >= 0 && next !== undefined && next.depth > snapshot.rows[at].depth
        },
        `the row ${label} opens`
    )
}

// The one mounted row labelled exactly `label`; throws when none or more than one.
export function agingRow(snapshot: ReportSnapshot, label: string): ReportSnapshot['rows'][number] {
    const found = snapshot.rows.filter(row => row.label === label)
    if (found.length !== 1) {
        throw new Error(
            `${found.length} rows labelled "${label}", want one; rows ${JSON.stringify(
                snapshot.rows.map(row => row.label)
            )}`
        )
    }
    return found[0]
}

export type AgedCents = Record<'current' | 'd30' | 'd60' | 'd90' | 'd91' | 'total', number | null>

// A row's five age cells and Total in cents; a blank cell is null.
export function agedCents(row: ReportSnapshot['rows'][number]): AgedCents {
    const cents = (text: string | undefined) =>
        text === undefined || text.trim() === '' ? null : centsOf(text)
    return {
        current: cents(row.cells.current),
        d30: cents(row.cells.d30),
        d60: cents(row.cells.d60),
        d90: cents(row.cells.d90),
        d91: cents(row.cells.d91),
        total: cents(row.cells.total),
    }
}

// A PocketBase list answer of `items` for the page and perPage the read asks for. A copy
// of the one in books-sales-reports.spec.ts, which does not export it (plan: that spec's
// helper is not edited).
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
 * sent to the page). A copy of `freshPageWithReports` in books-sales-reports.spec.ts,
 * which does not export it.
 */
export async function freshPageWithReports(
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

type Box = { left: number; right: number; top: number; bottom: number }

// One mounted row of the report table as drawn on a phone: the box of its label's text
// and its drawn lines, the box of each cell it draws, which of its texts are cut, and the right edge of
// its content (its box less its right padding).
interface DrawnAgingRow {
    id: string
    label: string
    labelBox: Box
    labelLines: number
    cells: Record<string, { box: Box; text: string; cut: boolean; wraps: boolean }>
    contentRight: number
}

interface DrawnAgingRows {
    rows: DrawnAgingRow[]
    pageScrollWidth: number
    pageClientWidth: number
}

// Every mounted row of the report table, read in ONE pass (lesson 9). A label's lines are
// counted from the drawn boxes of its text (a Range's client rects): core clamps a wrapped
// label with line-clamp, which hides the lines past the clamp but still lays them out, so
// a label that needs four lines counts four. A text is cut when an element in it is wider
// than its box (scrollWidth > clientWidth); a figure or a Due date is also cut when its
// text is drawn on more than one line ("Jul 31," / "2026"): a figure never wraps (spec
// Wide, `minWidth: "max-content"`). A row's box is the nearest element that holds its
// label and all its cells.
function readAgingRows(page: Page): Promise<DrawnAgingRows> {
    return page.evaluate(() => {
        const ONE_LINE_COLUMNS = ['due', 'current', 'd30', 'd60', 'd90', 'd91', 'total']
        const boxOf = (element: Element) => {
            const rect = element.getBoundingClientRect()
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        }
        const isCut = (element: Element) =>
            [element, ...element.querySelectorAll('*')].some(
                node => node instanceof HTMLElement && node.scrollWidth > node.clientWidth
            )
        // The drawn boxes of every text in `element`, one or more per line it takes.
        const textRects = (element: Element) => {
            const rects: DOMRect[] = []
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
            for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                if (!text.textContent?.trim()) continue
                const range = document.createRange()
                range.selectNodeContents(text)
                for (const rect of range.getClientRects()) {
                    if (rect.width > 0 && rect.height > 0) rects.push(rect)
                }
            }
            return rects
        }
        // The lines a text takes: its boxes grouped by their top (one box per line of a
        // wrapped text node, more on a line only where the text is split into nodes).
        const linesOfText = (element: Element) => {
            const tops: number[] = []
            for (const rect of textRects(element)) {
                if (!tops.some(top => Math.abs(top - rect.top) < rect.height / 2)) {
                    tops.push(rect.top)
                }
            }
            return tops.length
        }
        // The deepest element that holds the whole text of `element`: a label's text,
        // whose box is its drawn lines (the label's own box grows to fill its slot).
        const textElementOf = (element: Element): HTMLElement | null => {
            const whole = (element.textContent ?? '').trim()
            if (whole === '') return null
            let text: HTMLElement | null = null
            for (const node of element.querySelectorAll('*')) {
                if (node instanceof HTMLElement && (node.textContent ?? '').trim() === whole) {
                    text = node
                }
            }
            return text
        }
        const table = document.querySelector('[data-testid="report-table"]')
        // Row ids hold quotes and brackets, so cells are keyed by id, not selected by it.
        const CELL = 'report-cell-'
        const cellsByRow = new Map<string, Map<string, Element>>()
        for (const cell of table?.querySelectorAll(`[data-testid^="${CELL}"]`) ?? []) {
            const rest = (cell.getAttribute('data-testid') ?? '').slice(CELL.length)
            const dash = rest.indexOf('-')
            const rowId = rest.slice(dash + 1)
            const byCol = cellsByRow.get(rowId) ?? new Map<string, Element>()
            byCol.set(rest.slice(0, dash), cell)
            cellsByRow.set(rowId, byCol)
        }
        const rows: DrawnAgingRow[] = []
        for (const label of table?.querySelectorAll('[data-testid^="report-row-"]') ?? []) {
            const id = (label.getAttribute('data-testid') ?? '').slice('report-row-'.length)
            const own = cellsByRow.get(id) ?? new Map<string, Element>()
            let row: Element = label
            while (row.parentElement && [...own.values()].some(cell => !row.contains(cell))) {
                row = row.parentElement
            }
            const cells: DrawnAgingRow['cells'] = {}
            for (const [col, cell] of own) {
                const box = boxOf(cell)
                if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue
                const wraps = ONE_LINE_COLUMNS.includes(col) && linesOfText(cell) > 1
                cells[col] = {
                    box,
                    text: (cell.textContent ?? '').trim(),
                    cut: isCut(cell),
                    wraps,
                }
            }
            const padding = Number.parseFloat(getComputedStyle(row).paddingRight) || 0
            const labelText = textElementOf(label)
            rows.push({
                id,
                label: (label.textContent ?? '').trim(),
                labelBox: boxOf(labelText ?? label),
                labelLines: linesOfText(labelText ?? label),
                cells,
                contentRight: row.getBoundingClientRect().right - padding,
            })
        }
        rows.sort((a, b) => a.labelBox.top - b.labelBox.top)
        const scroller = document.scrollingElement ?? document.documentElement
        return {
            rows,
            pageScrollWidth: scroller.scrollWidth,
            pageClientWidth: scroller.clientWidth,
        }
    })
}

// A row's kind from core's row id (as reportSnapshot reads it).
const ROW_KINDS = [
    ['g:', 'group'],
    ['d:', 'detail'],
    ['s:', 'subtotal'],
    ['total', 'total'],
] as const
type AgingRowKind = (typeof ROW_KINDS)[number][1] | 'other'

function agingRowKind(id: string): AgingRowKind {
    return ROW_KINDS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? 'other'
}

const rowName = (row: DrawnAgingRow) => `${agingRowKind(row.id)} row "${row.label.slice(0, 40)}"`

// An item row is a group row with a Due date: only items have one.
const isItemRow = (row: DrawnAgingRow) =>
    agingRowKind(row.id) === 'group' && (row.cells.due?.text ?? '') !== ''

// Every row: its label at most three lines, no cell text cut.
function textProblems(row: DrawnAgingRow): string[] {
    const problems: string[] = []
    if (row.labelLines > 3) {
        problems.push(`${rowName(row)}: its label takes ${row.labelLines} lines`)
    }
    for (const [col, cell] of Object.entries(row.cells)) {
        if (cell.cut) problems.push(`${rowName(row)}: its ${col} text "${cell.text}" is cut`)
        if (cell.wraps) {
            problems.push(`${rowName(row)}: its ${col} text "${cell.text}" wraps to two lines`)
        }
    }
    return problems
}

// An item row: its Due date on the label's line, right of the label.
function dueProblems(row: DrawnAgingRow): string[] {
    const due = row.cells.due
    if (!due) return []
    const problems: string[] = []
    const sameLine = due.box.top < row.labelBox.bottom && due.box.bottom > row.labelBox.top
    if (!sameLine) {
        problems.push(
            `${rowName(row)}: its Due date (top ${due.box.top}) is not on the label's line (${row.labelBox.top} to ${row.labelBox.bottom})`
        )
    }
    if (due.box.left < row.labelBox.right - 1) {
        problems.push(`${rowName(row)}: its Due date is not right of the label`)
    }
    return problems
}

// A row with figures: Total on the line below the label's, in the third track (at the
// row's right padding), Current on Total's line left of it, 31 - 60 on the line below.
function figureProblems(row: DrawnAgingRow): string[] {
    const name = rowName(row)
    const total = row.cells.total
    if (!total) return [`${name} has no Total cell`]
    const problems: string[] = []
    const labelLineBottom = Math.max(row.labelBox.bottom, row.cells.due?.box.bottom ?? 0)
    if (total.box.top < labelLineBottom - 1) {
        problems.push(
            `${name}: its Total (top ${total.box.top}) is not on the line below the label's (bottom ${labelLineBottom})`
        )
    }
    if (Math.abs(total.box.right - row.contentRight) > 1) {
        problems.push(
            `${name}: its Total ends at ${total.box.right}, not at the row's right padding ${row.contentRight}`
        )
    }
    const current = row.cells.current
    if (current && Math.abs(current.box.top - total.box.top) > 1) {
        problems.push(
            `${name}: Current (top ${current.box.top}) is not on Total's line (top ${total.box.top})`
        )
    }
    if (current && current.box.right > total.box.left + 1) {
        problems.push(`${name}: Current is not left of Total`)
    }
    const d60 = row.cells.d60
    if (d60 && d60.box.top < total.box.bottom - 1) {
        problems.push(
            `${name}: 31 - 60 (top ${d60.box.top}) is not on the line below Total's (bottom ${total.box.bottom})`
        )
    }
    return problems
}

// What is wrong with the drawn rows against the phone arrangement (spec §3 Phone, F1),
// in words; empty when every row fits. Each kind the flow mounts must be checked at least
// once, so the checks cannot pass on no row.
function agingLineProblems(read: DrawnAgingRows, wrappedLabel?: string): string[] {
    const problems: string[] = []
    if (wrappedLabel !== undefined) {
        const wrapped = read.rows.find(row => row.label === wrappedLabel)
        if (!wrapped) problems.push(`no row is labelled "${wrappedLabel}"`)
        else if (wrapped.labelLines < 2) {
            problems.push(
                `${rowName(wrapped)}: its label takes ${wrapped.labelLines} line, not two or more`
            )
        }
    }
    const checked = { item: 0, group: 0, detail: 0, total: 0 }
    for (const row of read.rows) {
        const kind = agingRowKind(row.id)
        problems.push(...textProblems(row))
        if (isItemRow(row)) {
            checked.item++
            problems.push(...dueProblems(row))
        }
        if (kind === 'other') continue
        if (kind === 'subtotal') checked.group++
        else checked[kind]++
        problems.push(...figureProblems(row))
    }
    if (checked.item === 0) problems.push('no item row (a group row with a Due date) is mounted')
    if (checked.group === 0) problems.push('no group row is mounted')
    if (checked.detail === 0) problems.push('no line (detail row) is mounted')
    if (checked.total === 0) problems.push('no Total row is mounted')
    if (read.pageScrollWidth > read.pageClientWidth) {
        problems.push(
            `the page scrolls sideways (scrollWidth ${read.pageScrollWidth}, clientWidth ${read.pageClientWidth})`
        )
    }
    return problems
}

/**
 * Asserts the A/R Aging rows keep the phone arrangement (spec §3 "Phone and narrow
 * widths", F1): an item's Due date on its label's line, right of the label; the Total of
 * every group, subtotal, line and Total row on the first figures line (below the label's),
 * in the third track (ending at the row's right padding), with Current on that line left
 * of it and 31 - 60 on the line below; no text cut; every label at most three lines; and
 * neither the page nor the table scrolls sideways. With `wrappedLabel`, the row of that
 * label must take two or more lines, so the three-line check is made on a wrapped label.
 * Polled: the layout settles a frame after a resize or a press; each poll is one read of
 * every mounted row.
 */
export async function expectAgingLinesFit(
    page: Page,
    options: { wrappedLabel?: string } = {}
): Promise<void> {
    await expect
        .poll(async () => agingLineProblems(await readAgingRows(page), options.wrappedLabel), {
            message: 'the A/R Aging rows keep the phone arrangement',
        })
        .toEqual([])
    await expectTableFits(page)
}
