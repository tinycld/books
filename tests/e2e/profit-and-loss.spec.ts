import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, pressToolbar, rowOf } from '@tinycld/core/e2e-helpers'
import {
    PL_COMPUTED_LABELS,
    PL_SECTION_TITLES,
    PROFIT_AND_LOSS_TITLE,
} from '~/tinycld/books/lib/profit-and-loss-fixture'
import { createAccount, DESKTOP, openChart } from './account-register-helpers'
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
})

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
