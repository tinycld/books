import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    choosePreset,
    DESKTOP,
    hasNoPageScrollX,
    openTrialBalance,
    PHONE,
} from './report-shell-helpers'

// The one table renderer, read through the Trial Balance on the "Today" preset: column
// labels, row kinds, money cells, and the wide and phone column layouts.
//
// Nothing here writes data. Other specs post entries dated today on the shared database, so
// no assertion names an amount or a total: the figures are checked for format and for
// consistency with each other (the detail cells sum to the total). Those figures can change
// while the test reads them, so the money checks re-read the whole table in one page.evaluate
// on every poll. They run at a tall viewport with the total row mounted first, so the row
// window holds every row: a book with more rows than the window fails at that assertion, not
// with a wrong sum.
// Folding, section and subtotal styles, windowing and the phone layout with three or more
// amount columns have no report to drive them in this unit (see the plan's "Not reachable").

const SHOWN_TOTAL = /^\$[\d,]+\.\d{2}$/
const BARE_AMOUNT = /^[\d,]+\.\d{2}$/
const TOTAL_ROW_ID = 'total'
// Tall enough that the row window (about 67 rows of 44) holds the whole Trial Balance.
const TALL = { width: 1280, height: 2400 }

type TableRow = { id: string; label: string; debit: string | null; credit: string | null }

// Every row the table draws, in order, with the text of its label and its two amount cells
// (null when the cell is missing).
async function readRows(page: Page): Promise<TableRow[]> {
    return page.evaluate(() => {
        const text = (testId: string) =>
            document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null
        return Array.from(document.querySelectorAll('[data-testid^="report-row-"]')).map(el => {
            const id = (el.getAttribute('data-testid') ?? '').slice('report-row-'.length)
            return {
                id,
                label: el.textContent ?? '',
                debit: text(`report-cell-debit-${id}`),
                credit: text(`report-cell-credit-${id}`),
            }
        })
    })
}

const cents = (shown: string) => Math.round(Number(shown.replace(/[$,]/g, '')) * 100)

const sumCents = (values: (string | null)[]) =>
    values.reduce((sum, value) => (value ? sum + cents(value) : sum), 0)

const isBareOrEmpty = (value: string | null) =>
    value === '' || (value !== null && BARE_AMOUNT.test(value))

// The money checks on one read of the table: detail rows show bare numbers, one side each;
// the total shows the symbol, balances, and is the sum of the detail cells in whole cents.
async function moneyConsistency(page: Page) {
    const rows = await readRows(page)
    const details = rows.filter(row => row.id !== TOTAL_ROW_ID)
    const total = rows.find(row => row.id === TOTAL_ROW_ID)
    const totalDebit = total?.debit ?? ''
    const totalCredit = total?.credit ?? ''
    return {
        hasDetails: details.length > 0,
        notBare: details
            .filter(row => !isBareOrEmpty(row.debit) || !isBareOrEmpty(row.credit))
            .map(row => row.id),
        notOneSide: details
            .filter(row => [row.debit, row.credit].filter(Boolean).length !== 1)
            .map(row => row.id),
        totalDebitShown: SHOWN_TOTAL.test(totalDebit),
        totalCreditShown: SHOWN_TOTAL.test(totalCredit),
        totalsEqual: totalDebit === totalCredit,
        debitSumIsTotal: sumCents(details.map(row => row.debit)) === cents(totalDebit),
        creditSumIsTotal: sumCents(details.map(row => row.credit)) === cents(totalCredit),
    }
}

// The computed style of the element that draws a cell's figure: the cell itself when it is
// the text element, else its innermost first descendant.
async function amountTextStyles(page: Page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid^="report-cell-"]'))
            .filter(cell => (cell.textContent ?? '') !== '')
            .map(cell => {
                let node: Element = cell
                while (node.firstElementChild) node = node.firstElementChild
                const style = getComputedStyle(node)
                return {
                    id: cell.getAttribute('data-testid'),
                    textAlign: style.textAlign,
                    fontVariantNumeric: style.fontVariantNumeric,
                }
            })
    )
}

// For one amount column: cells whose width is off by more than 1 from `width`, and how many
// distinct right edges the column has.
async function amountColumn(page: Page, columnId: string, width: number) {
    return page.evaluate(
        ({ columnId, width }) => {
            const boxes = Array.from(
                document.querySelectorAll(`[data-testid^="report-cell-${columnId}-"]`)
            ).map(cell => cell.getBoundingClientRect())
            return {
                hasCells: boxes.length > 0,
                offWidths: boxes.map(box => box.width).filter(w => Math.abs(w - width) > 1),
                rightEdges: new Set(boxes.map(box => Math.round(box.right))).size,
            }
        },
        { columnId, width }
    )
}

async function rowLabelHeights(page: Page) {
    return page.evaluate(() => [
        ...new Set(
            Array.from(document.querySelectorAll('[data-testid^="report-row-"]')).map(row =>
                Math.round(row.getBoundingClientRect().height)
            )
        ),
    ])
}

async function minRowLabelWidth(page: Page) {
    return page.evaluate(() =>
        Math.min(
            ...Array.from(document.querySelectorAll('[data-testid^="report-row-"]')).map(
                row => row.getBoundingClientRect().width
            )
        )
    )
}

async function headingAboveFirstRow(page: Page) {
    return page.evaluate(() => {
        const heading = document.querySelector('[data-testid="report-heading-row"]')
        const first = document.querySelector('[data-testid^="report-row-"]')
        if (!heading || !first) return false
        return heading.getBoundingClientRect().bottom <= first.getBoundingClientRect().top + 1
    })
}

async function hasScrollingAncestor(page: Page, testId: string) {
    return page.getByTestId(testId).evaluate(el => {
        for (let node = el.parentElement; node; node = node.parentElement) {
            const overflowY = getComputedStyle(node).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') return true
        }
        return false
    })
}

// The nearest ancestor of the first row label that scrolls vertically: its overflow-y and
// whether its content is taller than it.
async function rowsScroller(page: Page) {
    return page.evaluate(() => {
        const first = document.querySelector('[data-testid^="report-row-"]')
        for (let node = first?.parentElement; node; node = node.parentElement) {
            const overflowY = getComputedStyle(node).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') {
                return { overflowY, overflows: node.scrollHeight > node.clientHeight }
            }
        }
        return { overflowY: 'none', overflows: false }
    })
}

async function tableMatchesDocumentHeader(page: Page) {
    return page.evaluate(() => {
        const table = document.querySelector('[data-testid="report-table"]')
        const header = document.querySelector('[data-testid="report-document-header"]')
        if (!table || !header) return { dx: Number.NaN, dWidth: Number.NaN }
        const a = table.getBoundingClientRect()
        const b = header.getBoundingClientRect()
        return { dx: Math.abs(a.left - b.left), dWidth: Math.abs(a.width - b.width) }
    })
}

// Phone: where the first row label sits against the table, and how far each credit cell's
// right edge is from the table's right edge.
async function phoneEdges(page: Page) {
    return page.evaluate(() => {
        const table = document.querySelector('[data-testid="report-table"]')
        const label = document.querySelector('[data-testid^="report-row-"]')
        if (!table || !label) return null
        const t = table.getBoundingClientRect()
        const l = label.getBoundingClientRect()
        const creditGaps = Array.from(
            document.querySelectorAll('[data-testid^="report-cell-credit-"]')
        ).map(cell => Math.round(t.right - cell.getBoundingClientRect().right))
        return {
            labelOffset: Math.abs(l.left - t.left),
            labelWidth: l.width,
            creditGaps,
        }
    })
}

// The row label with the most characters: whether its text element is cut, how it overflows,
// and its row's height.
async function longestLabel(page: Page) {
    return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[data-testid^="report-row-"]'))
        const row = rows.reduce<Element | null>(
            (best, next) =>
                (next.textContent ?? '').length > (best?.textContent ?? '').length ? next : best,
            null
        )
        if (!row) return null
        const textEl =
            Array.from(row.querySelectorAll('*')).find(
                el => el.childElementCount === 0 && el.textContent === row.textContent
            ) ?? row
        return {
            text: row.textContent,
            isCut: textEl.scrollWidth > textEl.clientWidth,
            textOverflow: getComputedStyle(textEl).textOverflow,
            rowHeight: Math.round(row.getBoundingClientRect().height),
        }
    })
}

async function scrollTops(page: Page, rowId: string) {
    return page.evaluate(rowId => {
        const top = (testId: string) =>
            document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect().top ??
            Number.NaN
        return {
            heading: Math.round(top('report-heading-row')),
            label: Math.round(top(`report-row-${rowId}`)),
            debit: Math.round(top(`report-cell-debit-${rowId}`)),
        }
    }, rowId)
}

test.describe('report-shell: trial balance table', () => {
    test('columns, money cells and the wide and phone layouts', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openTrialBalance(page)
        await choosePreset(page, 'today')

        const table = page.getByTestId('report-table')
        await expect(table).toBeVisible()
        await expect(page.getByTestId('report-heading-label')).toHaveText('Account')
        await expect(page.getByTestId('report-heading-debit')).toHaveText('Debit')
        await expect(page.getByTestId('report-heading-credit')).toHaveText('Credit')
        await expect(
            page
                .locator('[data-testid^="report-row-"]')
                .filter({ hasText: '1000 Business Checking' })
        ).toHaveCount(1)

        // Money: at a tall viewport, with the total row mounted, every row is in the window.
        await page.setViewportSize(TALL)
        const totalRow = page.getByTestId('report-row-total')
        await expect(totalRow).toHaveCount(1)
        await expect
            .poll(() => moneyConsistency(page))
            .toEqual({
                hasDetails: true,
                notBare: [],
                notOneSide: [],
                totalDebitShown: true,
                totalCreditShown: true,
                totalsEqual: true,
                debitSumIsTotal: true,
                creditSumIsTotal: true,
            })
        await page.setViewportSize(DESKTOP)

        await expect(totalRow).toHaveText('Total')
        await expect(totalRow).toHaveCSS('border-top-width', '2px')
        // The Trial Balance has no section rows, so there is nothing to fold.
        await expect(page.getByTestId('report-fold-all')).toHaveCount(0)

        await expect
            .poll(async () =>
                (await amountTextStyles(page)).filter(
                    cell =>
                        cell.textAlign !== 'right' ||
                        !cell.fontVariantNumeric.includes('tabular-nums')
                )
            )
            .toEqual([])

        // Wide layout: 44 rows, fixed 128 amount columns aligned on one right edge, a label
        // column of at least 220, and the column labels outside the rows' vertical scroller.
        await expect.poll(() => rowLabelHeights(page)).toEqual([44])
        await expect
            .poll(() => amountColumn(page, 'debit', 128))
            .toEqual({ hasCells: true, offWidths: [], rightEdges: 1 })
        await expect
            .poll(() => amountColumn(page, 'credit', 128))
            .toEqual({ hasCells: true, offWidths: [], rightEdges: 1 })
        await expect.poll(() => minRowLabelWidth(page)).toBeGreaterThanOrEqual(220)
        await expect.poll(() => headingAboveFirstRow(page)).toBe(true)
        await expect.poll(() => hasScrollingAncestor(page, 'report-heading-row')).toBe(false)
        await expect
            .poll(async () => (await rowsScroller(page)).overflowY)
            .toMatch(/^(auto|scroll)$/)

        // Full width, no card: the table lines up with the document header above it.
        await expect
            .poll(async () => {
                const { dx, dWidth } = await tableMatchesDocumentHeader(page)
                return dx <= 1 && dWidth <= 1
            })
            .toBe(true)

        // Phone, two amount columns: 108 each beside a label that takes the rest; nothing
        // scrolls sideways.
        await page.setViewportSize(PHONE)
        await expect
            .poll(() => amountColumn(page, 'debit', 108))
            .toEqual({ hasCells: true, offWidths: [], rightEdges: 1 })
        await expect
            .poll(() => amountColumn(page, 'credit', 108))
            .toEqual({ hasCells: true, offWidths: [], rightEdges: 1 })
        await expect
            .poll(async () => {
                const edges = await phoneEdges(page)
                if (!edges) return 'no table'
                return {
                    labelAtLeft: edges.labelOffset <= 1,
                    labelWide: edges.labelWidth > 120,
                    creditNearRight: edges.creditGaps.every(gap => gap >= -1 && gap <= 20),
                }
            })
            .toEqual({ labelAtLeft: true, labelWide: true, creditNearRight: true })
        await expect.poll(() => hasNoPageScrollX(page)).toBe(true)

        // One line with an ellipsis: the longest label is cut, and its row stays 44 high.
        await expect
            .poll(async () => {
                const label = await longestLabel(page)
                if (!label) return 'no rows'
                return {
                    isCut: label.isCut,
                    textOverflow: label.textOverflow,
                    rowHeight: label.rowHeight,
                }
            })
            .toEqual({ isCut: true, textOverflow: 'ellipsis', rowHeight: 44 })

        // The column labels stay put while the rows scroll, and the label and amount columns
        // scroll together.
        await page.setViewportSize({ width: 390, height: 560 })
        await expect.poll(async () => (await rowsScroller(page)).overflows).toBe(true)
        const lastDetail = (await readRows(page)).filter(row => row.id !== TOTAL_ROW_ID).at(-1)
        expect(lastDetail).toBeDefined()
        const lastId = lastDetail?.id ?? ''
        await page.locator('[data-testid^="report-row-"]').first().hover()
        await expect
            .poll(async () => {
                const tops = await scrollTops(page, lastId)
                return tops.label === tops.debit
            })
            .toBe(true)
        const before = await scrollTops(page, lastId)
        await page.mouse.wheel(0, 300)
        await expect
            .poll(async () => {
                const after = await scrollTops(page, lastId)
                return {
                    headingStays: after.heading === before.heading,
                    together: after.label === after.debit,
                    labelMoved: after.label < before.label,
                    debitMoved: after.debit < before.debit,
                }
            })
            .toEqual({ headingStays: true, together: true, labelMoved: true, debitMoved: true })
    })
})
