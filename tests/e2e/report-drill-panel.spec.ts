import { expect, type Locator, type Page, test } from '@playwright/test'
import {
    cellOf,
    inStatement,
    login,
    navigateToPackage,
    pressToolbar,
    rowOf,
    waitForTableFit,
} from '@tinycld/core/e2e-helpers'
import { TRANSACTION_DETAIL_TITLE } from '~/tinycld/books/lib/report-drill-down-fixture'
import { createAccount, openChart } from './account-register-helpers'
import {
    browserToday,
    drillPanel,
    expectTableFits,
    figureDigits,
    figureText,
    manualBand,
    openEntriesFromSidebar,
    openProfitAndLoss,
    postEntryOn,
    pressFigure,
    refreshReport,
    sectionTopKey,
    snapshotWhen,
    tdLinesOf,
    tdSnapshot,
    tdSubtotalOf,
    tdTotalOf,
    wrappedLineFit,
} from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// Transaction Detail by Account in core's drill panel beside the Profit and Loss, on a
// window of 1360 px or more (report drill-down spec §3 "Where the opened report shows",
// §7 panel items 1, 2 and 7). The panel's mechanics (scoped params, Open as full report,
// Close, Escape, crossing the width) are core's view code, pinned by core's
// reports-drill.spec.ts; these tests pin Books' own report in the panel.

const PANEL_WINDOW = { width: 1440, height: 900 }
// core DETAIL_PANEL_WIDTH.
const PANEL_WIDTH = 480
const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const EXPENSES = 'Expenses'
const TOTAL_EXPENSES = `Total ${EXPENSES}`
const PL_TITLE = 'Profit and Loss'

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// The table mounts only the rows near its scroll position, and Expenses grows with every
// account other runs and specs post: an account named from sectionTopKey sorts at the top
// of the section, so its row mounts when the section opens.
function accountName(prefix: string): string {
    return uniqueName(`${sectionTopKey()} ${prefix}`)
}

async function createExpenseAccount(page: Page, name: string): Promise<void> {
    await openChart(page)
    await createAccount(page, name, EXPENSE)
}

async function postExpense(page: Page, account: string, amount: string): Promise<void> {
    await postEntryOn(page, {
        date: await browserToday(page),
        memo: uniqueName('Panel entry'),
        lines: [
            { account, debit: amount },
            { account: ACCOUNT_LABELS.checking, credit: amount },
        ],
    })
}

// Scrolls every vertical scroller inside `scope` to its end, so the windowed list mounts
// its last rows (and pages in more as the reader's scroll would).
function scrollToEnd(scope: Locator): Promise<void> {
    return scope.evaluate(element => {
        for (const node of [element, ...element.querySelectorAll('*')]) {
            if (!(node instanceof HTMLElement)) continue
            const overflowY = getComputedStyle(node).overflowY
            if (overflowY !== 'auto' && overflowY !== 'scroll') continue
            if (node.scrollHeight > node.clientHeight) node.scrollTop = node.scrollHeight
        }
    })
}

// Folds the statement, then opens the one section the test reads and waits for `label`'s
// row under it: the shared DB holds every other spec's accounts, so only that section's
// rows are mounted near the top.
async function openSectionTo(page: Page, section: string, label: string): Promise<void> {
    await pressToolbar(page, 'report-fold-all', 'Collapse all')
    await expect(rowOf(page, section)).toHaveAttribute('aria-expanded', 'false')
    await rowOf(page, section).click()
    await expect(rowOf(page, section)).toHaveAttribute('aria-expanded', 'true')
    await expect(rowOf(page, label)).toBeVisible()
}

// The Profit and Loss at the panel's window, with the Expenses section open to `account`.
async function openStatementTo(page: Page, account: string): Promise<void> {
    await openProfitAndLoss(page)
    await page.setViewportSize(PANEL_WINDOW)
    await waitForTableFit(page)
    await openSectionTo(page, EXPENSES, account)
}

test.describe('report-drill-down: panel', () => {
    test('a figure opens its lines in the panel beside the statement, and a second figure replaces them', async ({
        page,
        browser,
    }) => {
        await startBooks(page)
        const expense = accountName('TD P10 expense')
        await createExpenseAccount(page, expense)
        await openEntriesFromSidebar(page)
        await postExpense(page, expense, '120.00')
        await postExpense(page, expense, '80.00')

        await openStatementTo(page, expense)
        const statementPath = new URL(page.url()).pathname
        await pressFigure(page, 'amount', expense)

        const panel = drillPanel(page)
        await expect(panel).toBeVisible()
        await expect
            .poll(async () => {
                const box = await panel.boundingBox()
                if (!box) return null
                return {
                    width: Math.abs(box.width - PANEL_WIDTH) <= 1,
                    rightEdge: Math.abs(box.x + box.width - PANEL_WINDOW.width) <= 1,
                }
            })
            .toEqual({ width: true, rightEdge: true })
        await expect(inStatement(page, 'report-title')).toHaveText(PL_TITLE)
        expect(new URL(page.url()).pathname).toBe(statementPath)
        await expect(panel.getByTestId('report-drill-panel-header')).toContainText(
            TRANSACTION_DETAIL_TITLE
        )

        const opened = await snapshotWhen(
            page,
            p => tdSnapshot(p, drillPanel(p)),
            s => tdLinesOf(s, expense).length === 2 && tdSubtotalOf(s, expense) !== undefined,
            `${expense}'s two lines and its total in the panel`
        )
        expect(opened.chips.accounts).toContain(expense)
        expect(
            tdLinesOf(opened, expense)
                .map(row => figureDigits(row.cells.amount))
                .sort()
        ).toEqual(['120.00', '80.00'])
        expect(figureDigits(tdSubtotalOf(opened, expense)?.cells.amount)).toBe('200.00')

        const layout = await waitForTableFit(page, panel)
        expect(layout, 'Transaction Detail draws its phone layout in the panel').toBe('mobile')
        await expectTableFits(page, panel)
        for (const line of tdLinesOf(opened, expense)) {
            await expect
                .poll(() => wrappedLineFit(page, line.id, panel), {
                    message: `the panel's line ${line.id} wraps, with Date, No. and Amount whole`,
                })
                .toEqual({ wraps: true, date: true, number: true, amount: true })
        }

        await expect
            .poll(async () => {
                const table = await inStatement(page, 'report-table').boundingBox()
                const side = await panel.boundingBox()
                if (!table || !side) return null
                return {
                    leftOfPanel: table.x + table.width <= side.x + 1,
                    wide: table.width >= 860,
                }
            })
            .toEqual({ leftOfPanel: true, wide: true })
        await expect(await cellOf(page, 'amount', expense)).toHaveAttribute('aria-selected', 'true')

        // A second browser context signed in as the same user posts through its own
        // session, so the line reaches the panel and the statement through the server.
        const otherContext = await browser.newContext()
        try {
            const other = await otherContext.newPage()
            await startBooks(other)
            await openEntriesFromSidebar(other)
            await postExpense(other, expense, '15.00')
        } finally {
            await otherContext.close()
        }
        // The statement (the Profit and Loss) is live: it shows the post with no press
        // and has no band. Transaction Detail in the panel is not live: its own Refresh
        // brings the line in.
        await expect
            .poll(async () => figureDigits(await figureText(page, 'amount', expense)))
            .toBe('215.00')
        await expect(manualBand(page).band).toHaveCount(0)
        await refreshReport(page, 'report-drill')
        const live = await snapshotWhen(
            page,
            p => tdSnapshot(p, drillPanel(p)),
            s => tdLinesOf(s, expense).length === 3,
            `${expense}'s third line in the panel after Refresh`
        )
        expect(figureDigits(tdSubtotalOf(live, expense)?.cells.amount)).toBe('215.00')

        // Total Expenses sits under every expense account of the shared DB: fold the
        // section so its total row is mounted.
        await rowOf(page, EXPENSES).click()
        await expect(rowOf(page, EXPENSES)).toHaveAttribute('aria-expanded', 'false')
        await pressFigure(page, 'amount', TOTAL_EXPENSES)
        await expect(page.getByTestId('report-drill-panel')).toHaveCount(1)
        await expect(panel.getByTestId('report-param-accounts')).toContainText(
            'All Expense accounts'
        )
        // The panel's report Total ends a list of every expense account's lines on the
        // shared DB, so the panel is scrolled to its end until the Total row is mounted.
        // Other workers post expenses. The statement runs live and the panel does not, so
        // the two totals are compared until they agree, and the panel is refreshed when a
        // Total it shows is not the statement's.
        const panelRefresh = manualBand(page, 'report-drill').refresh
        await expect
            .poll(
                async () => {
                    await scrollToEnd(drillPanel(page))
                    const section = await tdSnapshot(page, drillPanel(page))
                    const statement = figureDigits(await figureText(page, 'amount', TOTAL_EXPENSES))
                    const shown = figureDigits(tdTotalOf(section)?.cells.amount)
                    const isStale = shown !== '' && shown !== statement
                    const canRefresh =
                        isStale &&
                        (await panelRefresh.count()) > 0 &&
                        (await panelRefresh.isEnabled())
                    if (canRefresh) await panelRefresh.click()
                    return { equal: shown === statement && statement !== '', shown, statement }
                },
                { message: "the panel's report Total equals the statement's Total Expenses" }
            )
            .toMatchObject({ equal: true })
        await expect(await cellOf(page, 'amount', TOTAL_EXPENSES)).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await rowOf(page, EXPENSES).click()
        await expect(rowOf(page, expense)).toBeVisible()
        await expect(await cellOf(page, 'amount', expense)).not.toHaveAttribute(
            'aria-selected',
            'true'
        )
    })

    test('a line in the panel opens its entry, and Back returns with the panel open', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = accountName('TD P11 expense')
        await createExpenseAccount(page, expense)
        await openEntriesFromSidebar(page)
        await postExpense(page, expense, '27.00')
        const entryPath = new URL(page.url()).pathname
        expect(entryPath).toMatch(/\/books\/entries\/[^/]+$/)

        await openStatementTo(page, expense)
        await pressFigure(page, 'amount', expense)
        const panel = drillPanel(page)
        await expect(panel).toBeVisible()
        const opened = await snapshotWhen(
            page,
            p => tdSnapshot(p, drillPanel(p)),
            s => tdLinesOf(s, expense).length === 1,
            `${expense}'s line in the panel`
        )
        const line = tdLinesOf(opened, expense)[0]
        const label = panel.getByTestId(`report-row-${line.id}`)
        await expect(label).toHaveRole('link')
        await label.click()
        await expect(page).toHaveURL(new RegExp(`${entryPath}$`))

        await page.goBack()
        await expect(inStatement(page, 'report-title')).toHaveText(PL_TITLE)
        await expect(drillPanel(page)).toBeVisible()
        await expect(rowOf(page, expense, drillPanel(page))).toBeVisible()
    })
})
