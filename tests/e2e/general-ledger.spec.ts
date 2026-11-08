import { expect, type Page, test } from '@playwright/test'
import {
    authStorageKey,
    chooseParamOption,
    login,
    navigateToPackage,
    pressToolbar,
} from '@tinycld/core/e2e-helpers'
import { createAccount, DESKTOP, openChart } from './account-register-helpers'
import {
    browserToday,
    choosePeriod,
    dayWords,
    filterToAccounts,
    GL_DAY_1,
    GL_DAY_2,
    type GlSnapshot,
    glSnapshot,
    openGeneralLedger,
    postEntryOn,
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

// The entries list from the Books sidebar: postEntryOn expects the list, an entry or the
// Lists hub on screen.
async function openEntriesFromSidebar(page: Page) {
    const item = page.getByTestId('books-nav-entries')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    await expect(toggle).toBeVisible()
    if (!(await item.isVisible())) await toggle.click()
    await item.click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
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

// Polls snapshots until `isReady` holds and returns that snapshot, so every later
// assertion reads the same single snapshot.
async function snapshotWhen(
    page: Page,
    isReady: (snapshot: GlSnapshot) => boolean,
    message: string
): Promise<GlSnapshot> {
    const last: { snapshot: GlSnapshot } = { snapshot: { header: '', rows: [] } }
    await expect
        .poll(
            async () => {
                last.snapshot = await glSnapshot(page)
                return isReady(last.snapshot)
            },
            { message }
        )
        .toBe(true)
    return last.snapshot
}

// The heading core's document header prints: the Books business name, else the
// organization's name. Read-only: books-settings.spec.ts types over the business name and
// restores it on the shared DB, so it is read when compared.
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

// Core's period words for two days of one year (core/reports/lib/dates.ts rangeWords).
function rangeWords(from: string, to: string): string {
    return `${dayWords(from).replace(/, \d{4}$/, '')} – ${dayWords(to)}`
}

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
            s => sectionLabels(s).includes(bank) && linesOf(s, bank).length === 0,
            "the bank's section folded"
        )
        expect(linesOf(folded, expense).length).toBe(3)
        await pressToolbar(page, 'report-fold-all', 'Collapse all')
        await snapshotWhen(
            page,
            s => sectionLabels(s).length === 3 && s.rows.every(row => row.kind !== 'detail'),
            'every section folded'
        )
        await pressToolbar(page, 'report-fold-all', 'Expand all')
        await snapshotWhen(
            page,
            s =>
                linesOf(s, bank).length === 2 &&
                linesOf(s, expense).length === 3 &&
                linesOf(s, card).length === 1,
            'every section open again'
        )

        await choosePeriod(page, { from: GL_DAY_2, to: GL_DAY_2 })
        const second = await snapshotWhen(
            page,
            s => s.header === dayWords(GL_DAY_2) && hasTotal(s) && linesOf(s, bank).length === 1,
            'the second day alone'
        )
        expect(figure(openingOf(second, bank)?.cells.balance)).toBe('-100.00')
        expect(balancesOf(linesOf(second, bank))).toEqual(['-70.00'])

        await choosePeriod(page, { preset: 'allDates' })
        const all = await snapshotWhen(
            page,
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
            s => hasTotal(s) && linesOf(s, account).length === 3,
            'the three lines in the report order'
        )
        expect(pairs(plain)).toEqual(reportOrder)
        const sortParam = () => new URL(page.url()).searchParams.get('s')

        await page.getByTestId('report-sort-debit').click()
        await expect.poll(sortParam).toBe('debit:asc')
        const ascending = await snapshotWhen(
            page,
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
})
