import { expect, type Page, test } from '@playwright/test'
import {
    inStatement,
    login,
    navigateToPackage,
    pressToolbar,
    rowOf,
    waitForTableFit,
} from '@tinycld/core/e2e-helpers'
import { TRANSACTION_DETAIL_TITLE } from '~/tinycld/books/lib/report-drill-down-fixture'
import { createAccount, openChart, PHONE } from './account-register-helpers'
import {
    browserToday,
    drillPanel,
    expectTableFits,
    figureDigits,
    openEntriesFromSidebar,
    openProfitAndLoss,
    postEntryOn,
    pressFigure,
    sectionTopKey,
    snapshotWhen,
    tdLinesOf,
    tdSnapshot,
    wrappedLineFit,
} from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { CLASSIC_SCROLLBARS, uniqueName } from './record-form-helpers'

// A statement figure on a phone (report drill-down spec §3 "Window below 1360 px, and
// every phone", §7 phone item 1): the phone path runs different code (core's wrapped
// report rows and the top area that scrolls away), so it has its own test.
//
// The opened report is fitted at the 375 px and the 390 px row that the phone
// arrangement was measured at (spec D3). The page gets classic scrollbars, as Linux (CI)
// draws them, so the rows' stable gutter takes 15 px on every machine (macOS overlay
// scrollbars take none): the 390 px phone gives the 375 px row, and a 405 px window the
// 390 px row. A 360 px row is not tested: there line 1 (date, Type "Journal entry" and
// No.) fits only while the shared database's entry numbers have three digits, and from
// JE-1000 the report correctly falls to the automatic lines.

const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const EXPENSES = 'Expenses'
const PL_TITLE = 'Profit and Loss'
const ROW_390 = { width: 405, height: 844 }

async function expectLineFits(page: Page, rowId: string, width: number): Promise<void> {
    const layout = await waitForTableFit(page)
    await expect(inStatement(page, 'report-table')).toHaveAttribute('data-fit-width', String(width))
    expect(layout, `Transaction Detail draws its phone layout at ${width}`).toBe('mobile')
    await expectTableFits(page)
    await expect
        .poll(() => wrappedLineFit(page, rowId), {
            message: `the line wraps, with Date, No. and Amount whole at ${width}`,
        })
        .toEqual({ wraps: true, date: true, number: true, amount: true })
}

test.describe('report-drill-down: phone', () => {
    test('a tap on a figure opens Transaction Detail as its own screen, and Back returns', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        // Named from sectionTopKey, the account sorts at the top of Expenses, so its row
        // mounts when the section opens.
        const expense = uniqueName(`${sectionTopKey()} TD P12 expense`)
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo: uniqueName('Phone entry'),
            lines: [
                { account: expense, debit: '52.00' },
                { account: ACCOUNT_LABELS.checking, credit: '52.00' },
            ],
        })
        const entryPath = new URL(page.url()).pathname
        expect(entryPath).toMatch(/\/books\/entries\/[^/]+$/)

        await page.addStyleTag({ content: CLASSIC_SCROLLBARS })
        await openProfitAndLoss(page)
        await page.setViewportSize(PHONE)
        await waitForTableFit(page)
        await pressToolbar(page, 'report-fold-all', 'Collapse all')
        await expect(rowOf(page, EXPENSES)).toHaveAttribute('aria-expanded', 'false')
        await rowOf(page, EXPENSES).click()
        await expect(rowOf(page, EXPENSES)).toHaveAttribute('aria-expanded', 'true')
        await expect(rowOf(page, expense)).toBeVisible()
        const periodChip = (await page.getByTestId('report-param-period').innerText()).trim()
        const statementUrl = page.url()

        // On a phone the row wraps: its Total is on the row's second line.
        await pressFigure(page, 'amount', expense)
        await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)
        await expect(drillPanel(page)).toHaveCount(0)
        const opened = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdLinesOf(s, expense).length === 1,
            `${expense}'s one line`
        )
        const line = tdLinesOf(opened, expense)[0]
        expect(figureDigits(line.cells.amount)).toBe('52.00')
        await expectLineFits(page, line.id, 375)
        await expect(page.getByTestId('report-back')).toHaveText(PL_TITLE)

        await page.setViewportSize(ROW_390)
        await expectLineFits(page, line.id, 390)
        await page.setViewportSize(PHONE)

        const label = page.getByTestId(`report-row-${line.id}`)
        await expect(label).toHaveRole('link')
        await label.click()
        await expect(page).toHaveURL(new RegExp(`${entryPath}$`))

        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)
        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText(PL_TITLE)
        await expect(page).toHaveURL(statementUrl)
        await expect(page.getByTestId('report-param-period')).toHaveText(periodChip)
    })
})
