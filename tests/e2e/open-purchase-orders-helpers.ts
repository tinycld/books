import { expect, type Page } from '@playwright/test'
import { OPEN_PURCHASE_ORDERS_TITLE } from '~/tinycld/books/lib/open-purchase-orders-fixture'
import { openPurchaseOrdersTab } from './purchase-order-helpers'

// Steps and row readers of the Open Purchase Orders e2e (purchase-orders checkpoint 6).
// They use the shared report, order and vendor helpers and change none of them.

// The report screen with its own title: the table, or the empty text when nothing is
// open.
async function expectOpenPurchaseOrdersShown(page: Page): Promise<void> {
    await expect(page.getByTestId('report-screen').filter({ visible: true })).toBeVisible()
    await expect(
        page
            .getByTestId('report-table')
            .or(page.getByTestId('report-empty'))
            .filter({ visible: true })
    ).toBeVisible()
    await expect(page.getByTestId('report-document-title').filter({ visible: true })).toHaveText(
        OPEN_PURCHASE_ORDERS_TITLE
    )
}

// The Purchase orders tab toolbar's report button: a ShippedReportButton whose id follows
// the toolbar's `${area.testIdPrefix}-<part>` ids (`purchases-range`, `purchases-sort`) and
// the list report button `products-sales-report`. A test id, not the text: a stacked list
// keeps a covered screen in the DOM.
export const PURCHASE_ORDERS_REPORT_BUTTON = 'purchases-open-orders-report'

// The Vendors list's Reports menu item of the report, fifth after Vendor Balance, A/P
// Aging, Expenses by Vendor and 1099 Summary and Detail (VendorsList.tsx `reportItems`).
export const VENDORS_OPEN_ORDERS_ITEM = 'vendors-reports-purchase-orders'

// Books must be open at a width that draws the sidebar. The Purchase orders tab of the
// Expenses area, then the tab toolbar's link to the report (spec §3.10:
// OPEN_PURCHASE_ORDERS_SHIPPED_KEY through useShippedReportHref).
export async function openOpenPurchaseOrders(page: Page): Promise<void> {
    await openPurchaseOrdersTab(page)
    const link = page.getByTestId(PURCHASE_ORDERS_REPORT_BUTTON).filter({ visible: true })
    await expect(link, 'the Purchase orders toolbar links Open Purchase Orders').toHaveText(
        OPEN_PURCHASE_ORDERS_TITLE
    )
    await link.click()
    await expectOpenPurchaseOrdersShown(page)
    await expect(page).toHaveURL(/\/a\/books\/reports\//)
}

// Books must be open on the Vendors list. Its Reports menu, then the item of the report.
export async function openOpenPurchaseOrdersFromVendors(page: Page): Promise<void> {
    const reports = page.getByTestId('vendors-reports').filter({ visible: true })
    await expect(reports).toBeVisible()
    await reports.click()
    const item = page.getByTestId(VENDORS_OPEN_ORDERS_ITEM).filter({ visible: true })
    await expect(item, "the Vendors list's Reports menu lists Open Purchase Orders").toHaveText(
        OPEN_PURCHASE_ORDERS_TITLE
    )
    await item.click()
    await expectOpenPurchaseOrdersShown(page)
    await expect(page).toHaveURL(/\/a\/books\/reports\//)
}

const QUANTITIES = ['ordered', 'received', 'open'] as const
const FIGURES = [...QUANTITIES, 'open_amount'] as const

type DrawnCell = {
    text: string
    top: number
    bottom: number
    left: number
    right: number
    // Neither the cell nor anything in it is cut (scrollWidth <= clientWidth).
    isUncut: boolean
}

type DrawnOrderRow = {
    label: { top: number; bottom: number }
    cells: Record<string, DrawnCell | null>
}

type DrawnOrderRows = {
    rows: Record<string, DrawnOrderRow | null>
    table: { left: number; right: number } | null
    sideways: string[]
}

// The label box and the four figure cells (report-cell-<column>-<row id>) of each row in
// `rowIds`, the table's edges and every box that scrolls sideways, in ONE page.evaluate
// (lesson 9). It measures `scrollWidth <= clientWidth` itself: expectTableFits measures
// `report-cell-amount-*`, a column this report does not have.
function readOrderRows(page: Page, rowIds: readonly string[]): Promise<DrawnOrderRows> {
    return page.evaluate(
        ({ ids, columns }) => {
            // A stacked screen keeps a hidden report table in the DOM: take the shown one.
            const table =
                [...document.querySelectorAll('[data-testid="report-table"]')].find(node =>
                    node.checkVisibility()
                ) ?? null
            // Row ids hold quotes and brackets, so nodes are keyed by test id, not selected.
            const byTestId = new Map<string, Element>()
            for (const node of table?.querySelectorAll('[data-testid^="report-"]') ?? []) {
                byTestId.set(node.getAttribute('data-testid') ?? '', node)
            }
            const isUncut = (node: Element) =>
                [node, ...node.querySelectorAll('*')].every(
                    e => !(e instanceof HTMLElement) || e.scrollWidth <= e.clientWidth
                )
            const rows: DrawnOrderRows['rows'] = {}
            for (const id of ids) {
                const label = byTestId.get(`report-row-${id}`)
                if (!label) {
                    rows[id] = null
                    continue
                }
                const box = label.getBoundingClientRect()
                const cells: DrawnOrderRow['cells'] = {}
                for (const column of columns) {
                    const cell = byTestId.get(`report-cell-${column}-${id}`)
                    if (!cell) {
                        cells[column] = null
                        continue
                    }
                    const rect = cell.getBoundingClientRect()
                    cells[column] = {
                        text: (cell as HTMLElement).innerText.trim(),
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        right: rect.right,
                        isUncut: isUncut(cell),
                    }
                }
                rows[id] = { label: { top: box.top, bottom: box.bottom }, cells }
            }
            const sideways: string[] = []
            if (table) {
                for (const node of [table, ...table.querySelectorAll('*')]) {
                    if (node.closest('[data-testid="report-controls"]') !== null) continue
                    const overflowX = getComputedStyle(node).overflowX
                    const scrolls = node === table || overflowX === 'auto' || overflowX === 'scroll'
                    if (scrolls && node.scrollWidth > node.clientWidth + 1) {
                        sideways.push(
                            `${node.getAttribute('data-testid') ?? node.tagName} (scrollWidth ${node.scrollWidth}, clientWidth ${node.clientWidth})`
                        )
                    }
                }
            }
            const scroller = document.scrollingElement ?? document.documentElement
            if (scroller.scrollWidth > scroller.clientWidth) {
                sideways.push(
                    `the page (scrollWidth ${scroller.scrollWidth}, clientWidth ${scroller.clientWidth})`
                )
            }
            const edges = table?.getBoundingClientRect()
            return {
                rows,
                table: edges ? { left: edges.left, right: edges.right } : null,
                sideways,
            }
        },
        { ids: [...rowIds], columns: [...FIGURES] }
    )
}

function cellProblems(name: string, cell: DrawnCell, table: { left: number; right: number }) {
    const problems: string[] = []
    if (!cell.isUncut) problems.push(`${name}: "${cell.text}" is cut`)
    if (cell.right > table.right + 1 || cell.left < table.left - 1) {
        problems.push(`${name}: "${cell.text}" lies outside the table`)
    }
    return problems
}

// What breaks the phone lines (OPEN_PURCHASE_ORDERS_DISPLAY's mobile layout) on one read;
// empty when they hold. The product line: line 1 the label and the Open amount, line 2
// Ordered, Received and Open side by side below it. The account line: one line, the label
// and the Open amount, with blank quantities.
function phoneLineProblems(read: DrawnOrderRows, productId: string, accountId: string): string[] {
    if (!read.table) return ['no report table']
    const table = read.table
    const problems: string[] = []
    const product = read.rows[productId]
    const account = read.rows[accountId]
    if (!product) problems.push(`the product line ${productId} is not mounted`)
    if (!account) problems.push(`the account line ${accountId} is not mounted`)
    if (!product || !account) return problems

    const amount = product.cells.open_amount
    const quantities = QUANTITIES.map(column => ({ column, cell: product.cells[column] }))
    if (!amount || amount.text === '') problems.push('the product line shows no Open amount')
    for (const { column, cell } of quantities) {
        if (!cell || cell.text === '') problems.push(`the product line shows no ${column}`)
    }
    if (!amount || amount.text === '' || problems.length > 0) return problems
    if (!(amount.top < product.label.bottom - 1)) {
        problems.push(
            `the product line's Open amount (top ${amount.top}) is not on line 1 with the label (bottom ${product.label.bottom})`
        )
    }
    const line1Bottom = Math.max(product.label.bottom, amount.bottom)
    const tops = quantities.map(({ cell }) => cell?.top ?? Number.NaN)
    if (Math.max(...tops) - Math.min(...tops) > 1) {
        problems.push(`the product line's quantities are not on one line: tops ${tops.join(', ')}`)
    }
    if (!(Math.min(...tops) >= line1Bottom - 1)) {
        problems.push(
            `the product line's quantities (top ${Math.min(...tops)}) are not below line 1 (bottom ${line1Bottom})`
        )
    }
    problems.push(...cellProblems('the product line Open amount', amount, table))
    for (const { column, cell } of quantities) {
        if (cell) problems.push(...cellProblems(`the product line ${column}`, cell, table))
    }

    const accountAmount = account.cells.open_amount
    if (!accountAmount || accountAmount.text === '') {
        problems.push('the account line shows no Open amount')
        return problems
    }
    if (!(accountAmount.top < account.label.bottom - 1)) {
        problems.push(
            `the account line's Open amount (top ${accountAmount.top}) is not on line 1 with the label (bottom ${account.label.bottom})`
        )
    }
    problems.push(...cellProblems('the account line Open amount', accountAmount, table))
    const accountBottom = Math.max(account.label.bottom, accountAmount.bottom)
    for (const column of QUANTITIES) {
        const cell = account.cells[column]
        if (!cell) continue
        if (cell.text !== '') problems.push(`the account line shows ${column} "${cell.text}"`)
        // A blank cell takes no second line: nothing of the row is drawn below line 1.
        if (cell.bottom - cell.top > 1 && cell.top >= accountBottom - 1) {
            problems.push(`the account line draws its blank ${column} on a second line`)
        }
    }
    for (const what of read.sideways) problems.push(`scrolls sideways: ${what}`)
    return problems
}

// Asserts the phone lines of an open order's product line and account line, each figure
// whole and inside the table, and that neither the table nor the page scrolls sideways.
// Polled: the layout settles a frame after a resize.
export async function expectOpenOrderPhoneLines(
    page: Page,
    rows: { product: string; account: string }
): Promise<void> {
    await expect
        .poll(
            async () =>
                phoneLineProblems(
                    await readOrderRows(page, [rows.product, rows.account]),
                    rows.product,
                    rows.account
                ),
            { message: 'the phone lines of the open order' }
        )
        .toEqual([])
}
