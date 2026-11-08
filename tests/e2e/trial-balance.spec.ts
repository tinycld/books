import { expect, type Page, test } from '@playwright/test'
import {
    authStorageKey,
    chooseParamOption,
    hubRow,
    login,
    navigateToPackage,
    pressToolbar,
    waitForTableFit,
} from '@tinycld/core/e2e-helpers'
import { ACCOUNT_TYPES } from '~/tinycld/books/lib/account-types'
import { createAccount, DESKTOP, openChart, PHONE } from './account-register-helpers'
import {
    browserToday,
    chooseAsOf,
    dayWords,
    detailsUnder,
    endOfLastMonth,
    filterToAccounts,
    openAccountRow,
    openBooksReports,
    openTrialBalance,
    type TbSnapshot,
    tbSnapshot,
} from './books-report-helpers'
import {
    ACCOUNT_LABELS,
    createPostedEntry,
    fillLine,
    openNewEntry,
    postOpenEntry,
} from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// The shipped Trial Balance in core's report view (/a/reports/<id>), read by the e2e
// user, who is not the first admin and so reaches it through the viewer share Books
// keeps (server/report_shares.go). Every test makes its own accounts and entries through
// the UI (account panel, journal entry form), dated today, names them with `uniqueName`,
// and reads rows and totals in ONE snapshot (`tbSnapshot`). No test hard-codes a fiscal
// month, a close date or a seeded balance: books-settings.spec.ts changes both on the
// shared DB for a few seconds.
//
// The table is a FlashList, so only mounted rows are in the DOM, and the shared DB holds
// every other spec's accounts. A test that reads rows or the Total narrows the report to
// its own accounts (or the seeded ones it reads) with the Accounts filter, then asserts
// the Total row is in its snapshot, the proof that every row above it mounted.
//
// The retained-earnings test reads the seeded PRIOR_YEAR_SEED entry (two calendar years
// ago): a post dated before the close date that books-settings.spec.ts holds would be
// refused. It also posts one line to Consulting Income dated today, because the seeded
// Consulting Income lines of this year fall in the previous fiscal year while that spec
// holds fiscal month 7, and the row and its lines must exist for any fiscal month.
//
// It does not cover what core's own e2e cover for every report: Customize, loading, no
// access, Copy link and Save as, error, timeout and options-load failures (see the
// checkpoint's list). The document header, the chip order and the default chips are
// checkpoint 5's sidebar test.

const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const CREDIT_CARD = { type: 'Credit card', detailType: 'Credit card' }
const BANK = { type: 'Bank', detailType: 'Checking' }

const SEEDED_EQUITY_AND_INCOME = ['Retained earnings', "Owner's Equity", 'Consulting Income']

// The seeded accounts the Trial Balance shows as of the end of last month.
const SEEDED_DEFAULT_ROWS = [
    'Business Checking',
    'Business Savings',
    'Accounts receivable',
    'Office Equipment',
    'Company Card',
    "Owner's Equity",
    'Retained earnings',
    'Consulting Income',
    'Rent',
    'Software Subscriptions',
]

// The account types in chart order (server/account_types.json, mirrored by lib).
const CHART_TYPE_ORDER = ACCOUNT_TYPES.map(type => type.key)

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

type Row = TbSnapshot['rows'][number]

async function startBooks(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

async function createAccounts(page: Page, accounts: { name: string; kind: typeof EXPENSE }[]) {
    await openChart(page)
    for (const { name, kind } of accounts) await createAccount(page, name, kind)
}

// The entries list from the Books sidebar: the chart has no way to it, and openNewEntry
// expects the list, an entry or the Lists hub on screen.
async function openEntriesFromSidebar(page: Page) {
    const item = page.getByTestId('books-nav-entries')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    await expect(toggle).toBeVisible()
    if (!(await item.isVisible())) await toggle.click()
    await item.click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

async function postEntry(page: Page, amount: string, debitAccount: string, creditAccount: string) {
    await createPostedEntry(page, {
        memo: uniqueName('TB entry'),
        amount,
        debitAccount,
        creditAccount,
    })
}

let accountNumberCounter = 0

// An account number unique on the shared DB and within `books_accounts.number`'s
// 20 characters and pattern: "TB<worker>-<counter>-<7 digits of the clock>", at most
// 16 characters for any worker index below 1000 and fewer than 100 numbers a worker.
function uniqueAccountNumber() {
    accountNumberCounter += 1
    return `TB${test.info().workerIndex}-${accountNumberCounter}-${Date.now() % 10_000_000}`
}

// The posted entry's number, from its read-only title ("Journal entry JE-12").
async function postedNumber(page: Page) {
    const title = await page.getByTestId('entry-title').innerText()
    return title.replace(/^Journal entry /, '')
}

function groupRow(snapshot: TbSnapshot, label: string): Row | undefined {
    return snapshot.rows.find(row => row.kind === 'group' && row.label === label)
}

function groupIndex(snapshot: TbSnapshot, label: string) {
    return snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
}

function groupLabels(snapshot: TbSnapshot) {
    return snapshot.rows.filter(row => row.kind === 'group').map(row => row.label)
}

function figures(row: Row | undefined) {
    if (!row) return null
    return { debit: row.debit, credit: row.credit }
}

// Polls snapshots until `isReady` holds and returns that snapshot, so every later
// assertion reads the same single snapshot.
async function snapshotWhen(
    page: Page,
    isReady: (snapshot: TbSnapshot) => boolean,
    message: string
): Promise<TbSnapshot> {
    const last: { snapshot: TbSnapshot } = {
        snapshot: { rows: [], total: { label: '', debit: '', credit: '' } },
    }
    await expect
        .poll(
            async () => {
                last.snapshot = await tbSnapshot(page)
                return isReady(last.snapshot)
            },
            { message }
        )
        .toBe(true)
    return last.snapshot
}

// Every row of the run is mounted once the Total row, the last one, is.
function isWhole(snapshot: TbSnapshot) {
    return snapshot.total.label === 'Total'
}

// The run for the new filter has landed: the view keeps the previous run's rows on
// screen until then, so a check for a row the old run also showed is not enough.
function showsOnly(snapshot: TbSnapshot, labels: readonly string[]) {
    return isWhole(snapshot) && groupLabels(snapshot).every(label => labels.includes(label))
}

async function filterAccounts(page: Page, name: string) {
    await chooseParamOption(page, 'accounts', { from: 'add-filter', search: name, labels: [name] })
}

test.describe("trial-balance: the report in core's view", () => {
    test('an account shows its net by sign, and the totals add the rows shown', async ({
        page,
    }) => {
        await startBooks(page, DESKTOP)
        const expense = uniqueName('TB expense')
        const card = uniqueName('TB card')
        await createAccounts(page, [
            { name: expense, kind: EXPENSE },
            { name: card, kind: CREDIT_CARD },
        ])
        await openEntriesFromSidebar(page)
        await postEntry(page, '123.45', expense, card)

        await openTrialBalance(page)
        await chooseAsOf(page, { preset: 'today' })
        await filterToAccounts(page, [expense, card])
        const first = await snapshotWhen(
            page,
            s => showsOnly(s, [expense, card]) && groupRow(s, expense) !== undefined,
            'the report narrowed to the two accounts'
        )
        expect(groupLabels(first).sort()).toEqual([card, expense].sort())
        expect(figures(groupRow(first, expense))).toEqual({ debit: '123.45', credit: '' })
        expect(figures(groupRow(first, card))).toEqual({ debit: '', credit: '123.45' })

        await navigateToPackage(page, 'books')
        await postEntry(page, '200.00', card, expense)
        await openTrialBalance(page)
        await chooseAsOf(page, { preset: 'today' })
        await filterToAccounts(page, [expense, card])
        const second = await snapshotWhen(
            page,
            s => showsOnly(s, [expense, card]) && groupRow(s, expense)?.credit === '76.55',
            'the two accounts after the second entry'
        )
        expect(figures(groupRow(second, expense))).toEqual({ debit: '', credit: '76.55' })
        expect(figures(groupRow(second, card))).toEqual({ debit: '76.55', credit: '' })
        const amounts = [
            ...second.rows.flatMap(row => [row.debit, row.credit]),
            second.total.debit,
            second.total.credit,
        ]
        expect(amounts.filter(text => text.startsWith('-') || text.startsWith('('))).toEqual([])
        expect(second.total.label).toBe('Total')
        expect(second.total.debit).toMatch(/^\$/)
        expect(second.total.credit).toMatch(/^\$/)
        expect(second.total.debit).toBe(second.total.credit)
        expect(second.total.debit).toBe('$76.55')
    })

    test('Rows: Non-zero hides a zero net, Active shows it as 0.00, All adds an idle account', async ({
        page,
    }) => {
        await startBooks(page, DESKTOP)
        const a = uniqueName('TB rows A')
        const b = uniqueName('TB rows B')
        const c = uniqueName('TB rows C')
        await createAccounts(page, [
            { name: a, kind: EXPENSE },
            { name: b, kind: EXPENSE },
            { name: c, kind: EXPENSE },
        ])
        await openEntriesFromSidebar(page)
        await postEntry(page, '50.00', a, b)
        await postEntry(page, '50.00', b, a)

        await openTrialBalance(page)
        await chooseAsOf(page, { preset: 'today' })
        await filterToAccounts(page, [a, b, c])
        // Under Non-zero the three accounts (nets of zero, and no lines) leave no row.
        await expect(page.getByTestId('report-empty-message')).toHaveText(
            `No rows as of ${dayWords(await browserToday(page))}`
        )

        await chooseParamOption(page, 'rows', { from: 'chip', labels: ['Active'] })
        const active = await snapshotWhen(
            page,
            s => isWhole(s) && groupRow(s, a) !== undefined,
            'the three accounts under Active'
        )
        expect(figures(groupRow(active, a))).toEqual({ debit: '0.00', credit: '' })
        expect(figures(groupRow(active, b))).toEqual({ debit: '0.00', credit: '' })
        expect(groupLabels(active).sort()).toEqual([a, b].sort())

        await chooseParamOption(page, 'rows', { from: 'chip', labels: ['All'] })
        const all = await snapshotWhen(
            page,
            s => isWhole(s) && groupRow(s, c) !== undefined,
            'the three accounts under All'
        )
        expect(figures(groupRow(all, c))).toEqual({ debit: '', credit: '' })
        expect(groupLabels(all).sort()).toEqual([a, b, c].sort())
    })

    for (const [sizeName, size] of SIZES) {
        test(`the Accounts filter picks an account, then a whole type, then clears (${sizeName})`, async ({
            page,
        }) => {
            await startBooks(page, DESKTOP)
            const first = uniqueName(`TB filter expense one ${sizeName}`)
            const second = uniqueName(`TB filter expense two ${sizeName}`)
            const bank = uniqueName(`TB filter bank ${sizeName}`)
            await createAccounts(page, [
                { name: first, kind: EXPENSE },
                { name: second, kind: EXPENSE },
                { name: bank, kind: BANK },
            ])
            await openEntriesFromSidebar(page)
            await postEntry(page, '10.00', first, bank)
            await postEntry(page, '20.00', second, bank)

            await openTrialBalance(page)
            await page.setViewportSize(size)
            await chooseAsOf(page, { preset: 'today' })

            await filterAccounts(page, first)
            const one = await snapshotWhen(
                page,
                s => isWhole(s) && groupLabels(s).length === 1,
                'the report narrowed to one account'
            )
            expect(groupLabels(one)).toEqual([first])
            await expect(page.getByTestId('report-param-accounts')).toContainText(first)

            await page.getByTestId('report-param-accounts').click()
            const picker = page.getByTestId('report-filter-picker')
            await expect(picker).toBeVisible()
            // The type groups come in chart order. The shared DB holds other specs'
            // accounts, so the types present are some of them, in that order.
            const groupPicks = picker.locator('[data-testid^="report-filter-group-"]')
            await expect.poll(() => groupPicks.count()).toBeGreaterThanOrEqual(2)
            const shownTypes = await groupPicks.evaluateAll(picks =>
                picks.map(pick =>
                    (pick.getAttribute('data-testid') ?? '').slice('report-filter-group-'.length)
                )
            )
            expect(shownTypes.filter(type => !CHART_TYPE_ORDER.includes(type))).toEqual([])
            expect(shownTypes).toEqual(
                [...shownTypes].sort(
                    (x, y) => CHART_TYPE_ORDER.indexOf(x) - CHART_TYPE_ORDER.indexOf(y)
                )
            )
            await picker.getByTestId('report-filter-search').fill(first)
            const wholeType = picker.getByTestId('report-filter-group-expense')
            await expect(wholeType).toHaveText('All Expense accounts')
            await wholeType.click()
            await picker.getByTestId('report-filter-apply').click()
            await expect(picker).toBeHidden()
            // Every Expense account in the shared DB shows now, so the Total row can be
            // below the FlashList's mounted rows; `second` (absent from the one-account
            // run) proves the new run landed. The test's accounts have no number, and
            // number-less accounts sort first in their type, so they are mounted.
            const expenses = await snapshotWhen(
                page,
                s => groupRow(s, second) !== undefined,
                'the report narrowed to every Expense account'
            )
            expect(groupLabels(expenses)).toContain(first)
            expect(groupLabels(expenses)).not.toContain(bank)

            await page.getByTestId('report-filter-remove-accounts').click()
            await expect(page.getByTestId('report-param-accounts')).toHaveCount(0)
            await snapshotWhen(
                page,
                s => groupRow(s, bank) !== undefined,
                'the bank account back after the filter is removed'
            )
        })
    }

    test('opening an account shows its posted lines, each labelled with its date, number and memo', async ({
        page,
    }) => {
        await startBooks(page, DESKTOP)
        const account = uniqueName('TB drill')
        const number = uniqueAccountNumber()
        const lineMemo = uniqueName('TB line memo')
        const entryMemo = uniqueName('TB entry memo')
        await openChart(page)
        await createAccount(page, account, EXPENSE, number)
        // The entry form's account picker names an account by number and name.
        const accountChoice = `${number} ${account}`
        await openEntriesFromSidebar(page)
        await openNewEntry(page)
        await page.getByTestId('entry-memo').fill(uniqueName('TB entry with a line memo'))
        await fillLine(page, 0, { account: accountChoice, debit: '40.00', memo: lineMemo })
        await fillLine(page, 1, { account: ACCOUNT_LABELS.checking, credit: '40.00' })
        await postOpenEntry(page)
        const withLineMemo = await postedNumber(page)
        await createPostedEntry(page, {
            memo: entryMemo,
            amount: '25.50',
            debitAccount: accountChoice,
            creditAccount: ACCOUNT_LABELS.checking,
        })
        const withEntryMemo = await postedNumber(page)
        const today = await browserToday(page)

        await openTrialBalance(page)
        await chooseAsOf(page, { preset: 'today' })
        await filterAccounts(page, account)
        await openAccountRow(page, account)
        const opened = await snapshotWhen(
            page,
            s => detailsUnder(s, account).length === 2,
            'the account opened onto its two lines'
        )
        // No. names the account on its row and is blank on its opened lines.
        expect(groupRow(opened, account)?.number).toBe(number)
        expect(detailsUnder(opened, account).map(row => row.number)).toEqual(['', ''])
        const lines = detailsUnder(opened, account).map(row => ({
            label: row.label,
            debit: row.debit,
            credit: row.credit,
        }))
        expect(lines).toHaveLength(2)
        expect(lines).toEqual(
            expect.arrayContaining([
                {
                    label: `${today} · ${withLineMemo} · ${lineMemo}`,
                    debit: '40.00',
                    credit: '',
                },
                {
                    label: `${today} · ${withEntryMemo} · ${entryMemo}`,
                    debit: '25.50',
                    credit: '',
                },
            ])
        )

        await pressToolbar(page, 'report-fold-all', 'Collapse all')
        await snapshotWhen(
            page,
            s => groupRow(s, account) !== undefined && detailsUnder(s, account).length === 0,
            'the lines closed by Collapse all'
        )
        await expect(page.getByTestId('report-fold-all')).toHaveText('Expand all')

        await pressToolbar(page, 'report-fold-all', 'Expand all')
        await snapshotWhen(
            page,
            s => detailsUnder(s, account).length === 2,
            'the lines opened again by Expand all'
        )
    })

    test('a post made on another page appears in the open report without a reload', async ({
        page,
    }) => {
        await startBooks(page, DESKTOP)
        const account = uniqueName('TB live')
        await createAccounts(page, [{ name: account, kind: EXPENSE }])
        await openTrialBalance(page)
        await chooseAsOf(page, { preset: 'today' })
        await filterToAccounts(page, [account])
        // Rows = All shows the account before it has a line.
        await chooseParamOption(page, 'rows', { from: 'chip', labels: ['All'] })
        const before = await snapshotWhen(
            page,
            s => isWhole(s) && groupRow(s, account) !== undefined,
            'the new account, with no lines yet, under All'
        )
        expect(figures(groupRow(before, account))).toEqual({ debit: '', credit: '' })
        await page.evaluate(() => {
            ;(window as unknown as { tbNotReloaded?: boolean }).tbNotReloaded = true
        })

        const other = await page.context().newPage()
        await startBooks(other, DESKTOP)
        await openEntriesFromSidebar(other)
        await postEntry(other, '15.00', account, ACCOUNT_LABELS.checking)

        const live = await snapshotWhen(
            page,
            s => groupRow(s, account)?.debit === '15.00',
            'the post in the open report'
        )
        expect(figures(groupRow(live, account))).toEqual({ debit: '15.00', credit: '' })
        const notReloaded = await page.evaluate(
            () => (window as unknown as { tbNotReloaded?: boolean }).tbNotReloaded
        )
        expect(notReloaded).toBe(true)
        await other.close()
    })

    test('earlier fiscal years fold onto Retained earnings, and a day in that year shows them on their own', async ({
        page,
    }) => {
        await startBooks(page, DESKTOP)
        const bank = uniqueName('TB retained bank')
        await createAccounts(page, [{ name: bank, kind: BANK }])
        await openEntriesFromSidebar(page)
        await postEntry(page, '1.00', bank, '4000 Consulting Income')
        const year = Number((await browserToday(page)).slice(0, 4))
        const priorDay = `${year - 2}-08-15`

        await openTrialBalance(page)
        await chooseAsOf(page, { preset: 'today' })
        await filterToAccounts(page, SEEDED_EQUITY_AND_INCOME)
        const today = await snapshotWhen(
            page,
            s =>
                showsOnly(s, SEEDED_EQUITY_AND_INCOME) &&
                groupRow(s, 'Consulting Income') !== undefined,
            'the three seeded accounts with Consulting Income'
        )
        expect(groupRow(today, 'Retained earnings')?.number).toBe('3900')
        expect(groupRow(today, "Owner's Equity")?.number).toBe('3000')
        expect(groupRow(today, 'Consulting Income')?.number).toBe('4000')
        const retained = groupIndex(today, 'Retained earnings')
        expect(retained).toBeGreaterThan(groupIndex(today, "Owner's Equity"))
        expect(retained).toBeLessThan(groupIndex(today, 'Consulting Income'))

        await openAccountRow(page, 'Consulting Income')
        const income = detailsUnder(await tbSnapshot(page), 'Consulting Income')
        expect(income.length).toBeGreaterThan(0)
        expect(income.filter(row => row.label.endsWith('Prior-year consulting'))).toEqual([])

        await openAccountRow(page, 'Retained earnings')
        const folded = new RegExp(`^${priorDay} · JE-\\d+ · Prior-year consulting$`)
        const opened = await snapshotWhen(
            page,
            s => detailsUnder(s, 'Retained earnings').some(row => folded.test(row.label)),
            'the prior-year line under Retained earnings'
        )
        const priorLine = detailsUnder(opened, 'Retained earnings').find(row =>
            folded.test(row.label)
        )
        expect(figures(priorLine)).toEqual({ debit: '', credit: '3,000.00' })

        await chooseAsOf(page, { day: priorDay })
        const thatDay = await snapshotWhen(page, isWhole, `the seeded accounts as of ${priorDay}`)
        expect(figures(groupRow(thatDay, 'Consulting Income'))).toEqual({
            debit: '',
            credit: '3,000.00',
        })
        expect(groupLabels(thatDay)).not.toContain('Retained earnings')
    })

    for (const [sizeName, size] of SIZES) {
        test(`a day with no rows shows the empty state and its way back (${sizeName})`, async ({
            page,
        }) => {
            await startBooks(page, DESKTOP)
            const account = uniqueName(`TB empty ${sizeName}`)
            await createAccounts(page, [{ name: account, kind: EXPENSE }])
            await openTrialBalance(page)
            await page.setViewportSize(size)

            const historyBefore = await page.evaluate(() => window.history.length)
            await chooseAsOf(page, { day: '1900-01-01' })
            await expect(page.getByTestId('report-empty-message')).toHaveText(
                'No rows as of January 1, 1900'
            )
            const action = page.getByTestId('report-empty-action')
            await expect(action).toHaveText('Show end of last fiscal year')
            expect(new URL(page.url()).searchParams.get('p-asOf')).toBe('1900-01-01')
            expect(await page.evaluate(() => window.history.length)).toBe(historyBefore)

            await action.click()
            await expect(page.getByTestId('report-empty')).toHaveCount(0)
            await snapshotWhen(
                page,
                s => s.rows.some(row => row.kind === 'group'),
                'account rows back after the empty action'
            )

            await chooseAsOf(page, { day: '1900-01-01' })
            await filterAccounts(page, account)
            await expect(page.getByTestId('report-param-accounts')).toBeVisible()
            await expect(action).toHaveText('Clear filters')
            await action.click()
            await expect(page.getByTestId('report-param-accounts')).toHaveCount(0)
        })
    }

    // At 390 the four columns' least widths (account: its longest word, as a wrapping
    // column never splits a word, core PR #451; No., Debit and Credit: their whole
    // values) add up to more than the row, so core's automatic lines draw the Trial
    // Balance: the account, its number and the debit on line 1, the credit on line 2.
    // The same holds for the 375 px rows of Linux CI, where the scroll bar gutter takes
    // 15 px of the 390 (measureColumns + fitTable: account 202 px at 375, 217 at 390).
    // The report is narrowed to the seeded accounts it shows by default, so another
    // spec's account, with its longer name and number, cannot change the measure. An
    // account name wraps only between words, is never cut by the two-line clamp, and no
    // figure is cut. The phone's report-controls chip row is the one element that
    // scrolls sideways, on purpose (core PR #447, layout decision D11).
    test('on a phone the credit goes to a second line, account names wrap only between words, and only the chip row scrolls sideways', async ({
        page,
    }) => {
        await startBooks(page, DESKTOP)
        await openTrialBalance(page)
        await filterToAccounts(page, SEEDED_DEFAULT_ROWS)
        await page.setViewportSize(PHONE)
        expect(await waitForTableFit(page)).toBe('auto')
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const table = document.querySelector('[data-testid="report-table"]')
                    const tableBox = table?.getBoundingClientRect()
                    const cellOf = (column: string, id: string) =>
                        table?.querySelector(
                            `[data-testid="${CSS.escape(`report-cell-${column}-${id}`)}"]`
                        ) ?? undefined
                    const labels = [
                        ...(table?.querySelectorAll('[data-testid^="report-row-g:"]') ?? []),
                    ]
                    const rows = labels.map(label => {
                        const id = (label.getAttribute('data-testid') ?? '').slice(
                            'report-row-'.length
                        )
                        return {
                            label,
                            box: label.getBoundingClientRect(),
                            number: cellOf('number', id)?.getBoundingClientRect(),
                            debit: cellOf('debit', id),
                            credit: cellOf('credit', id),
                        }
                    })
                    const measured = rows.filter(row => row.box.height > 0)
                    const onLineOne = (row: (typeof measured)[number], box?: DOMRect) =>
                        box === undefined ||
                        (box.top >= row.box.top - 1 &&
                            box.bottom <= row.box.bottom + 1 &&
                            box.left >= row.box.right - 1)
                    const texts = (element: Element) =>
                        [...element.querySelectorAll('[dir="auto"]')].filter(
                            text => (text.textContent ?? '').trim() !== ''
                        )
                    // A word split across lines has two client rects (one per line).
                    const splitWords = (text: Element) => {
                        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
                        const split: string[] = []
                        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                            for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
                                const range = document.createRange()
                                range.setStart(node, match.index)
                                range.setEnd(node, match.index + match[0].length)
                                if (range.getClientRects().length !== 1) split.push(match[0])
                            }
                        }
                        return split
                    }
                    // The two-line clamp cuts a name when a line of its text falls below
                    // the text's box.
                    const isCut = (text: Element) => {
                        const box = text.getBoundingClientRect()
                        const range = document.createRange()
                        range.selectNodeContents(text)
                        return [...range.getClientRects()].some(
                            rect => rect.bottom > box.bottom + 1
                        )
                    }
                    const figures = measured.flatMap(row =>
                        [row.debit, row.credit].flatMap(cell => (cell ? texts(cell) : []))
                    )
                    const scrollers = [...(table?.querySelectorAll('*') ?? [])].filter(element => {
                        if (element.closest('[data-testid="report-controls"]')) return false
                        const overflowX = getComputedStyle(element).overflowX
                        return overflowX === 'auto' || overflowX === 'scroll'
                    })
                    const scrolling = document.scrollingElement
                    return {
                        rowsMeasured:
                            measured.filter(row => row.debit).length >= 1 &&
                            measured.filter(row => row.credit).length >= 1,
                        numberAndDebitBeside: measured.every(
                            row =>
                                onLineOne(row, row.number) &&
                                onLineOne(row, row.debit?.getBoundingClientRect())
                        ),
                        creditBelow: measured.every(row => {
                            const credit = row.credit?.getBoundingClientRect()
                            return credit === undefined || credit.top >= row.box.bottom - 1
                        }),
                        splitWords: measured.flatMap(row => texts(row.label).flatMap(splitWords)),
                        cutNames: measured
                            .filter(row => texts(row.label).some(isCut))
                            .map(row => row.label.textContent ?? ''),
                        cutFigures: figures
                            .filter(text => text.scrollWidth > text.clientWidth + 1)
                            .map(text => text.textContent ?? ''),
                        insideTable:
                            tableBox !== undefined &&
                            measured.every(row => {
                                const credit = row.credit?.getBoundingClientRect()
                                const debit = row.debit?.getBoundingClientRect()
                                return (
                                    row.box.left >= tableBox.left - 1 &&
                                    [credit, debit].every(
                                        box => box === undefined || box.right <= tableBox.right + 1
                                    )
                                )
                            }),
                        pageFits: scrolling !== null && scrolling.scrollWidth <= window.innerWidth,
                        tableFits: scrollers.every(
                            element => element.scrollWidth <= element.clientWidth + 1
                        ),
                    }
                })
            )
            .toEqual({
                rowsMeasured: true,
                numberAndDebitBeside: true,
                creditBelow: true,
                splitWords: [],
                cutNames: [],
                cutFigures: [],
                insideTable: true,
                pageFits: true,
                tableFits: true,
            })
    })
})

// The heading core's document header prints (useReportView headingOf): the Books business
// name, else the organization's name. Read-only: books-settings.spec.ts types over the
// business name and restores it on the shared DB, so it is read when compared.
async function expectedHeading(page: Page): Promise<string> {
    const key = await authStorageKey(page)
    const token = await page.evaluate(
        k => (JSON.parse(localStorage.getItem(k) ?? '{}') as { token?: string }).token ?? '',
        key
    )
    const settings = await page.request.get(
        '/api/collections/books_settings/records/bookssettings01',
        { headers: { Authorization: token } }
    )
    expect(settings.ok()).toBe(true)
    const businessName = ((await settings.json()) as { business_name?: string }).business_name
    if (businessName?.trim()) return businessName.trim()
    const org = await page.request.get('/api/org-info')
    expect(org.ok()).toBe(true)
    return (((await org.json()) as { name?: string }).name ?? '').trim()
}

// The test ids of the report's controls, in the order the row draws them.
function controlOrder(page: Page): Promise<string[]> {
    return page
        .getByTestId('report-controls')
        .locator('[data-testid^="report-param-"], [data-testid="report-add-filter"]')
        .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid') ?? ''))
}

test.describe('trial-balance: from the Books sidebar', () => {
    for (const [sizeName, size] of SIZES) {
        test(`Reports opens the Books hub, the Trial Balance, and back (${sizeName})`, async ({
            page,
        }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            await page.setViewportSize(size)

            await openBooksReports(page)
            await expect(page).toHaveURL(/\/a\/reports\?package=books/)
            await expect(page.getByTestId('reports-hub-filter')).toContainText(
                'Showing reports from Books'
            )
            await expect(page.getByTestId('reports-hub-tab-shared')).toHaveCount(0)

            await hubRow(page, 'Trial Balance').click()
            await expect(page.getByTestId('report-screen')).toBeVisible()
            await expect(page.getByTestId('report-document-title')).toHaveText('Trial Balance')
            await expect
                .poll(async () => {
                    const shown = (
                        await page.getByTestId('report-business-name').allInnerTexts()
                    )[0]
                    const expected = await expectedHeading(page)
                    return {
                        matches: shown?.trim() === expected && expected !== '',
                        shown,
                        expected,
                    }
                })
                .toMatchObject({ matches: true })
            const lastMonthEnd = endOfLastMonth(await browserToday(page))
            await expect(page.getByTestId('report-document-period')).toHaveText(
                `As of ${dayWords(lastMonthEnd)}`
            )

            await expect(page.getByTestId('report-param-asOf')).toContainText('End of last month')
            await expect(page.getByTestId('report-param-rows')).toContainText('Non-zero')
            expect(await controlOrder(page)).toEqual([
                'report-param-asOf',
                'report-param-rows',
                'report-add-filter',
            ])
            await page.getByTestId('report-add-filter').click()
            await expect(page.getByTestId('report-add-filter-accounts')).toBeVisible()
            await page.keyboard.press('Escape')
            await expect(page.getByTestId('report-add-filter-accounts')).toHaveCount(0)

            await page.getByTestId('report-back').click()
            await expect(page).toHaveURL(/\/a\/reports\?package=books/)
            await expect(page.getByTestId('reports-hub-filter')).toBeVisible()

            await page.getByTestId('reports-hub-show-all').click()
            await expect(page.getByTestId('reports-hub-filter')).toHaveCount(0)
            await expect(page).toHaveURL(/\/a\/reports(?!.*package=)/)
        })
    }
})
