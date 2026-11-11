import { expect, type Page, test } from '@playwright/test'
import {
    login,
    navigateToPackage,
    pressToolbar,
    rowOf,
    waitForTableFit,
} from '@tinycld/core/e2e-helpers'
import {
    PL_COMPUTED_LABELS,
    PL_SECTION_TITLES,
    PROFIT_AND_LOSS_TITLE,
} from '~/tinycld/books/lib/profit-and-loss-fixture'
import { createAccount, DESKTOP, openChart, PHONE } from './account-register-helpers'
import {
    browserToday,
    choosePeriod,
    chooseRows,
    dayWords,
    expectedHeading,
    expectPressOpensNothing,
    openEntriesFromSidebar,
    openProfitAndLoss,
    openProfitAndLossAccount,
    openProfitAndLossByMonth,
    type PlSnapshot,
    plLinesUnder,
    plSnapshot,
    postEntryOn,
    snapshotWhen,
} from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// The shipped Profit and Loss in core's report view (/a/reports/<id>), read by the e2e
// user through the viewer share Books keeps (server/report_shares.go). Every test makes
// its own accounts and entries through the UI (account panel, journal entry form), dated
// today (inside every fiscal-year-to-date period), names them with `uniqueName`, and reads
// rows in ONE snapshot (`plSnapshot`). No test depends on the fiscal start month or on a
// shared total between two snapshots: other workers post today on the shared DB (D2).
//
// The table is a FlashList and the shared DB holds every other spec's accounts, so a test
// that reads rows inside a section first folds every section (Collapse all), then opens
// only the one it reads. Core's own e2e cover Customize's other options, Expand all /
// Collapse all, loading, error, timeout, no access, Copy link and Save as (D4).

const INCOME = { type: 'Income', detailType: 'Service income' }
const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }

const T = PL_SECTION_TITLES
const C = PL_COMPUTED_LABELS

// The statement with every section folded: each section's title and total, and the
// computed rows where they stand.
const FOLDED_STATEMENT = [
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

type Row = PlSnapshot['rows'][number]

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The number of the posted entry open in its read view ("Journal entry JE-12" → "JE-12").
async function postedNumber(page: Page): Promise<string> {
    const title = (await page.getByTestId('entry-title').innerText()).trim()
    const number = title.replace(/^Journal entry /, '')
    expect(number).toMatch(/^JE-\d+$/)
    return number
}

async function createAccounts(page: Page, accounts: { name: string; kind: typeof INCOME }[]) {
    await openChart(page)
    for (const { name, kind } of accounts) await createAccount(page, name, kind)
    await openEntriesFromSidebar(page)
}

function indexOf(snapshot: PlSnapshot, kind: Row['kind'], label: string) {
    return snapshot.rows.findIndex(row => row.kind === kind && row.label === label)
}

function rowNamed(snapshot: PlSnapshot, kind: Row['kind'], label: string): Row | undefined {
    return snapshot.rows.find(row => row.kind === kind && row.label === label)
}

function labels(snapshot: PlSnapshot) {
    return snapshot.rows.map(row => row.label)
}

// An amount cell's text in cents: "$1,234.50", "-12.00", "(12.00)" and "−12.00" all read.
function cents(text: string | undefined): number {
    const value = (text ?? '').trim()
    const negative = /^[-−(]/.test(value) || value.endsWith(')')
    const digits = value.replace(/[^0-9.]/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(digits)) throw new Error(`not an amount: "${text}"`)
    const [whole, fraction = ''] = digits.split('.')
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return negative ? -amount : amount
}

function amountOf(snapshot: PlSnapshot, kind: Row['kind'], label: string): number {
    const row = rowNamed(snapshot, kind, label)
    if (!row) throw new Error(`no ${kind} row "${label}" in ${labels(snapshot).join(' | ')}`)
    return cents(row.cells.amount)
}

// Folds every section, and waits until the view shows the folded statement alone.
async function collapseAll(page: Page): Promise<PlSnapshot> {
    await pressToolbar(page, 'report-fold-all', 'Collapse all')
    return snapshotWhen(
        page,
        plSnapshot,
        s => labels(s).join('|') === FOLDED_STATEMENT.join('|'),
        'the statement folded to its sections and computed rows'
    )
}

// Opens one folded section and waits for `label`'s row (an account of the test's own)
// under it, before its total.
async function openSectionTo(
    page: Page,
    section: string,
    label: string,
    message: string
): Promise<PlSnapshot> {
    await rowOf(page, section).click()
    return snapshotWhen(
        page,
        plSnapshot,
        s => indexOf(s, 'group', label) >= 0 && indexOf(s, 'subtotal', `Total ${section}`) >= 0,
        message
    )
}

test.describe('profit-and-loss: report', () => {
    test('the hub opens the Profit and Loss with its header and its two chips', async ({
        page,
    }) => {
        await startBooks(page)
        await openProfitAndLoss(page)
        const today = await browserToday(page)
        await expect
            .poll(async () => {
                const snapshot = await plSnapshot(page)
                const expected = await expectedHeading(page)
                return {
                    matches: snapshot.business === expected && expected !== '',
                    shown: snapshot.business,
                    expected,
                }
            })
            .toMatchObject({ matches: true })
        const snapshot = await plSnapshot(page)
        expect(snapshot.title).toBe(PROFIT_AND_LOSS_TITLE)
        expect(snapshot.header.endsWith(dayWords(today))).toBe(true)

        const chips = await page
            .getByTestId('report-controls')
            .locator('[data-testid^="report-param-"]')
            .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))
        expect(chips).toEqual(['report-param-period', 'report-param-rows'])
        await expect(page.getByTestId('report-param-period')).toContainText(
            'This fiscal year to date'
        )
        await expect(page.getByTestId('report-param-rows')).toContainText('Non-zero')
    })

    test('an income and an expense account show their amounts in their sections', async ({
        page,
    }) => {
        await startBooks(page)
        const income = uniqueName('PL income')
        const expense = uniqueName('PL expense')
        await createAccounts(page, [
            { name: income, kind: INCOME },
            { name: expense, kind: EXPENSE },
        ])
        const today = await browserToday(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('PL sale'),
            lines: [
                { account: ACCOUNT_LABELS.checking, debit: '500.00' },
                { account: income, credit: '500.00' },
            ],
        })
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('PL cost'),
            lines: [
                { account: expense, debit: '120.00' },
                { account: ACCOUNT_LABELS.checking, credit: '120.00' },
            ],
        })

        await openProfitAndLoss(page)
        await collapseAll(page)
        const incomeOpen = await openSectionTo(page, T.income, income, 'the income account')
        const incomeAt = indexOf(incomeOpen, 'group', income)
        expect(incomeAt).toBeGreaterThan(indexOf(incomeOpen, 'group', T.income))
        expect(incomeAt).toBeLessThan(indexOf(incomeOpen, 'subtotal', `Total ${T.income}`))
        expect(amountOf(incomeOpen, 'group', income)).toBe(50000)
        const afterTotal = incomeOpen.rows.slice(
            indexOf(incomeOpen, 'subtotal', `Total ${T.income}`) + 1
        )
        expect(afterTotal.filter(row => row.label === income)).toEqual([])

        const expenseOpen = await openSectionTo(page, T.expense, expense, 'the expense account')
        const expenseAt = indexOf(expenseOpen, 'group', expense)
        expect(expenseAt).toBeGreaterThan(indexOf(expenseOpen, 'group', T.expense))
        expect(expenseAt).toBeLessThan(indexOf(expenseOpen, 'subtotal', `Total ${T.expense}`))
        expect(amountOf(expenseOpen, 'group', expense)).toBe(12000)
    })

    test('the computed rows follow from the section totals', async ({ page }) => {
        await startBooks(page)
        await openProfitAndLoss(page)
        const folded = await collapseAll(page)
        expect(labels(folded)).toEqual(FOLDED_STATEMENT)

        const total = (title: string) => amountOf(folded, 'subtotal', `Total ${title}`)
        const computed = (label: string) => amountOf(folded, 'computed', label)
        expect(computed(C.grossProfit)).toBe(total(T.income) - total(T.cost_of_goods_sold))
        expect(computed(C.netOperatingIncome)).toBe(computed(C.grossProfit) - total(T.expense))
        expect(computed(C.netOtherIncome)).toBe(total(T.other_income) - total(T.other_expense))
        expect(computed(C.netIncome)).toBe(
            computed(C.netOperatingIncome) + computed(C.netOtherIncome)
        )
    })

    test('% of income divides by Total Income, and Customize hides the column', async ({
        page,
    }) => {
        await startBooks(page)
        const income = uniqueName('PL percent')
        await createAccounts(page, [{ name: income, kind: INCOME }])
        await postEntryOn(page, {
            date: await browserToday(page),
            memo: uniqueName('PL percent sale'),
            lines: [
                { account: ACCOUNT_LABELS.checking, debit: '200.00' },
                { account: income, credit: '200.00' },
            ],
        })

        await openProfitAndLoss(page)
        await collapseAll(page)
        const open = await openSectionTo(page, T.income, income, 'the income account')
        const totalIncome = rowNamed(open, 'subtotal', `Total ${T.income}`)
        expect(totalIncome?.cells.pct).toBe('100.0%')
        const share = (Math.round((20000 / cents(totalIncome?.cells.amount)) * 1000) / 10).toFixed(
            1
        )
        expect(rowNamed(open, 'group', income)?.cells.pct).toBe(`${share}%`)

        await pressToolbar(page, 'report-customize-open', 'Customize')
        await page.getByTestId('report-customize-section-columns').click()
        await expect(page.getByTestId('report-option-column-pct')).toBeVisible()
        await expect(page.getByTestId('report-option-column-sec')).toHaveCount(0)
        await page.getByTestId('report-option-column-pct').click()
        await expect(page.getByTestId('report-heading-pct')).toHaveCount(0)
        await expect(page.locator('[data-testid^="report-cell-pct-"]')).toHaveCount(0)
        await expect(page.getByTestId('report-heading-amount')).toBeVisible()
    })

    test('Rows: Non-zero hides an account that nets to zero, Active shows it at 0.00', async ({
        page,
    }) => {
        await startBooks(page)
        // Both names sort together, so the witness mounted beside the zero account
        // proves the Expenses rows around it are in the snapshot.
        const zeroed = uniqueName('PL rows zero')
        const witness = uniqueName('PL rows witness')
        await createAccounts(page, [
            { name: zeroed, kind: EXPENSE },
            { name: witness, kind: EXPENSE },
        ])
        const today = await browserToday(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('PL rows out'),
            lines: [
                { account: zeroed, debit: '40.00' },
                { account: ACCOUNT_LABELS.checking, credit: '40.00' },
            ],
        })
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('PL rows back'),
            lines: [
                { account: ACCOUNT_LABELS.checking, debit: '30.00' },
                { account: witness, debit: '10.00' },
                { account: zeroed, credit: '40.00' },
            ],
        })

        await openProfitAndLoss(page)
        await collapseAll(page)
        const nonzero = await openSectionTo(page, T.expense, witness, 'the witness account')
        expect(amountOf(nonzero, 'group', witness)).toBe(1000)
        expect(labels(nonzero)).not.toContain(zeroed)
        await rowOf(page, witness).scrollIntoViewIfNeeded()
        await expect(rowOf(page, zeroed)).toHaveCount(0)

        await chooseRows(page, 'active')
        // Fold again so only Expenses is open: its title, the zero account and its total
        // are then all mounted in the one snapshot (openSectionTo waits for both).
        await collapseAll(page)
        const active = await openSectionTo(page, T.expense, zeroed, 'the zero account under Active')
        const at = indexOf(active, 'group', zeroed)
        expect(at).toBeGreaterThan(indexOf(active, 'group', T.expense))
        expect(at).toBeLessThan(indexOf(active, 'subtotal', `Total ${T.expense}`))
        expect(rowNamed(active, 'group', zeroed)?.cells.amount).toMatch(/0\.00$/)
        expect(amountOf(active, 'group', zeroed)).toBe(0)
    })

    test('pressing an account opens its lines, labelled and in posting order', async ({ page }) => {
        await startBooks(page)
        // Unnumbered accounts sort first in a section, and "AA" before the other specs'
        // names, so the account and its lines mount at the top of the opened Income.
        const income = uniqueName('AA PL open')
        await createAccounts(page, [{ name: income, kind: INCOME }])
        const today = await browserToday(page)
        const m1 = uniqueName('PL open line memo')
        const m2 = uniqueName('PL open entry memo')
        // The first entry's memo differs from its line's, so the label proves the line's
        // memo comes first; the second line has no memo, so the entry's shows.
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('PL open first entry'),
            lines: [
                { account: ACCOUNT_LABELS.checking, debit: '45.00' },
                { account: income, credit: '45.00', memo: m1 },
            ],
        })
        const first = await postedNumber(page)
        await postEntryOn(page, {
            date: today,
            memo: m2,
            lines: [
                { account: ACCOUNT_LABELS.checking, debit: '30.00' },
                { account: income, credit: '30.00' },
            ],
        })
        const second = await postedNumber(page)

        await openProfitAndLoss(page)
        await collapseAll(page)
        // A computed row has no fold chevron, and a press on it opens nothing.
        const netIncome = rowOf(page, C.netIncome)
        await expect(netIncome).not.toHaveAttribute('aria-expanded')
        await expect(netIncome).not.toHaveAttribute('role', 'button')
        await netIncome.click()
        // The folded statement mounts every row, so this snapshot sees all of it.
        const folded = await plSnapshot(page)
        expect(indexOf(folded, 'computed', C.netIncome)).toBeGreaterThanOrEqual(0)
        expect(folded.rows.filter(row => row.kind === 'detail')).toEqual([])

        const before = await openSectionTo(page, T.income, income, 'the income account')
        expect(plLinesUnder(before, income)).toEqual([])
        expect(before.rows.filter(row => row.kind === 'detail')).toEqual([])

        await openProfitAndLossAccount(page, income)
        const open = await snapshotWhen(
            page,
            plSnapshot,
            s => plLinesUnder(s, income).length === 2,
            'the two lines beneath the account'
        )
        const lines = plLinesUnder(open, income)
        expect(lines.map(line => line.label)).toEqual([
            `${today} · ${first} · ${m1}`,
            `${today} · ${second} · ${m2}`,
        ])
        expect(lines.map(line => cents(line.cells.amount))).toEqual([4500, 3000])
        expect(lines.map(line => line.cells.pct ?? '')).toEqual(['', ''])
    })

    test('the open report re-runs on a post from another page', async ({ page, browser }) => {
        await startBooks(page)
        await openProfitAndLoss(page)
        await collapseAll(page)
        await rowOf(page, T.income).click()
        await expect(rowOf(page, T.income)).toHaveAttribute('aria-expanded', 'true')
        await page.evaluate(() => {
            ;(window as unknown as { plNotReloaded?: boolean }).plNotReloaded = true
        })

        // Page B is a second browser context signed in as the same user: its own session
        // and its own realtime connection, so the post reaches page A through the server.
        // The name sorts first among the unnumbered Income accounts, so its row mounts.
        const income = uniqueName('AA PL live')
        const otherContext = await browser.newContext()
        try {
            const other = await otherContext.newPage()
            await startBooks(other)
            await createAccounts(other, [{ name: income, kind: INCOME }])
            await postEntryOn(other, {
                date: await browserToday(other),
                memo: uniqueName('PL live post'),
                lines: [
                    { account: ACCOUNT_LABELS.checking, debit: '60.00' },
                    { account: income, credit: '60.00' },
                ],
            })

            const live = await snapshotWhen(
                page,
                plSnapshot,
                s => indexOf(s, 'group', income) >= 0,
                'the new account in the open report'
            )
            expect(amountOf(live, 'group', income)).toBe(6000)
            const notReloaded = await page.evaluate(
                () => (window as unknown as { plNotReloaded?: boolean }).plNotReloaded
            )
            expect(notReloaded).toBe(true)
        } finally {
            await otherContext.close()
        }
    })

    test('by month: one column per month headed in words, then Total and % of income', async ({
        page,
    }) => {
        await startBooks(page)
        // Unnumbered accounts sort first in a section, and "AA" before the other specs'
        // names, so the account mounts at the top of the opened Income.
        const income = uniqueName('AA PL month')
        await createAccounts(page, [{ name: income, kind: INCOME }])
        const today = await browserToday(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('PL month sale'),
            lines: [
                { account: ACCOUNT_LABELS.checking, debit: '90.00' },
                { account: income, credit: '90.00' },
            ],
        })

        await openProfitAndLossByMonth(page)
        const from = firstOfLastMonth(today)
        const lastMonth = monthWords(from)
        const thisMonth = monthWords(today)
        await choosePeriod(page, { from, to: today })
        // The default period's run stays on screen until this one lands: only this run
        // heads exactly the two months.
        await snapshotWhen(
            page,
            plSnapshot,
            s => monthHeadings(s).join('|') === [lastMonth, thisMonth].join('|'),
            'the two month columns of the chosen period'
        )
        await collapseAll(page)
        const open = await openSectionTo(page, T.income, income, 'the income account')

        expect(Object.values(open.headings)).toEqual([
            'Account',
            lastMonth,
            thisMonth,
            'Total',
            '% of income',
        ])
        const columnOf = (heading: string) => {
            const id = Object.keys(open.headings).find(key => open.headings[key] === heading)
            if (!id) throw new Error(`no column headed "${heading}"`)
            return id
        }
        const row = rowNamed(open, 'group', income)
        expect(cents(row?.cells[columnOf(lastMonth)])).toBe(0)
        expect(cents(row?.cells[columnOf(thisMonth)])).toBe(9000)
        expect(cents(row?.cells[columnOf('Total')])).toBe(9000)

        // A pivot's innermost level never opens: no chevron, and a press opens no line.
        const account = rowOf(page, income)
        await expect(account).not.toHaveAttribute('aria-expanded')
        await expect(account).not.toHaveAttribute('role', 'button')
        const pressed = await expectPressOpensNothing(page, income)
        expect(indexOf(pressed, 'group', income)).toBeGreaterThanOrEqual(0)
        expect(plLinesUnder(pressed, income)).toEqual([])
        expect(pressed.rows.filter(r => r.kind === 'detail')).toEqual([])
    })

    test('on a phone the Profit and Loss wraps each row under its label, the by-month report wraps its figures, and nothing scrolls sideways', async ({
        page,
    }) => {
        await startBooks(page)
        // Unnumbered accounts sort first in a section, and "AA" before the other specs'
        // names, so the account mounts at the top of Income, the first section.
        const income = uniqueName('AA PL phone')
        await createAccounts(page, [{ name: income, kind: INCOME }])
        const today = await browserToday(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('PL phone sale'),
            lines: [
                { account: ACCOUNT_LABELS.checking, debit: '75.00' },
                { account: income, credit: '75.00' },
            ],
        })

        // The phone path: Reports from the Books menu drawer (openBooksReports).
        await page.setViewportSize(PHONE)
        await openProfitAndLoss(page)
        await expect
            .poll(async () => {
                const snapshot = await plSnapshot(page)
                const expected = await expectedHeading(page)
                return {
                    matches: snapshot.business === expected && expected !== '',
                    shown: snapshot.business,
                    expected,
                }
            })
            .toMatchObject({ matches: true })
        const header = await plSnapshot(page)
        expect(header.title).toBe(PROFIT_AND_LOSS_TITLE)
        expect(header.header.endsWith(dayWords(today))).toBe(true)
        await expect(page.getByTestId('report-param-period')).toBeVisible()
        await expect(page.getByTestId('report-param-period')).toContainText(
            'This fiscal year to date'
        )
        await expect(page.getByTestId('report-param-rows')).toBeVisible()
        await expect(page.getByTestId('report-param-rows')).toContainText('Non-zero')

        const s = await snapshotWhen(
            page,
            plSnapshot,
            snap => indexOf(snap, 'group', income) >= 0,
            'the phone account in the open Income'
        )
        const rowId = rowNamed(s, 'group', income)?.id ?? ''
        expect(await waitForTableFit(page)).toBe('mobile')
        await expect
            .poll(async () => phoneRowShape(await fitGeometry(page, rowId)), {
                message: 'the label, then Total · % of income on the line below (spec §3 Phone)',
            })
            .toEqual({
                measured: true,
                labelOneLine: true,
                figuresShareALine: true,
                figuresBelowLabel: true,
                noSidewaysScroll: true,
                cutFigures: [],
            })

        await openProfitAndLossByMonth(page)
        const month = await snapshotWhen(
            page,
            plSnapshot,
            snap => indexOf(snap, 'group', income) >= 0 && monthHeadings(snap).length > 0,
            'the phone account in the by-month report'
        )
        const monthRowId = rowNamed(month, 'group', income)?.id ?? ''
        // Guard (green on checkpoint 3): the by-month report has no layouts, so core's
        // automatic lines wrap its figures: the label and the first months, then the
        // other figures in column order on the lines below.
        expect(await waitForTableFit(page)).toBe('auto')
        await expect
            .poll(async () => byMonthWrapShape(await fitGeometry(page, monthRowId)), {
                message: "core's automatic lines, each figure whole inside the table",
            })
            .toEqual({
                measured: true,
                hasMonths: true,
                automaticLines: true,
                figuresInsideTable: true,
                noSidewaysScroll: true,
                cutFigures: [],
            })
    })

    // Guards (green on checkpoint 3: the one line already holds at 1024 and 1280 without a
    // display, and the by-month display shipped there). The report view has no Books
    // sidebar, so the rows get the window less the rail: at both widths the one line
    // holds (D5), and the by-month report draws the layout core chose.
    for (const size of [
        { width: 1280, height: 800 },
        { width: 1024, height: 800 },
    ]) {
        test(`at ${size.width} both reports fit: a long label narrows with an ellipsis, every figure stays whole inside the table`, async ({
            page,
        }) => {
            await startBooks(page)
            // 90 characters (under the 200 the name field allows), wider than the label
            // cell at both widths: padded with "W", the widest letter, since 90 plain
            // characters take about 600 px and the label cell is about 950 px at 1280.
            // "AA" mounts it at the top of Income.
            const income = `${uniqueName('AA PL fit')} `.padEnd(90, 'W').slice(0, 90)
            expect(income.length).toBe(90)
            await createAccounts(page, [{ name: income, kind: INCOME }])
            await postEntryOn(page, {
                date: await browserToday(page),
                memo: uniqueName('PL fit sale'),
                lines: [
                    { account: ACCOUNT_LABELS.checking, debit: '1234.56' },
                    { account: income, credit: '1234.56' },
                ],
            })

            await page.setViewportSize(size)
            await openProfitAndLoss(page)
            const s = await snapshotWhen(
                page,
                plSnapshot,
                snap => indexOf(snap, 'group', income) >= 0,
                'the long account in the open Income'
            )
            const rowId = rowNamed(s, 'group', income)?.id ?? ''
            expect(await waitForTableFit(page), `the layout at ${size.width}`).toBe('one-line')
            await expect
                .poll(async () => oneLineShape(await fitGeometry(page, rowId)), {
                    message: `the one line at ${size.width}: label cut with an ellipsis, figures whole`,
                })
                .toEqual({
                    measured: true,
                    oneTop: true,
                    labelCutWithEllipsis: true,
                    headingsShown: true,
                    figuresInsideTable: true,
                    noSidewaysScroll: true,
                    cutFigures: [],
                    sectionKeyParts: 0,
                })

            await openProfitAndLossByMonth(page)
            const month = await snapshotWhen(
                page,
                plSnapshot,
                snap => indexOf(snap, 'group', income) >= 0 && monthHeadings(snap).length > 0,
                'the long account in the by-month report'
            )
            const monthRowId = rowNamed(month, 'group', income)?.id ?? ''
            const layout = await waitForTableFit(page)
            expect(['one-line', 'auto'], `the by-month layout at ${size.width}`).toContain(layout)
            await expect
                .poll(async () => byMonthWideShape(await fitGeometry(page, monthRowId), layout), {
                    message: `the by-month ${layout} layout at ${size.width}`,
                })
                .toEqual({
                    measured: true,
                    hasMonths: true,
                    layoutGeometry: true,
                    headingsShown: true,
                    figuresInsideTable: true,
                    noSidewaysScroll: true,
                    cutFigures: [],
                    sectionKeyParts: 0,
                })
        })
    }
})

// A box of a row's label or one of its cells. `cut`: the element, or a child, is wider
// than its box; `ellipsis`: the part that is cut draws an ellipsis (text-overflow).
type FitBox = {
    col: string
    top: number
    bottom: number
    left: number
    right: number
    cut: boolean
    ellipsis: boolean
}

type FitGeometry = {
    // The row's label (report-row-<id>) and the number of text lines it draws.
    label: FitBox
    labelLines: number
    // The report's columns but the label's, in order: every heading, drawn or not.
    columnOrder: string[]
    // The row's cells, in column order (the order of the headings).
    cells: FitBox[]
    // The column headings but the label's, in order, with their right edges.
    headings: { col: string; right: number }[]
    // Every drawn figure cell of the table (any row), by column.
    figures: FitBox[]
    tableRight: number
    tableScrollWidth: number
    tableClientWidth: number
    // Headings and cells of the hidden section key column.
    sectionKeyParts: number
}

// The geometry of row `id` and of the table around it, read in ONE page.evaluate. Null
// when the row is not mounted.
function fitGeometry(page: Page, id: string): Promise<FitGeometry | null> {
    return page.evaluate(rowId => {
        const table = document.querySelector('[data-testid="report-table"]') as HTMLElement | null
        const row = table?.querySelector(`[data-testid="${CSS.escape(`report-row-${rowId}`)}"]`)
        if (!table || !row) return null
        const box = (col: string, element: Element) => {
            const rect = element.getBoundingClientRect()
            const over = [element, ...element.querySelectorAll('*')].filter(
                e => e instanceof HTMLElement && e.scrollWidth > e.clientWidth
            )
            return {
                col,
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                cut: over.length > 0,
                ellipsis: over.some(e => getComputedStyle(e).textOverflow === 'ellipsis'),
            }
        }
        const drawn = (element: Element) => element.getBoundingClientRect().height > 0
        const headings = [...table.querySelectorAll('[data-testid^="report-heading-"]')]
            .filter(drawn)
            .map(element => ({
                col: (element.getAttribute('data-testid') ?? '').slice('report-heading-'.length),
                right: element.getBoundingClientRect().right,
            }))
            .filter(heading => heading.col !== 'row' && heading.col !== 'account')
        // The column order is the order of every heading, drawn or not: a layout that hides
        // the headings must not leave the cells without an order to be checked against.
        const order = [...table.querySelectorAll('[data-testid^="report-heading-"]')]
            .map(element =>
                (element.getAttribute('data-testid') ?? '').slice('report-heading-'.length)
            )
            .filter(col => col !== 'row' && col !== 'account')
        const cellOf = (element: Element) => {
            const rest = (element.getAttribute('data-testid') ?? '').slice('report-cell-'.length)
            const dash = rest.indexOf('-')
            return { col: rest.slice(0, dash), id: rest.slice(dash + 1) }
        }
        const allCells = [...table.querySelectorAll('[data-testid^="report-cell-"]')].filter(drawn)
        const cells = allCells
            .filter(element => cellOf(element).id === rowId)
            .map(element => box(cellOf(element).col, element))
            .sort((a, b) => order.indexOf(a.col) - order.indexOf(b.col))
        const figures = allCells
            .filter(element => cellOf(element).col !== 'account')
            .map(element => box(cellOf(element).col, element))
        // The label's text is its last child (a group's caret comes before it); a Range
        // over it gives one rect per drawn line.
        const text = row.lastElementChild ?? row
        const range = document.createRange()
        range.selectNodeContents(text)
        const tops: number[] = []
        for (const rect of range.getClientRects()) {
            if (rect.height > 0 && !tops.some(top => Math.abs(top - rect.top) < 2)) {
                tops.push(rect.top)
            }
        }
        return {
            label: box('label', row),
            labelLines: tops.length,
            columnOrder: order,
            cells,
            headings,
            figures,
            tableRight: table.getBoundingClientRect().right,
            tableScrollWidth: table.scrollWidth,
            tableClientWidth: table.clientWidth,
            sectionKeyParts: table.querySelectorAll(
                '[data-testid="report-heading-sec"], [data-testid^="report-cell-sec-"]'
            ).length,
        }
    }, id)
}

const near = (a: number | undefined, b: number | undefined, slack = 1) =>
    a !== undefined && b !== undefined && Math.abs(a - b) <= slack

const FIGURE_COLUMNS = ['amount', 'pct']

const isMonthColumn = (col: string) => !FIGURE_COLUMNS.includes(col) && col !== 'sec'

// Every figure cell that shows an ellipsis or is cut, named `<column>`.
function cutFigures(g: FitGeometry | null, columns?: readonly string[]): string[] {
    return (g?.figures ?? [])
        .filter(cell => (columns ? columns.includes(cell.col) : true))
        .filter(cell => cell.cut || cell.ellipsis)
        .map(cell => cell.col)
}

function insideTable(g: FitGeometry | null, rights: number[]): boolean {
    return g !== null && rights.every(right => right <= g.tableRight + 0.5)
}

// Spec §3 Phone: the label on one line; Total and % of income share the line below it.
function phoneRowShape(g: FitGeometry | null) {
    const amount = g?.cells.find(cell => cell.col === 'amount')
    const pct = g?.cells.find(cell => cell.col === 'pct')
    return {
        measured: g !== null && amount !== undefined && pct !== undefined,
        labelOneLine: g?.labelLines === 1,
        figuresShareALine: near(amount?.top, pct?.top),
        figuresBelowLabel:
            amount !== undefined &&
            g !== null &&
            amount.top > g.label.top + 1 &&
            amount.top >= g.label.bottom - 1,
        noSidewaysScroll: g !== null && g.tableScrollWidth === g.tableClientWidth,
        cutFigures: cutFigures(g, FIGURE_COLUMNS),
    }
}

// Core's automatic lines (spec §3 by month, Every width fits): the label and the first
// figures on the first line, then the remaining figures in column order, wrapping. So the
// row draws more than one line, the label's line holds the first figure, no figure sits
// above it, and the figures read line by line, left to right, in column order.
function automaticLines(g: FitGeometry | null): boolean {
    const cells = (g?.cells ?? []).filter(cell => cell.col !== 'account')
    if (g === null || cells.length === 0) return false
    // The column order comes from the report's headings, never from the cells' own DOM
    // order, so cells drawn out of column order fail.
    const shown = new Set(cells.map(cell => cell.col))
    const columnOrder = g.columnOrder.filter(col => shown.has(col))
    if (columnOrder.length !== shown.size) return false
    const inReadingOrder = [...cells].sort((a, b) =>
        near(a.top, b.top) ? a.left - b.left : a.top - b.top
    )
    const first = inReadingOrder[0]
    return (
        first?.col === columnOrder[0] &&
        near(first?.top, g.label.top) &&
        cells.every(cell => cell.top >= g.label.top - 1) &&
        cells.some(cell => cell.top >= g.label.bottom - 1) &&
        inReadingOrder.map(cell => cell.col).join('|') === columnOrder.join('|')
    )
}

// The by-month report on a phone (core automatic lines), each figure whole and inside the
// table.
function byMonthWrapShape(g: FitGeometry | null) {
    const cells = g?.cells ?? []
    return {
        measured: g !== null,
        hasMonths:
            cells.some(cell => isMonthColumn(cell.col)) &&
            FIGURE_COLUMNS.every(col => cells.some(cell => cell.col === col)),
        automaticLines: automaticLines(g),
        figuresInsideTable: insideTable(
            g,
            cells.map(cell => cell.right)
        ),
        noSidewaysScroll: g !== null && g.tableScrollWidth === g.tableClientWidth,
        cutFigures: cutFigures(g),
    }
}

// The headings of Total and % of income are drawn, and every heading and drawn figure
// cell ends inside the table's right edge.
function headingsAndFigures(g: FitGeometry | null) {
    const shown = new Set(g?.headings.map(heading => heading.col) ?? [])
    return {
        headingsShown: FIGURE_COLUMNS.every(col => shown.has(col)),
        figuresInsideTable: insideTable(g, [
            ...(g?.headings ?? []).map(heading => heading.right),
            ...(g?.figures ?? []).map(cell => cell.right),
        ]),
    }
}

// The Profit and Loss on one line (spec §3 Every width fits): every cell of the row
// shares the label's top; the long label is cut with an ellipsis, no figure is.
function oneLineShape(g: FitGeometry | null) {
    const cells = g?.cells ?? []
    return {
        measured: g !== null && FIGURE_COLUMNS.every(col => cells.some(cell => cell.col === col)),
        oneTop: g !== null && cells.every(cell => near(cell.top, g.label.top)),
        labelCutWithEllipsis: (g?.label.cut ?? false) && (g?.label.ellipsis ?? false),
        ...headingsAndFigures(g),
        noSidewaysScroll: g !== null && g.tableScrollWidth === g.tableClientWidth,
        cutFigures: cutFigures(g),
        sectionKeyParts: g?.sectionKeyParts ?? -1,
    }
}

// The by-month report at a desktop width, in the layout core reported (D5): one line
// (every cell on the label's top), or core's automatic lines (automaticLines).
function byMonthWideShape(g: FitGeometry | null, layout: string) {
    const cells = g?.cells ?? []
    const geometry =
        layout === 'one-line'
            ? g !== null && cells.every(cell => near(cell.top, g.label.top))
            : automaticLines(g)
    return {
        measured: g !== null,
        hasMonths:
            cells.some(cell => isMonthColumn(cell.col)) &&
            FIGURE_COLUMNS.every(col => cells.some(cell => cell.col === col)),
        layoutGeometry: geometry,
        ...headingsAndFigures(g),
        noSidewaysScroll: g !== null && g.tableScrollWidth === g.tableClientWidth,
        cutFigures: cutFigures(g),
        sectionKeyParts: g?.sectionKeyParts ?? -1,
    }
}

// The first day of the month before `day` (YYYY-MM-DD).
function firstOfLastMonth(day: string): string {
    const year = Number(day.slice(0, 4))
    const month = Number(day.slice(5, 7))
    const last = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    return `${last.year}-${String(last.month).padStart(2, '0')}-01`
}

// A day's month in the words core heads a month column with ("Oct 2026").
function monthWords(day: string): string {
    const date = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 1))
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date)
}

// The headings of the month columns, in column order: every heading but the label's,
// Total's and % of income's.
function monthHeadings(snapshot: PlSnapshot): string[] {
    return Object.entries(snapshot.headings)
        .filter(([id]) => id !== 'account' && id !== 'amount' && id !== 'pct')
        .map(([, text]) => text)
}
