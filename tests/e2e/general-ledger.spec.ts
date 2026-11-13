import { expect, type Page, test } from '@playwright/test'
import {
    chooseParamOption,
    login,
    navigateToPackage,
    pressToolbar,
    waitForTableFit,
} from '@tinycld/core/e2e-helpers'
import { createAccount, DESKTOP, openChart, PHONE } from './account-register-helpers'
import {
    browserToday,
    choosePeriod,
    dayWords,
    expectedHeading,
    filterToAccounts,
    GL_DAY_1,
    GL_DAY_2,
    type GlSnapshot,
    glSnapshot,
    openEntriesFromSidebar,
    openGeneralLedger,
    postEntryOn,
    snapshotWhen,
} from './books-report-helpers'
import { createCustomer } from './customer-form-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'
import { createPostedTransfer } from './transfer-helpers'

// The shipped General Ledger in core's report view (/a/reports/<id>), read by the e2e
// user, who is not the first admin and so reaches it through the viewer share Books keeps.
// Every test makes its own accounts, customer and entries through the UI, names them with
// `uniqueName`, narrows the report to them with the Accounts filter, and reads rows in ONE
// snapshot (`glSnapshot`). Entries are dated GL_DAY_1, GL_DAY_2 or today: never before
// 2026-07-01, so the close date and the fiscal start month books-settings.spec.ts sets on
// the shared DB neither refuse a post nor move a beginning balance.
//
// The table is a FlashList: only mounted rows are in the DOM, so a test waits for the
// Total row in its snapshot, the proof that every row above it mounted.
//
// Not covered here (core's own e2e cover them for every report): Customize, loading, no
// access, Copy link and Save as, error and timeout states.

const BANK = { type: 'Bank', detailType: 'Checking' }
const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const CREDIT_CARD = { type: 'Credit card', detailType: 'Credit card' }

type Row = GlSnapshot['rows'][number]

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

async function createAccounts(
    page: Page,
    accounts: { name: string; kind: typeof EXPENSE }[]
): Promise<void> {
    await openChart(page)
    for (const { name, kind } of accounts) await createAccount(page, name, kind)
}

// A cell's figure without the currency sign the Total rows carry.
function figure(text: string | undefined): string {
    return (text ?? '').replace('$', '')
}

function hasTotal(snapshot: GlSnapshot) {
    return snapshot.rows.some(row => row.kind === 'total')
}

function sectionLabels(snapshot: GlSnapshot) {
    return snapshot.rows.filter(row => row.kind === 'group').map(row => row.label)
}

// The rows of the section headed `label`: its opening, lines and total, up to the next
// section or the Total.
function section(snapshot: GlSnapshot, label: string): Row[] {
    const start = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
    if (start < 0) return []
    const after = snapshot.rows.slice(start + 1)
    const end = after.findIndex(row => row.kind === 'group' || row.kind === 'total')
    return end < 0 ? after : after.slice(0, end)
}

function linesOf(snapshot: GlSnapshot, label: string): Row[] {
    return section(snapshot, label).filter(row => row.kind === 'detail')
}

function openingOf(snapshot: GlSnapshot, label: string): Row | undefined {
    return section(snapshot, label).find(row => row.kind === 'opening')
}

function sectionTotal(snapshot: GlSnapshot, label: string): Row | undefined {
    return section(snapshot, label).find(row => row.kind === 'subtotal')
}

function balancesOf(rows: Row[]): string[] {
    return rows.map(row => figure(row.cells.balance))
}

// Core's period words for two days of one year (core/reports/lib/dates.ts rangeWords).
function rangeWords(from: string, to: string): string {
    return `${dayWords(from).replace(/, \d{4}$/, '')} – ${dayWords(to)}`
}

async function expectDocumentHeader(page: Page) {
    await expect(page.getByTestId('report-document-title')).toHaveText('General Ledger')
    await expect
        .poll(async () => {
            const shown = (await page.getByTestId('report-business-name').allInnerTexts())[0]
            const expected = await expectedHeading(page)
            return { matches: shown?.trim() === expected && expected !== '', shown, expected }
        })
        .toMatchObject({ matches: true })
}

// Posts `amounts` as entries on today that debit `account` and credit Business Checking.
async function postDebitsToday(page: Page, account: string, amounts: readonly string[]) {
    await openEntriesFromSidebar(page)
    const today = await browserToday(page)
    for (const amount of amounts) {
        await postEntryOn(page, {
            date: today,
            memo: uniqueName(`GL ${amount}`),
            lines: [
                { account, debit: amount },
                { account: ACCOUNT_LABELS.checking, credit: amount },
            ],
        })
    }
}

// `cut`: the element, or a child, shows an ellipsis (its text is wider than its box).
type Box = { top: number; bottom: number; cut: boolean }
type RowBoxes = { label: Box | null; cells: Record<string, Box> }

// The label box and every drawn cell box of each row, read in ONE pass.
function rowBoxes(page: Page, ids: readonly string[]): Promise<Record<string, RowBoxes>> {
    return page.evaluate(rowIds => {
        const table = document.querySelector('[data-testid="report-table"]')
        const box = (element: Element | null | undefined) => {
            if (!element) return null
            const rect = element.getBoundingClientRect()
            const cut = [element, ...element.querySelectorAll('*')].some(
                e => e instanceof HTMLElement && e.scrollWidth > e.clientWidth
            )
            return rect.height > 0 ? { top: rect.top, bottom: rect.bottom, cut } : null
        }
        const out: Record<string, { label: Box | null; cells: Record<string, Box> }> = {}
        for (const id of rowIds) {
            const label = box(
                table?.querySelector(`[data-testid="${CSS.escape(`report-row-${id}`)}"]`)
            )
            const cells: Record<string, Box> = {}
            for (const cell of table?.querySelectorAll('[data-testid^="report-cell-"]') ?? []) {
                const rest = (cell.getAttribute('data-testid') ?? '').slice('report-cell-'.length)
                const dash = rest.indexOf('-')
                if (rest.slice(dash + 1) !== id) continue
                const cellBox = box(cell)
                if (cellBox) cells[rest.slice(0, dash)] = cellBox
            }
            out[id] = { label, cells }
        }
        return out
    }, ids)
}

// The parts of a row the reader needs whole (spec "Every width fits"): each one that is
// missing or shows an ellipsis, named `<what>:<column>`.
function cutParts(what: string, row: RowBoxes | undefined, columns: readonly string[]): string[] {
    return columns
        .filter(col => {
            const part = col === 'account' ? row?.label : row?.cells[col]
            return part == null || part.cut
        })
        .map(col => `${what}:${col}`)
}

const LINE_NEEDED = ['account', 'type', 'number', 'debit', 'credit', 'balance'] as const

const near = (a: number | undefined, b: number | undefined) =>
    a !== undefined && b !== undefined && Math.abs(a - b) <= 1

// The top of a row's column: the label column ("Account / Date") is the row's label box.
function topOf(row: RowBoxes | undefined, col: string): number | undefined {
    if (col === 'account') return row?.label?.top
    return row?.cells[col]?.top
}

// Spec §3 Phone: date · type · No.; then Name and Description; then Split; then Debit,
// Credit and Balance.
const PHONE_LINES = [
    ['account', 'type', 'number'],
    ['name', 'description'],
    ['split'],
    ['debit', 'credit', 'balance'],
] as const

function phoneLineShape(row: RowBoxes | undefined) {
    const tops = PHONE_LINES.map(cols => cols.map(col => topOf(row, col)))
    return {
        measured: tops.flat().every(top => top !== undefined),
        eachLineOneTop: tops.map(line => line.every(top => near(top, line[0]))),
        linesInOrder: tops
            .slice(1)
            .every((line, i) => (line[0] ?? 0) > (tops[i]?.[0] ?? Number.POSITIVE_INFINITY) + 1),
    }
}

// An opening or section total row on a phone (spec §3 Phone): label and figures on one
// line when they fit, else the label, then every figure on the line right below it.
// `figures` is 'beside' (all on the label's line), 'below' (all on the next line) or
// 'mixed'.
function labelAndFigures(row: RowBoxes | undefined) {
    const label = row?.label
    const cells = Object.values(row?.cells ?? {})
    const tops = [label?.top, ...cells.map(cell => cell.top)]
    const distinct: number[] = []
    for (const top of tops) {
        if (top !== undefined && !distinct.some(seen => near(seen, top))) distinct.push(top)
    }
    const figuresWhere = () => {
        if (cells.every(cell => near(cell.top, label?.top))) return 'beside'
        if (cells.every(cell => near(cell.top, label?.bottom))) return 'below'
        return 'mixed'
    }
    return {
        measured: label != null && row?.cells.balance !== undefined,
        lines: distinct.length,
        figures: figuresWhere(),
    }
}

// At a tablet or desktop view: where the line's cells sit, whether the figure columns end
// inside the table, which parts the reader needs show an ellipsis, and whether anything
// scrolls sideways — read in ONE pass.
function widthGeometry(page: Page, ids: { line: string; opening: string; total: string }) {
    return page.evaluate(({ line: id, opening, total }) => {
        const table = document.querySelector('[data-testid="report-table"]') as HTMLElement | null
        if (!table) return null
        const find = (testId: string) =>
            table.querySelector(`[data-testid="${CSS.escape(testId)}"]`) as HTMLElement | null
        const visible = (element: Element) => element.getBoundingClientRect().height > 0
        const tableRight = table.getBoundingClientRect().right
        const figureRights = ['debit', 'credit', 'balance'].flatMap(column =>
            [
                ...table.querySelectorAll(
                    `[data-testid="report-heading-${column}"], [data-testid^="report-cell-${column}-"]`
                ),
            ]
                .filter(visible)
                .map(element => element.getBoundingClientRect().right)
        )
        const rect = (testId: string) => {
            const element = find(testId)
            return element && visible(element) ? element.getBoundingClientRect() : null
        }
        const isCut = (element: HTMLElement | null) =>
            element === null ||
            [element, ...element.querySelectorAll('*')].some(
                e => e instanceof HTMLElement && e.scrollWidth > e.clientWidth
            )
        const date = rect(`report-row-${id}`)
        const tops = Object.fromEntries(
            ['type', 'number', 'debit', 'credit', 'balance', 'name', 'description', 'split'].map(
                col => [col, rect(`report-cell-${col}-${id}`)?.top]
            )
        )
        const near = (a: number | undefined, b: number | undefined) =>
            a !== undefined && b !== undefined && Math.abs(a - b) <= 1
        const scrollers = [table, ...table.querySelectorAll('*')].filter(element => {
            const overflowX = getComputedStyle(element).overflowX
            return element === table || overflowX === 'auto' || overflowX === 'scroll'
        })
        const numberCell = find(`report-cell-number-${id}`)
        // Split is a long text column that may narrow, but an ordinary account name (about
        // 20 characters, here "Business Checking") must show whole, or "Accounts
        // receivable" cannot be told from "Accounts payable".
        const needed: Record<string, string> = {
            'line:account': `report-row-${id}`,
            ...Object.fromEntries(
                ['type', 'number', 'debit', 'credit', 'balance', 'split'].map(col => [
                    `line:${col}`,
                    `report-cell-${col}-${id}`,
                ])
            ),
            'heading:number': 'report-heading-number',
            'opening:account': `report-row-${opening}`,
            'sectionTotal:account': `report-row-${total}`,
        }
        return {
            measured: date !== null && figureRights.length >= 6,
            figuresInsideTable: figureRights.every(right => right <= tableRight + 1),
            figuresOnDateLine: ['debit', 'credit', 'balance'].every(col =>
                near(tops[col], date?.top)
            ),
            textOnNextLine: ['name', 'description', 'split'].every(col =>
                near(tops[col], date?.bottom)
            ),
            allOnDateLine: Object.values(tops).every(top => near(top, date?.top)),
            numberText: numberCell?.innerText.trim() ?? '',
            splitText: find(`report-cell-split-${id}`)?.textContent?.trim() ?? '',
            cut: Object.entries(needed)
                .filter(([, testId]) => isCut(find(testId)))
                .map(([name]) => name),
            noSidewaysScroll: scrollers.every(
                element => element.scrollWidth === element.clientWidth
            ),
        }
    }, ids)
}

const SAVINGS = 'Business Savings'
const LONG_SECTION_MEMO = 'Daily sweep'

type AnswerRow = {
    id: string
    kind: string
    label: string
    section?: string
    cells: Record<string, number | string | boolean | null>
}
type Answer = { cursor: string; rows: AnswerRow[]; next: string }

// The answers of a paged report, in the order they arrived, as runs: a first page (no
// cursor) starts a run, and a later page joins the newest run whose last page names its
// cursor. A page that follows no page of any run fails the test.
function pageRuns(answers: readonly Answer[]): Answer[][] {
    const runs: Answer[][] = []
    for (const answer of answers) {
        if (answer.cursor === '') {
            runs.push([answer])
            continue
        }
        const run = runs.findLast(pages => pages.at(-1)?.next === answer.cursor)
        if (!run) throw new Error(`a page with cursor ${answer.cursor} follows no page`)
        run.push(answer)
    }
    return runs
}
type SentRun = {
    params?: { period?: { preset?: string }; accounts?: unknown[] }
    options?: { cursor?: string }
}

const cents = (value: number | string | boolean | null | undefined) =>
    typeof value === 'number' ? value : 0

test.describe('general-ledger: report', () => {
    test('the Books hub opens the General Ledger, and its figures fit the table', async ({
        page,
    }) => {
        await startBooks(page)
        const account = uniqueName('GL fit')
        const bank = uniqueName('GL fit bank')
        const memo = `${uniqueName('GL long description')} ${'that runs on past the width of its column '.repeat(5)}`
        await createAccounts(page, [
            { name: account, kind: EXPENSE },
            { name: bank, kind: BANK },
        ])
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo,
            lines: [
                { account, debit: '1234567.89' },
                { account: bank, credit: '1234567.89' },
            ],
        })

        await openGeneralLedger(page)
        await expect(page.getByTestId('report-document-title')).toHaveText('General Ledger')
        await expect
            .poll(async () => {
                const shown = (await page.getByTestId('report-business-name').allInnerTexts())[0]
                const expected = await expectedHeading(page)
                return { matches: shown?.trim() === expected && expected !== '', shown, expected }
            })
            .toMatchObject({ matches: true })
        const chips = await page
            .getByTestId('report-controls')
            .locator('[data-testid^="report-param-"]')
            .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))
        expect(chips.slice(0, 2)).toEqual(['report-param-period', 'report-param-rows'])
        await expect(page.getByTestId('report-param-period')).toContainText('This month to date')
        await expect(page.getByTestId('report-param-rows')).toContainText('With activity')

        await filterToAccounts(page, [account])
        await snapshotWhen(
            page,
            glSnapshot,
            s => hasTotal(s) && linesOf(s, account).length === 1,
            'the account and its one line'
        )
        const layout = await page.evaluate(longMemo => {
            const table = document.querySelector('[data-testid="report-table"]') as HTMLElement
            const box = table.getBoundingClientRect()
            const visible = (element: Element) => element.getBoundingClientRect().height > 0
            const rightEdges = ['debit', 'credit', 'balance'].flatMap(column => [
                ...[
                    ...table.querySelectorAll(
                        `[data-testid="report-heading-${column}"], [data-testid^="report-cell-${column}-"]`
                    ),
                ]
                    .filter(visible)
                    .map(element => element.getBoundingClientRect().right),
            ])
            const heading = table.querySelector('[data-testid="report-heading-debit"]')
            const headingWidth = heading?.getBoundingClientRect().width ?? -1
            const debitWidths = [...table.querySelectorAll('[data-testid^="report-cell-debit-"]')]
                .filter(visible)
                .map(element => element.getBoundingClientRect().width)
            const description = [
                ...table.querySelectorAll('[data-testid^="report-cell-description-d:"]'),
            ].find(element => (element as HTMLElement).innerText.includes(longMemo.slice(0, 20)))
            const clipped = [description, ...(description?.querySelectorAll('*') ?? [])].some(
                element =>
                    element !== undefined &&
                    getComputedStyle(element).textOverflow === 'ellipsis' &&
                    element.scrollWidth > element.clientWidth
            )
            const scrollers = [table, ...table.querySelectorAll('*')].filter(element => {
                const overflowX = getComputedStyle(element).overflowX
                return element === table || overflowX === 'auto' || overflowX === 'scroll'
            })
            return {
                measured: rightEdges.length >= 6 && debitWidths.length >= 2,
                insideTable: rightEdges.every(right => right <= box.right + 1),
                debitAsWideAsHeading: debitWidths.every(
                    width => Math.abs(width - headingWidth) <= 1
                ),
                descriptionEllipsis: clipped,
                noSidewaysScroll: scrollers.every(
                    element => element.scrollWidth === element.clientWidth
                ),
            }
        }, memo)
        expect(layout).toEqual({
            measured: true,
            insideTable: true,
            debitAsWideAsHeading: true,
            descriptionEllipsis: true,
            noSidewaysScroll: true,
        })
    })

    test('a section opens on its beginning balance and runs its balance through each period', async ({
        page,
    }) => {
        await startBooks(page)
        const bank = uniqueName('GL bank')
        const expense = uniqueName('GL expense')
        const card = uniqueName('GL card')
        await createAccounts(page, [
            { name: bank, kind: BANK },
            { name: expense, kind: EXPENSE },
            { name: card, kind: CREDIT_CARD },
        ])
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: GL_DAY_1,
            memo: uniqueName('GL paid from the bank'),
            lines: [
                { account: expense, debit: '100.00' },
                { account: bank, credit: '100.00' },
            ],
        })
        await postEntryOn(page, {
            date: GL_DAY_1,
            memo: uniqueName('GL charged to the card'),
            lines: [
                { account: expense, debit: '45.00' },
                { account: card, credit: '45.00' },
            ],
        })
        await postEntryOn(page, {
            date: GL_DAY_2,
            memo: uniqueName('GL refund to the bank'),
            lines: [
                { account: bank, debit: '30.00' },
                { account: expense, credit: '30.00' },
            ],
        })

        await openGeneralLedger(page)
        await filterToAccounts(page, [bank, expense, card])
        await choosePeriod(page, { from: GL_DAY_1, to: GL_DAY_2 })
        const both = await snapshotWhen(
            page,
            glSnapshot,
            s =>
                s.header === rangeWords(GL_DAY_1, GL_DAY_2) &&
                hasTotal(s) &&
                linesOf(s, bank).length === 2,
            'the three accounts over both days'
        )
        expect(sectionLabels(both).sort()).toEqual([bank, card, expense].sort())
        expect(section(both, bank).map(row => row.kind)).toEqual([
            'opening',
            'detail',
            'detail',
            'subtotal',
        ])
        expect(openingOf(both, bank)?.label).toBe('Beginning balance')
        expect(figure(openingOf(both, bank)?.cells.balance)).toBe('0.00')
        expect(balancesOf(linesOf(both, bank))).toEqual(['-100.00', '-70.00'])
        expect(figure(sectionTotal(both, bank)?.cells.balance)).toBe('-70.00')
        expect(balancesOf(linesOf(both, card))).toEqual(['45.00'])

        // B is the first section, so at scroll 0 core's sticky copy of its
        // heading lies over the list row: that copy is what a user presses.
        await page.getByTestId('report-sticky-group').getByText(bank, { exact: true }).click()
        const folded = await snapshotWhen(
            page,
            glSnapshot,
            s => sectionLabels(s).includes(bank) && linesOf(s, bank).length === 0,
            "the bank's section folded"
        )
        expect(linesOf(folded, expense).length).toBe(3)
        await pressToolbar(page, 'report-fold-all', 'Collapse all')
        await snapshotWhen(
            page,
            glSnapshot,
            s => sectionLabels(s).length === 3 && s.rows.every(row => row.kind !== 'detail'),
            'every section folded'
        )
        await pressToolbar(page, 'report-fold-all', 'Expand all')
        await snapshotWhen(
            page,
            glSnapshot,
            s =>
                linesOf(s, bank).length === 2 &&
                linesOf(s, expense).length === 3 &&
                linesOf(s, card).length === 1,
            'every section open again'
        )

        await choosePeriod(page, { from: GL_DAY_2, to: GL_DAY_2 })
        const second = await snapshotWhen(
            page,
            glSnapshot,
            s => s.header === dayWords(GL_DAY_2) && hasTotal(s) && linesOf(s, bank).length === 1,
            'the second day alone'
        )
        expect(figure(openingOf(second, bank)?.cells.balance)).toBe('-100.00')
        expect(balancesOf(linesOf(second, bank))).toEqual(['-70.00'])

        await choosePeriod(page, { preset: 'allDates' })
        const all = await snapshotWhen(
            page,
            glSnapshot,
            s => s.header === 'All dates' && hasTotal(s) && linesOf(s, bank).length === 2,
            'all dates'
        )
        const openings = all.rows.filter(row => row.kind === 'opening')
        expect(openings.length).toBe(3)
        expect(openings.map(row => figure(row.cells.balance))).toEqual(['0.00', '0.00', '0.00'])
    })

    test("each line shows its entry's type and number, its name, its description and the other account", async ({
        page,
    }) => {
        await startBooks(page)
        const from = uniqueName('GL from bank')
        const to = uniqueName('GL to bank')
        const supplies = uniqueName('GL supplies')
        const postage = uniqueName('GL postage')
        const customer = uniqueName('GL customer')
        const lineMemo = uniqueName('GL line memo')
        const entryMemo = uniqueName('GL entry memo')
        const splitMemo = uniqueName('GL three lines')
        // The customer first, from the Books landing: from the chart, the Lists hub that
        // createCustomer passes through stays mounted hidden under the chart's screen, and its
        // first Customers card is that hidden one.
        await createCustomer(page, { name: customer })
        await createAccounts(page, [
            { name: from, kind: BANK },
            { name: to, kind: BANK },
            { name: supplies, kind: EXPENSE },
            { name: postage, kind: EXPENSE },
        ])
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: GL_DAY_1,
            memo: splitMemo,
            lines: [
                { account: supplies, debit: '30.00' },
                { account: postage, debit: '20.00' },
                { account: from, credit: '50.00' },
            ],
        })
        await postEntryOn(page, {
            date: GL_DAY_1,
            memo: entryMemo,
            lines: [
                { account: supplies, debit: '12.00', memo: lineMemo },
                { account: from, credit: '12.00' },
            ],
        })
        await postEntryOn(page, {
            date: GL_DAY_2,
            memo: uniqueName('GL sold to a customer'),
            lines: [
                { account: postage, debit: '7.00', name: customer },
                { account: from, credit: '7.00' },
            ],
        })
        const transfer = await createPostedTransfer(page, {
            from,
            to,
            amount: '25.00',
            memo: uniqueName('GL transfer'),
        })

        await openGeneralLedger(page)
        await filterToAccounts(page, [from, to, supplies, postage])
        await choosePeriod(page, { preset: 'allDates' })
        const s = await snapshotWhen(
            page,
            glSnapshot,
            snap => hasTotal(snap) && linesOf(snap, from).length === 4,
            'the four accounts and their lines'
        )
        const line = (account: string, column: 'debit' | 'credit', amount: string) =>
            linesOf(s, account).find(row => figure(row.cells[column]) === amount)?.cells ?? {}

        for (const [account, column, amount] of [
            [supplies, 'debit', '30.00'],
            [postage, 'debit', '20.00'],
            [from, 'credit', '50.00'],
        ] as const) {
            expect(line(account, column, amount).split, `${account} ${amount}`).toBe('-Split-')
        }
        expect(line(supplies, 'debit', '30.00').type).toBe('Journal entry')

        const toLine = line(to, 'debit', '25.00')
        expect(toLine.type).toBe('Transfer')
        expect(toLine.number).toBe(transfer.number)
        expect(toLine.number).toMatch(/^TR-\d+$/)
        expect(toLine.split).toBe(from)
        expect(line(from, 'credit', '25.00').split).toBe(to)

        expect(line(supplies, 'debit', '12.00').description).toBe(lineMemo)
        expect(line(from, 'credit', '12.00').description).toBe(entryMemo)
        expect(line(supplies, 'debit', '12.00').credit).toBe('')

        expect(line(postage, 'debit', '7.00').name).toBe(customer)
        expect(line(from, 'credit', '7.00').name).toBe('')
    })

    test('Rows and Accounts choose the sections, and Clear filters brings them all back', async ({
        page,
    }) => {
        await startBooks(page)
        const earlier = uniqueName('GL earlier bank')
        const idle = uniqueName('GL idle')
        await createAccounts(page, [
            { name: earlier, kind: BANK },
            { name: idle, kind: EXPENSE },
        ])
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: GL_DAY_1,
            memo: uniqueName('GL before the period'),
            lines: [
                { account: earlier, debit: '10.00' },
                { account: ACCOUNT_LABELS.checking, credit: '10.00' },
            ],
        })

        await openGeneralLedger(page)
        await filterToAccounts(page, [earlier, idle])
        await choosePeriod(page, { from: GL_DAY_2, to: GL_DAY_2 })
        const active = await snapshotWhen(
            page,
            glSnapshot,
            s =>
                s.header === dayWords(GL_DAY_2) &&
                hasTotal(s) &&
                sectionLabels(s).includes(earlier),
            'With activity over the second day'
        )
        expect(sectionLabels(active)).toEqual([earlier])
        expect(section(active, earlier).map(row => row.kind)).toEqual(['opening', 'subtotal'])
        expect(figure(openingOf(active, earlier)?.cells.balance)).toBe('10.00')

        await chooseParamOption(page, 'rows', { from: 'chip', labels: ['All'] })
        const all = await snapshotWhen(
            page,
            glSnapshot,
            s => hasTotal(s) && sectionLabels(s).includes(idle),
            'Rows All adds the idle account'
        )
        expect(sectionLabels(all).sort()).toEqual([earlier, idle].sort())

        await chooseParamOption(page, 'rows', { from: 'chip', labels: ['With activity'] })
        await chooseParamOption(page, 'accounts', { from: 'chip', labels: [earlier] })
        const action = page.getByTestId('report-empty-action')
        await expect(page.getByTestId('report-empty')).toBeVisible()
        await expect(action).toHaveText('Clear filters')
        await action.click()
        await expect(page.getByTestId('report-param-accounts')).toHaveCount(0)
        // The shared DB holds every other spec's accounts and the table mounts only the rows
        // on screen, so the proof is a section the Accounts filter had held out.
        const cleared = await snapshotWhen(
            page,
            glSnapshot,
            s => sectionLabels(s).some(label => label !== earlier && label !== idle),
            'every section back after Clear filters'
        )
        expect(sectionLabels(cleared)).not.toContain(idle)
    })

    test('a press on the Debit heading sorts the lines in their section, each with its own balance', async ({
        page,
    }) => {
        await startBooks(page)
        const account = uniqueName('GL sort')
        await createAccounts(page, [{ name: account, kind: EXPENSE }])
        await openEntriesFromSidebar(page)
        for (const [date, amount] of [
            [GL_DAY_1, '20.00'],
            [GL_DAY_1, '50.00'],
            [GL_DAY_2, '10.00'],
        ] as const) {
            await postEntryOn(page, {
                date,
                memo: uniqueName(`GL sort ${amount}`),
                lines: [
                    { account, debit: amount },
                    { account: ACCOUNT_LABELS.checking, credit: amount },
                ],
            })
        }

        await openGeneralLedger(page)
        await filterToAccounts(page, [account])
        await choosePeriod(page, { from: GL_DAY_1, to: GL_DAY_2 })
        const pairs = (s: GlSnapshot) =>
            linesOf(s, account).map(row => [figure(row.cells.debit), figure(row.cells.balance)])
        const reportOrder = [
            ['20.00', '20.00'],
            ['50.00', '70.00'],
            ['10.00', '80.00'],
        ]
        const plain = await snapshotWhen(
            page,
            glSnapshot,
            s => hasTotal(s) && linesOf(s, account).length === 3,
            'the three lines in the report order'
        )
        expect(pairs(plain)).toEqual(reportOrder)
        const sortParam = () => new URL(page.url()).searchParams.get('s')

        await page.getByTestId('report-sort-debit').click()
        await expect.poll(sortParam).toBe('debit:asc')
        const ascending = await snapshotWhen(
            page,
            glSnapshot,
            s => pairs(s)[0]?.[0] === '10.00',
            'the lines by Debit, ascending'
        )
        expect(pairs(ascending)).toEqual([
            ['10.00', '80.00'],
            ['20.00', '20.00'],
            ['50.00', '70.00'],
        ])

        await page.getByTestId('report-sort-debit').click()
        await expect.poll(sortParam).toBe('debit:desc')
        const descending = await snapshotWhen(
            page,
            glSnapshot,
            s => pairs(s)[0]?.[0] === '50.00',
            'the lines by Debit, descending'
        )
        expect(pairs(descending)).toEqual([
            ['50.00', '70.00'],
            ['20.00', '20.00'],
            ['10.00', '80.00'],
        ])

        await page.getByTestId('report-sort-debit').click()
        await expect.poll(sortParam).toBeNull()
        const unsorted = await snapshotWhen(
            page,
            glSnapshot,
            s => pairs(s)[0]?.[0] === '20.00',
            'the report order again'
        )
        expect(pairs(unsorted)).toEqual(reportOrder)

        await expect(page.getByTestId('report-heading-balance')).toBeVisible()
        await expect(page.getByTestId('report-sort-balance')).toHaveCount(0)
    })

    test('a post made on another page appears in the open report without a reload', async ({
        page,
        browser,
    }) => {
        await startBooks(page)
        const account = uniqueName('GL live')
        await createAccounts(page, [{ name: account, kind: EXPENSE }])
        await openGeneralLedger(page)
        await filterToAccounts(page, [account])
        await chooseParamOption(page, 'rows', { from: 'chip', labels: ['All'] })
        const before = await snapshotWhen(
            page,
            glSnapshot,
            s => hasTotal(s) && sectionLabels(s).includes(account),
            'the new account, with no lines yet, under All'
        )
        expect(linesOf(before, account)).toEqual([])
        await page.evaluate(() => {
            ;(window as unknown as { glNotReloaded?: boolean }).glNotReloaded = true
        })

        // Page B is a second browser context signed in as the same user: its own session
        // and its own realtime connection, so the post reaches page A through the server.
        const otherContext = await browser.newContext()
        const other = await otherContext.newPage()
        await startBooks(other)
        await openEntriesFromSidebar(other)
        await postEntryOn(other, {
            date: await browserToday(other),
            memo: uniqueName('GL live post'),
            lines: [
                { account, debit: '15.00' },
                { account: ACCOUNT_LABELS.checking, credit: '15.00' },
            ],
        })

        const live = await snapshotWhen(
            page,
            glSnapshot,
            s => linesOf(s, account).length === 1,
            'the post in the open report'
        )
        expect(figure(linesOf(live, account)[0]?.cells.debit)).toBe('15.00')
        expect(figure(linesOf(live, account)[0]?.cells.balance)).toBe('15.00')
        const notReloaded = await page.evaluate(
            () => (window as unknown as { glNotReloaded?: boolean }).glNotReloaded
        )
        expect(notReloaded).toBe(true)
        await otherContext.close()
    })

    test('on a phone each line wraps onto its own lines and nothing scrolls sideways', async ({
        page,
    }) => {
        await startBooks(page)
        const account = uniqueName('GL phone')
        await createAccounts(page, [{ name: account, kind: EXPENSE }])
        await postDebitsToday(page, account, ['12.00', '30.00'])

        // The phone path: Reports from the Books menu drawer (openBooksReports).
        await page.setViewportSize(PHONE)
        await openGeneralLedger(page)
        await expectDocumentHeader(page)
        await expect(page.getByTestId('report-param-period')).toBeVisible()
        await expect(page.getByTestId('report-param-rows')).toBeVisible()

        await filterToAccounts(page, [account])
        const s = await snapshotWhen(
            page,
            glSnapshot,
            snap => hasTotal(snap) && linesOf(snap, account).length === 2,
            'the account and its two lines'
        )
        expect(await waitForTableFit(page)).toBe('mobile')
        const lineId = linesOf(s, account)[0]?.id ?? ''
        const openingId = openingOf(s, account)?.id ?? ''
        const totalId = sectionTotal(s, account)?.id ?? ''
        await expect
            .poll(
                async () => {
                    const boxes = await rowBoxes(page, [lineId, openingId, totalId])
                    return {
                        line: phoneLineShape(boxes[lineId]),
                        opening: labelAndFigures(boxes[openingId]),
                        sectionTotal: labelAndFigures(boxes[totalId]),
                        cut: [
                            ...cutParts('line', boxes[lineId], LINE_NEEDED),
                            ...cutParts('opening', boxes[openingId], ['account']),
                            ...cutParts('sectionTotal', boxes[totalId], ['account']),
                        ],
                    }
                },
                { message: 'the authored phone lines (spec §3 Phone), nothing cut' }
            )
            .toEqual({
                line: {
                    measured: true,
                    eachLineOneTop: [true, true, true, true],
                    linesInOrder: true,
                },
                // The seeded data at 390: "Beginning balance … 0.00" fits on one line; the
                // section total's three figures do not, so they go on the line below.
                opening: { measured: true, lines: 1, figures: 'beside' },
                sectionTotal: { measured: true, lines: 2, figures: 'below' },
                cut: [],
            })
        expect(
            await page
                .getByTestId('report-table')
                .evaluate(table => table.scrollWidth === table.clientWidth)
        ).toBe(true)
    })

    test('at tablet and desktop widths a line wraps only where its one line does not fit, all inside the table and nothing cut', async ({
        page,
    }) => {
        await startBooks(page)
        const account = uniqueName('GL tablet')
        await createAccounts(page, [{ name: account, kind: EXPENSE }])
        // A long description, as the seeded book has: it competes with Split for the
        // line's room, and only an ordinary account name in Split must stay whole.
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo: uniqueName(
                'GL tablet monthly software subscription for the whole design team, billed by the vendor on the first business day of every month'
            ),
            lines: [
                { account, debit: '1234.56' },
                { account: ACCOUNT_LABELS.checking, credit: '1234.56' },
            ],
        })

        await openGeneralLedger(page)
        await filterToAccounts(page, [account])
        const s = await snapshotWhen(
            page,
            glSnapshot,
            snap => hasTotal(snap) && linesOf(snap, account).length === 1,
            'the account and its line'
        )
        const ids = {
            line: linesOf(s, account)[0]?.id ?? '',
            opening: openingOf(s, account)?.id ?? '',
            total: sectionTotal(s, account)?.id ?? '',
        }

        // The report view at /a/reports has no Books sidebar, so its rows are the window
        // less the 64 px rail: 836 at 900, 960 at 1024, 1216 at 1280. The spec tries one
        // line only from 1040 px (display.oneLine.minWidth), so 900 and 1024 take the
        // tablet layout (from 600 px) and 1280 takes the one line.
        for (const { size, layout } of [
            { size: { width: 900, height: 800 }, layout: 'tablet' },
            { size: { width: 1024, height: 800 }, layout: 'tablet' },
            { size: { width: 1280, height: 800 }, layout: 'one-line' },
        ]) {
            const isTablet = layout === 'tablet'
            await page.setViewportSize(size)
            expect(await waitForTableFit(page), `the layout at ${size.width}`).toBe(layout)
            // The Split check is read once the rest has settled, and soft, so a cut Split at
            // one width does not hide the other widths (there is no expect.soft.poll).
            const withoutSplit = async () => {
                const geometry = await widthGeometry(page, ids)
                return (
                    geometry && { ...geometry, cut: geometry.cut.filter(n => n !== 'line:split') }
                )
            }
            await expect
                .poll(withoutSplit, {
                    message: `the ${isTablet ? 'tablet layout' : 'one line'} at ${size.width}`,
                })
                .toEqual({
                    measured: true,
                    figuresInsideTable: true,
                    figuresOnDateLine: true,
                    textOnNextLine: isTablet,
                    allOnDateLine: !isTablet,
                    numberText: expect.stringMatching(/^JE-\d+$/),
                    splitText: 'Business Checking',
                    cut: [],
                    noSidewaysScroll: true,
                })
            expect
                .soft((await widthGeometry(page, ids))?.cut, `Split cut at ${size.width}`)
                .not.toContain('line:split')
        }
    })

    test('a long section pages as it scrolls and its running balance continues across the page seam', async ({
        page,
    }) => {
        await startBooks(page)
        await openGeneralLedger(page)
        await choosePeriod(page, { preset: 'allDates' })

        // The answers of the Business Savings runs, in the order they arrive.
        const answers: Promise<Answer>[] = []
        page.on('response', response => {
            if (!response.url().includes('/api/reports/run') || !response.ok()) return
            const body = response.request().postDataJSON() as SentRun | null
            const accounts = body?.params?.accounts
            if (body?.params?.period?.preset !== 'allDates' || !Array.isArray(accounts)) return
            if (accounts.length !== 1) return
            answers.push(
                response
                    .json()
                    .then((result: { rows: AnswerRow[]; page: { next?: string } | null }) => ({
                        cursor: body.options?.cursor ?? '',
                        rows: result.rows,
                        next: result.page?.next ?? '',
                    }))
            )
        })
        // The first next page waits until the test has seen the list ask for it.
        let release = () => {}
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await page.route('**/api/reports/run', async route => {
            const body = route.request().postDataJSON() as SentRun | null
            if (body?.options?.cursor) await held
            await route.continue()
        })

        await filterToAccounts(page, [SAVINGS])
        await snapshotWhen(
            page,
            glSnapshot,
            snap => snap.rows.some(row => row.kind === 'group' && row.label.includes(SAVINGS)),
            'the savings section'
        )
        const firstPages = async () =>
            (await Promise.all(answers)).filter(answer => answer.cursor === '')
        await expect.poll(async () => (await firstPages()).length).toBeGreaterThan(0)
        const first = (await firstPages()).at(-1) as Answer
        const firstLines = first.rows.filter(row => row.kind === 'detail')
        const savingsGroup = first.rows.find(
            row => row.kind === 'group' && row.label.includes(SAVINGS)
        )
        expect(firstLines.length).toBeLessThanOrEqual(200)
        expect(first.next, 'the first answer ends inside the savings section').not.toBe('')
        // Core ends every page in the report's total row(s); the document's own rows end before them.
        const lastBeforeTotals = first.rows.findLast(row => row.kind !== 'total')
        expect(lastBeforeTotals?.kind).toBe('detail')
        expect(lastBeforeTotals?.section).toBe(savingsGroup?.id)
        expect(first.rows.some(row => row.kind === 'subtotal')).toBe(false)

        // The list's vertical scroller: the nearest ancestor of a line that scrolls.
        const toEnd = () =>
            page
                .getByTestId('report-table')
                .locator('[data-testid^="report-row-d:"]')
                .first()
                .evaluate(row => {
                    let scroller = row.parentElement
                    while (scroller && getComputedStyle(scroller).overflowY !== 'auto') {
                        scroller = scroller.parentElement
                    }
                    if (scroller) scroller.scrollTop = scroller.scrollHeight
                })
        await expect
            .poll(async () => {
                await toEnd()
                return page.getByTestId('report-loading-more').isVisible()
            })
            .toBe(true)
        release()

        const nextPages = async () =>
            (await Promise.all(answers)).filter(answer => answer.cursor !== '')
        await expect.poll(async () => (await nextPages()).length).toBeGreaterThan(0)
        const second = (await nextPages()).find(answer => answer.cursor === first.next) as Answer
        expect(second, 'the next page follows the first page').toBeDefined()
        const secondIds = new Set(
            second.rows.filter(row => row.kind === 'detail').map(row => row.id)
        )
        // The snapshot's row ids are core's row ids (report-row-<id>), as the answer's are.
        await snapshotWhen(
            page,
            glSnapshot,
            snap =>
                snap.rows.some(
                    row => secondIds.has(row.id) && row.cells.description === LONG_SECTION_MEMO
                ),
            `more "${LONG_SECTION_MEMO}" lines from the next page in the list`
        )

        // Business Savings is debit-normal: each line adds its debit and takes its credit.
        const lastOfFirst = firstLines.at(-1) as AnswerRow
        const firstOfNext = second.rows.find(row => row.kind === 'detail') as AnswerRow
        expect(firstOfNext.section).toBe(savingsGroup?.id)
        expect(cents(firstOfNext.cells.balance)).toBe(
            cents(lastOfFirst.cells.balance) +
                cents(firstOfNext.cells.debit) -
                cents(firstOfNext.cells.credit)
        )

        // The rest of the pages, until the last: only it carries the section total.
        await expect
            .poll(async () => {
                await toEnd()
                return (await nextPages()).some(answer => answer.next === '')
            })
            .toBe(true)
        // The open report runs again when another session posts (the shared DB has other
        // workers), and the list then pages again from a new first page. So the rule is
        // per run: its pages, followed from its first page by their cursors, carry the
        // section total one time, on the last page. A run the list left before its end
        // (a newer run took its place) carries none.
        const runs = pageRuns(await Promise.all(answers))
        const hasTotal = (answer: Answer) =>
            answer.rows.some(row => row.kind === 'subtotal' && row.section === savingsGroup?.id)
        const isComplete = (run: Answer[]) => run.at(-1)?.next === ''
        expect(runs.some(isComplete), 'a run reached its last page').toBe(true)
        for (const [index, run] of runs.entries()) {
            const withTotal = run.flatMap((answer, at) => (hasTotal(answer) ? [at] : []))
            const expected = isComplete(run) ? [run.length - 1] : []
            expect(withTotal, `the pages with the section total in run ${index + 1}`).toEqual(
                expected
            )
        }
        await page.unrouteAll({ behavior: 'wait' })
    })
})
