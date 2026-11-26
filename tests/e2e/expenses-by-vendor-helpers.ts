import { expect, type Locator, type Page } from '@playwright/test'
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
import { openBooksReports, type ReportSnapshot, reportLinesUnder } from './books-report-helpers'
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
 * lines added with Add account line, and the bill's `memo` when one is given (saved as the
 * journal entry memo, which the report's lines show as their description). Returns the
 * bill's id and number.
 */
export async function postBillOnAccounts(
    page: Page,
    vendor: string,
    lines: readonly { account: string; amount: string }[],
    options: { memo?: string } = {}
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
    if (options.memo !== undefined) await page.getByTestId('form-input-memo').fill(options.memo)
    const number = await postBill(page)
    return { id: await billIdFromUrl(page), number }
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

// The opened lines under the vendor row labelled `label` (expenses-by-vendor checkpoint
// 2): each line's row id, label, Total in cents and % of expenses text (blank on a line).
export function expenseLines(
    snapshot: ReportSnapshot,
    label: string
): { id: string; label: string; cents: number; share: string }[] {
    return reportLinesUnder(snapshot, label).map(row => ({
        id: row.id,
        label: row.label,
        cents: centsOf(row.cells.amount ?? ''),
        share: (row.cells.pct ?? '').trim(),
    }))
}

// The color the label text of the row `rowId` is drawn in: the color of the first element
// that holds the text itself (a group row's label starts with its caret icon, whose color
// is the caret's, not the text's).
export function rowLabelColor(page: Page, rowId: string): Promise<string> {
    return textColorIn(page.getByTestId('report-table').getByTestId(`report-row-${rowId}`))
}

// The color core draws a column heading's text in: its `text-muted-foreground` token
// (core ReportTable HeadingText), the token a muted group row's label uses (ReportRow
// labelTone).
export function mutedHeadingColor(page: Page, columnId: string): Promise<string> {
    return textColorIn(page.getByTestId('report-table').getByTestId(`report-heading-${columnId}`))
}

// The computed color of the first element under `scope` that holds text itself.
function textColorIn(scope: Locator): Promise<string> {
    return scope.evaluate(element => {
        const holdsText = (candidate: Element) =>
            [...candidate.childNodes].some(
                node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''
            )
        const leaf = [element, ...element.querySelectorAll('*')].find(holdsText)
        if (!leaf) throw new Error('the element holds no text')
        return getComputedStyle(leaf).color
    })
}

// How the label of each row in `rowIds` is drawn, read in ONE pass (lesson 11): its text,
// its drawn lines (the text box's height over its line height: a clamped label's hidden
// lines still have boxes) and whether any element of the label shows less than its content
// (wider or taller than its box: an ellipsis on one line, or a clamp).
function readRowLabels(
    page: Page,
    rowIds: readonly string[]
): Promise<{ id: string; text: string; lines: number; cut: boolean }[]> {
    return page.evaluate(ids => {
        const table = document.querySelector('[data-testid="report-table"]')
        // Row ids hold quotes and brackets, so labels are keyed by test id, not selected.
        const labels = new Map<string, Element>()
        for (const node of table?.querySelectorAll('[data-testid^="report-row-"]') ?? []) {
            labels.set((node.getAttribute('data-testid') ?? '').slice('report-row-'.length), node)
        }
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
        return ids.map(id => {
            const label = labels.get(id)
            const text = label ? textElementOf(label) : null
            if (!label || !text) return { id, text: '', lines: 0, cut: false }
            const style = getComputedStyle(text)
            const parsed = Number.parseFloat(style.lineHeight)
            const lineHeight = Number.isNaN(parsed)
                ? Number.parseFloat(style.fontSize) * 1.2
                : parsed
            const cut = [label, ...label.querySelectorAll('*')].some(
                node =>
                    node instanceof HTMLElement &&
                    (node.scrollWidth > node.clientWidth + 1 ||
                        node.scrollHeight > node.clientHeight + 1)
            )
            return {
                id,
                text: (text.textContent ?? '').replace(/\s+/g, ' ').trim(),
                lines: Math.round(text.getBoundingClientRect().height / lineHeight),
                cut,
            }
        })
    }, rowIds)
}

/**
 * Spec §3 "Phone": the label of each row in `rowIds` wraps (two or three drawn lines) and
 * shows its whole text (no ellipsis, no clamp). Polled: the layout settles a frame after a
 * resize or a press; each poll is one read.
 */
export async function expectLabelsWrapWhole(page: Page, rowIds: readonly string[]): Promise<void> {
    await expect
        .poll(
            async () =>
                (await readRowLabels(page, rowIds)).flatMap(label => {
                    const name = `row ${label.id} "${label.text.slice(0, 40)}"`
                    const problems: string[] = []
                    if (label.text === '') return [`row ${label.id} has no mounted label`]
                    if (label.lines < 2 || label.lines > 3) {
                        problems.push(`${name}: its label takes ${label.lines} line(s), not 2 or 3`)
                    }
                    if (label.cut) problems.push(`${name}: its label is cut`)
                    return problems
                }),
            { message: 'each label wraps onto 2 or 3 lines and shows its whole text' }
        )
        .toEqual([])
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
