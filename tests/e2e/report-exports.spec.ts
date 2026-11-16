import fs from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import {
    login,
    navigateToPackage,
    pressToolbar,
    rowOf,
    waitForTableFit,
} from '@tinycld/core/e2e-helpers'
import { rangeWords } from '@tinycld/core/reports/lib/dates'
import { PL_COMPUTED_LABELS, PL_SECTION_TITLES } from '~/tinycld/books/lib/profit-and-loss-fixture'
import { createAccount, DESKTOP, openChart, PHONE } from './account-register-helpers'
import {
    BOM,
    browserToday,
    chooseAsOf,
    choosePeriod,
    csvRecords,
    exportReport,
    openBalanceSheet,
    openEntriesFromSidebar,
    openProfitAndLoss,
    openTrialBalance,
    postEntryOn,
} from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// Report exports on Books' shipped reports. Core's own e2e (salesstub) cover the menu,
// "Preparing…", the refusals, the disabled states and the email dialog; this spec pins
// what is Books': the names and content of files made from Books' reports, and the phone
// path on a Books report. Each test makes its own accounts and entries through the UI,
// dated today, and reads rows from the downloaded file, never from the windowed table.

const INCOME = { type: 'Income', detailType: 'Service income' }
const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }

const T = PL_SECTION_TITLES
const C = PL_COMPUTED_LABELS

// The statement's section, total and computed rows in statement order.
const STATEMENT_ORDER = [
    T.income,
    `Total ${T.income}`,
    T.cost_of_goods_sold,
    `Total ${T.cost_of_goods_sold}`,
    C.grossProfit,
    T.expense,
    `Total ${T.expense}`,
    C.netOperatingIncome,
    T.other_income,
    `Total ${T.other_income}`,
    T.other_expense,
    `Total ${T.other_expense}`,
    C.netOtherIncome,
    C.netIncome,
]

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// Where each of `labels` stands in `column`, each searched after the one before it; -1
// for a label not found in that order.
function positionsInOrder(column: readonly string[], labels: readonly string[]): number[] {
    let from = 0
    return labels.map(label => {
        const at = column.indexOf(label, from)
        if (at >= 0) from = at + 1
        return at
    })
}

// The account's own line and the lines that open under it: its posted lines (labelled
// "<day> · <number> · <memo>") and its total, if the report gives it one.
function accountBlock(records: string[][], account: string): string[][] {
    const start = records.findIndex(record => record[0] === account)
    if (start < 0) return []
    const block = [records[start]]
    for (const record of records.slice(start + 1)) {
        const label = record[0] ?? ''
        if (/^\d{4}-\d{2}-\d{2} · /.test(label) || label === `Total ${account}`) {
            block.push(record)
        } else break
    }
    return block
}

test.describe('report-exports: books', () => {
    test('the Profit and Loss as CSV holds every row, open and raw, named by its period', async ({
        page,
    }) => {
        await startBooks(page)
        const income = uniqueName('Export income')
        const expense = uniqueName('Export expense')
        await openChart(page)
        await createAccount(page, income, INCOME)
        await createAccount(page, expense, EXPENSE)
        await openEntriesFromSidebar(page)
        const today = await browserToday(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('Export sale'),
            lines: [
                { account: ACCOUNT_LABELS.checking, debit: '1234.50' },
                { account: income, credit: '1234.50' },
            ],
        })
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('Export cost'),
            lines: [
                { account: expense, debit: '200.00' },
                { account: ACCOUNT_LABELS.checking, credit: '200.00' },
            ],
        })

        await openProfitAndLoss(page)
        const from = `${today.slice(0, 8)}01`
        await choosePeriod(page, { from, to: today })
        await expect(page.getByTestId('report-document-period')).toHaveText(rangeWords(from, today))

        // Income folded on screen: its accounts are not drawn. Income is the first
        // section, so at scroll 0 core's sticky copy of its heading lies over the list
        // row: that copy is what a user presses.
        const incomeSection = rowOf(page, T.income)
        await expect(incomeSection).toHaveAttribute('aria-expanded', 'true')
        await page.getByTestId('report-sticky-group').getByText(T.income, { exact: true }).click()
        await expect(incomeSection).toHaveAttribute('aria-expanded', 'false')
        await expect(rowOf(page, income)).toHaveCount(0)

        // The number format options do not reach the CSV.
        await pressToolbar(page, 'report-customize-open', 'Customize')
        await page.getByTestId('report-option-divide-by-1000').click()
        await expect(page.getByTestId('report-thousands-note')).toBeVisible()
        await page.getByTestId('report-customize-close').click()
        await expect(page.getByTestId('report-customize')).toHaveCount(0)

        const { name, bytes } = await exportReport(page, 'csv')
        expect(name).toBe(`profit-and-loss-${from}-to-${today}.csv`)
        const records = csvRecords(bytes)
        const labels = records.slice(1).map(record => record[0] ?? '')

        const order = positionsInOrder(labels, STATEMENT_ORDER)
        expect(
            STATEMENT_ORDER.filter((_label, index) => order[index] < 0),
            'section, total and computed rows missing or out of statement order'
        ).toEqual([])

        const incomeAt = labels.indexOf(income)
        expect(incomeAt, `a line for ${income}, though Income is folded`).toBeGreaterThan(
            labels.indexOf(T.income)
        )
        expect(incomeAt).toBeLessThan(labels.indexOf(`Total ${T.income}`))
        const expenseAt = labels.indexOf(expense)
        expect(expenseAt, `a line for ${expense}`).toBeGreaterThan(labels.indexOf(T.expense))
        expect(expenseAt).toBeLessThan(labels.indexOf(`Total ${T.expense}`))

        const incomeCells = accountBlock(records, income).flatMap(record => record.slice(1))
        expect(incomeCells, 'the income amount, raw and not divided by 1000').toContain('1234.50')
        expect(incomeCells.filter(cell => /[$,]|1\.23/.test(cell))).toEqual([])
        const expenseCells = accountBlock(records, expense).flatMap(record => record.slice(1))
        expect(expenseCells).toContain('200.00')
    })

    test('the Balance Sheet as PDF and Excel is named by its as-of day', async ({ page }) => {
        await startBooks(page)
        await openBalanceSheet(page)
        await chooseAsOf(page, { preset: 'today' })
        const today = await browserToday(page)

        const pdf = await exportReport(page, 'pdf')
        expect(pdf.name).toBe(`balance-sheet-as-of-${today}.pdf`)
        const pdfText = pdf.bytes.toString('latin1')
        expect(pdfText.startsWith('%PDF-')).toBe(true)
        expect(pdfText).toMatch(/\/Type\s*\/Page(?!s)/)

        const xlsx = await exportReport(page, 'xlsx')
        expect(xlsx.name.endsWith(`as-of-${today}.xlsx`)).toBe(true)
        expect(xlsx.name).toBe(`balance-sheet-as-of-${today}.xlsx`)
        expect(xlsx.bytes.subarray(0, 2).toString('latin1')).toBe('PK')
    })

    test('on a phone the Trial Balance downloads its CSV from "⋯"', async ({ page }) => {
        await startBooks(page)
        await openTrialBalance(page)
        await chooseAsOf(page, { preset: 'today' })
        const day = await browserToday(page)

        await page.setViewportSize(PHONE)
        await waitForTableFit(page)
        const more = page.getByTestId('toolbar-more-button')
        await expect(more).toBeVisible()
        await expect(page.getByTestId('report-export-open')).toHaveCount(0)

        await more.click()
        for (const [testId, label] of [
            ['report-export-pdf', 'Download PDF'],
            ['report-export-xlsx', 'Download Excel'],
            ['report-export-csv', 'Download CSV'],
            ['report-export-email', 'Email report…'],
        ]) {
            const row = page.getByTestId(testId)
            await expect(row).toHaveAttribute('role', 'menuitem')
            await expect(row).toContainText(label)
        }
        await expect(page.getByRole('menuitem', { name: 'Export', exact: true })).toHaveCount(0)

        const downloaded = page.waitForEvent('download')
        await page.getByTestId('report-export-csv').click()
        const download = await downloaded
        expect(download.suggestedFilename()).toBe(`trial-balance-as-of-${day}.csv`)
        const bytes = fs.readFileSync(await download.path())
        expect([...bytes.subarray(0, 3)]).toEqual(BOM)
    })
})
