import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    choosePreset,
    DESKTOP,
    hasNoPageScrollX,
    openAccountPicker,
    openTrialBalance,
    PHONE,
    TABLET,
} from './report-shell-helpers'

// The Customize panel, read through the Trial Balance on the "Today" preset: an inline
// drawer on wide, an overlay drawer on tablet and a bottom sheet on phone, whose options
// apply at once and are written to the URL.
//
// Nothing here writes data, and the shell must write nothing either: test 1 records every
// write request to a collection and expects none. Other specs post entries dated today on
// the shared database, so no assertion names an amount or a total; amounts are checked for
// format only. The only account named is the seeded "6900 Old Petty Cash" (inactive, never
// posted), which is zero on every date.
// The rows checks run at a tall desktop viewport, so the row window (about 67 rows of 44)
// holds every row of the "All" choice; the width, not the height, decides the breakpoint.
// The Columns section has no report to drive it in this unit (see the plan's "Not
// reachable"); here it is only checked absent.

const TALL = { width: 1280, height: 2400 }
// Still desktop (1024 and wider), so the drawer stays inline, but the main column beside it
// is narrower than the label and two amount columns need.
const NARROW_DESKTOP = { width: 1024, height: 2400 }
const TOTAL_ROW_ID = 'total'
const BARE_WHOLE = /^[\d,]+$/
const SHOWN_WHOLE_TOTAL = /^\$[\d,]+$/
const OLD_PETTY_CASH = '6900 Old Petty Cash'
const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

async function boxOf(locator: Locator) {
    const box = await locator.boundingBox()
    return { x: box?.x ?? Number.NaN, width: box?.width ?? 0, height: box?.height ?? 0 }
}

// A record write only: session upkeep (auth-refresh and the other auth endpoints) and
// realtime are not data, so they never match.
const RECORDS_PATH = /^\/api\/collections\/[^/]+\/records(\/[^/]+)?\/?$/

// Records every write the page sends to a collection's records from now on.
function recordWrites(page: Page): string[] {
    const writes: string[] = []
    page.on('request', request => {
        const { pathname } = new URL(request.url())
        if (WRITE_METHODS.has(request.method()) && RECORDS_PATH.test(pathname)) {
            writes.push(`${request.method()} ${request.url()}`)
        }
    })
    return writes
}

type TableRow = { id: string; label: string; debit: string | null; credit: string | null }

// Every row the table draws, with the text of its label and its two amount cells (null when
// the cell is missing).
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

async function detailRows(page: Page) {
    return (await readRows(page)).filter(row => row.id !== TOTAL_ROW_ID)
}

// Without cents: detail amounts are bare whole numbers, the total carries the symbol.
async function wholeAmounts(page: Page) {
    const rows = await readRows(page)
    const details = rows.filter(row => row.id !== TOTAL_ROW_ID)
    const shown = details.flatMap(row => [row.debit, row.credit]).filter(value => !!value)
    const totalDebit = rows.find(row => row.id === TOTAL_ROW_ID)?.debit
    return {
        hasAmounts: shown.length > 0,
        notWhole: shown.filter(value => !BARE_WHOLE.test(value ?? '')),
        totalDebitWhole: SHOWN_WHOLE_TOTAL.test(totalDebit ?? ''),
    }
}

async function oldPettyCash(page: Page) {
    const row = (await readRows(page)).find(candidate => candidate.label === OLD_PETTY_CASH)
    if (!row) return 'no row'
    return { debit: row.debit, credit: row.credit }
}

async function bothEmptyDetailRows(page: Page) {
    return (await detailRows(page)).filter(row => !row.debit && !row.credit).map(row => row.label)
}

// The left edge of the panel against the right edge of the table.
async function panelBesideTable(page: Page) {
    return page.evaluate(() => {
        const panel = document.querySelector('[data-testid="report-customize"]')
        const table = document.querySelector('[data-testid="report-table"]')
        if (!panel || !table) return 'missing'
        return panel.getBoundingClientRect().left >= table.getBoundingClientRect().right - 1
    })
}

// The nearest ancestor of the total row's credit cell that scrolls sideways: whether its
// content is wider than it, and where on screen a point over the visible part of that cell is.
async function amountScroller(page: Page) {
    return page.evaluate(() => {
        const cell = document.querySelector('[data-testid="report-cell-credit-total"]')
        for (let node = cell?.parentElement; node; node = node.parentElement) {
            const overflowX = getComputedStyle(node).overflowX
            if (overflowX === 'auto' || overflowX === 'scroll') {
                const s = node.getBoundingClientRect()
                const c = cell?.getBoundingClientRect()
                const left = Math.max(c?.left ?? s.left, s.left)
                const right = Math.min(c?.right ?? s.right, s.right)
                const point =
                    right > left
                        ? { x: (left + right) / 2, y: (c?.top ?? s.top) + 22 }
                        : { x: s.right - 4, y: (c?.top ?? s.top) + 22 }
                return { overflows: node.scrollWidth > node.clientWidth, point }
            }
        }
        return { overflows: false, point: null }
    })
}

async function sidewaysPositions(page: Page) {
    return page.evaluate(() => {
        const left = (testId: string) =>
            document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect().left ??
            Number.NaN
        return {
            heading: left('report-heading-credit'),
            cell: left('report-cell-credit-total'),
            label: left('report-row-total'),
        }
    })
}

async function sidewaysReading(page: Page) {
    const positions = await sidewaysPositions(page)
    const { point } = await amountScroller(page)
    return { positions, point }
}

test.describe('report-shell: customize panel', () => {
    test('inline panel and live options, at desktop', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openTrialBalance(page)
        await choosePreset(page, 'today')
        const writes = recordWrites(page)
        await page.setViewportSize(TALL)

        const screen = page.getByTestId('report-screen')
        const open = page.getByTestId('report-customize-open')
        const customize = page.getByTestId('report-customize')
        const table = page.getByTestId('report-table')
        await expect(open).toBeVisible()
        await expect.poll(async () => (await boxOf(open)).height).toBeGreaterThanOrEqual(44)
        await open.click()
        await expect(customize).toBeVisible()
        await expect(customize).toHaveRole('complementary')
        await expect.poll(() => panelBesideTable(page)).toBe(true)
        await expect(table).toBeVisible()

        // Folding sections, Number format open first; the Trial Balance has no columns choice.
        const numberFormatSection = page.getByTestId('report-customize-section-number-format')
        const rowsSection = page.getByTestId('report-customize-section-rows')
        await expect(numberFormatSection).toHaveAttribute('aria-expanded', 'true')
        await expect(rowsSection).toHaveAttribute('aria-expanded', 'false')
        const allRows = customize.getByRole('radio', { name: 'All', exact: true })
        await expect(allRows).toBeHidden()
        await expect(page.getByTestId('report-customize-section-columns')).toHaveCount(0)

        // Every change applies at once: there is no Run and no Save.
        await expect(screen.getByRole('button', { name: /^(Run|Run report|Save)$/ })).toHaveCount(0)

        await page.getByTestId('report-option-without-cents').click()
        await expect
            .poll(() => wholeAmounts(page))
            .toEqual({ hasAmounts: true, notWhole: [], totalDebitWhole: true })
        await expect.poll(() => page.url()).toContain('nocents=1')

        await page.getByTestId('report-option-divide-by-1000').click()
        const thousandsNote = page.getByTestId('report-thousands-note')
        await expect(thousandsNote).toHaveText('Amounts in thousands')
        await expect.poll(() => page.url()).toContain('div1000=1')

        await customize.getByRole('radio', { name: '(100)', exact: true }).click()
        await expect.poll(() => page.url()).toContain('negative=parens')

        await page.getByTestId('report-option-negative-red').click()
        await expect.poll(() => page.url()).toContain('red=1')

        // Show rows. Old Petty Cash is inactive and never posted, so it is always zero.
        await rowsSection.click()
        await expect(rowsSection).toHaveAttribute('aria-expanded', 'true')
        await allRows.click()
        await expect.poll(() => page.url()).toContain('rows=all')
        await expect.poll(() => oldPettyCash(page)).toEqual({ debit: '', credit: '' })

        await customize.getByRole('radio', { name: 'Active', exact: true }).click()
        await expect.poll(() => page.url()).toContain('rows=active')
        await expect.poll(() => oldPettyCash(page)).toBe('no row')

        // Under Active a row whose postings cancel may show both cells empty; under Non-zero
        // no row can.
        await customize.getByRole('radio', { name: 'Non-zero', exact: true }).click()
        await expect.poll(() => page.url()).not.toContain('rows=')
        await expect.poll(() => oldPettyCash(page)).toBe('no row')
        await expect.poll(async () => (await detailRows(page)).length).toBeGreaterThan(0)
        await expect.poll(() => bothEmptyDetailRows(page)).toEqual([])

        // Reset to defaults restores every option, the period and the filters included.
        const accountChip = page.getByTestId('report-filter-chip-account')
        await openAccountPicker(page)
        await page
            .getByTestId('report-filter-picker')
            .locator('[data-testid^="report-filter-option-"]')
            .filter({ hasText: '1000 Business Checking' })
            .click()
        await page.getByTestId('report-filter-apply').click()
        await expect(accountChip).toBeVisible()

        await page.getByTestId('report-customize-reset').click()
        await expect.poll(() => page.url()).not.toContain('?')
        await expect(accountChip).toHaveCount(0)
        await expect(page.getByTestId('report-period')).toHaveText(/^End of last month · /)
        await expect(page.getByTestId('report-option-without-cents')).toHaveAttribute(
            'aria-checked',
            'false'
        )
        await expect(page.getByTestId('report-option-divide-by-1000')).toHaveAttribute(
            'aria-checked',
            'false'
        )
        await expect(page.getByTestId('report-option-negative-red')).toHaveAttribute(
            'aria-checked',
            'false'
        )
        await expect(customize.getByRole('radio', { name: '-100', exact: true })).toBeChecked()
        if ((await rowsSection.getAttribute('aria-expanded')) !== 'true') await rowsSection.click()
        await expect(rowsSection).toHaveAttribute('aria-expanded', 'true')
        await expect(customize.getByRole('radio', { name: 'Non-zero', exact: true })).toBeChecked()
        await expect(thousandsNote).toHaveCount(0)

        // Wide sideways scroll: with the panel open at 1024 the amount columns do not fit, so
        // they scroll under a fixed label, and their headings move in step.
        await choosePreset(page, 'today')
        await page.setViewportSize(NARROW_DESKTOP)
        await expect(customize).toBeVisible()
        await expect.poll(async () => (await amountScroller(page)).overflows).toBe(true)
        // The resize relays out over several frames: take the start position only once the
        // heading sits over its cell and two reads in a row agree.
        const reads: Awaited<ReturnType<typeof sidewaysReading>>[] = []
        await expect
            .poll(async () => {
                reads.push(await sidewaysReading(page))
                const [previous, latest] = reads.slice(-2)
                return (
                    !!previous &&
                    JSON.stringify(previous) === JSON.stringify(latest) &&
                    Math.abs(latest.positions.heading - latest.positions.cell) <= 1
                )
            })
            .toBe(true)
        const { positions: before, point } = reads[reads.length - 1]
        expect(point).not.toBeNull()
        await page.mouse.move(point?.x ?? 0, point?.y ?? 0)
        await page.mouse.wheel(200, 0)
        await expect
            .poll(async () => {
                const after = await sidewaysPositions(page)
                return {
                    inStep: Math.abs(after.heading - after.cell) <= 1,
                    headingMoved: after.heading < before.heading,
                    cellMoved: after.cell < before.cell,
                    labelStays: Math.abs(after.label - before.label) <= 1,
                }
            })
            .toEqual({ inStep: true, headingMoved: true, cellMoved: true, labelStays: true })

        const close = page.getByTestId('report-customize-close')
        await expect.poll(async () => (await boxOf(close)).width).toBeGreaterThanOrEqual(44)
        await expect.poll(async () => (await boxOf(close)).height).toBeGreaterThanOrEqual(44)
        await close.click()
        await expect(customize).toHaveCount(0)

        expect(writes).toEqual([])
    })

    test('tablet overlay and phone sheet', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openTrialBalance(page)
        await choosePreset(page, 'today')

        const open = page.getByTestId('report-customize-open')
        const customize = page.getByTestId('report-customize')
        const close = page.getByTestId('report-customize-close')

        // Tablet: an overlay drawer from the right.
        await page.setViewportSize(TABLET)
        await open.click()
        await expect(customize).toBeVisible()
        await expect(customize).toHaveRole('dialog')
        await expect
            .poll(async () => {
                const box = await boxOf(customize)
                return Math.abs(box.x + box.width - TABLET.width) <= 1
            })
            .toBe(true)
        await close.click()
        await expect(customize).toHaveCount(0)

        // Phone: a bottom sheet titled "Customize" (a sheet has no dialog role).
        await page.setViewportSize(PHONE)
        await open.click()
        await expect(customize.getByText('Customize', { exact: true })).toBeVisible()
        await expect(customize.getByText('Number format', { exact: true })).toBeVisible()
        await expect(customize.getByText('Divide by 1000', { exact: true })).toBeVisible()
        await expect(customize.getByText('Without cents', { exact: true })).toBeVisible()
        await page.getByTestId('report-option-without-cents').click()
        await expect.poll(async () => (await boxOf(close)).width).toBeGreaterThanOrEqual(44)
        await expect.poll(async () => (await boxOf(close)).height).toBeGreaterThanOrEqual(44)
        await close.click()
        await expect(customize).toHaveCount(0)
        await expect(page.getByTestId(`report-cell-debit-${TOTAL_ROW_ID}`)).toHaveText(
            SHOWN_WHOLE_TOTAL
        )
        await expect.poll(() => hasNoPageScrollX(page)).toBe(true)
    })
})
