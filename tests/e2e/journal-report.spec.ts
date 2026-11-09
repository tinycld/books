import { expect, type Page, test } from '@playwright/test'
import { authStorageKey, login, navigateToPackage, pressToolbar } from '@tinycld/core/e2e-helpers'
import { createAccount, DESKTOP, openChart } from './account-register-helpers'
import {
    choosePeriod,
    dayWords,
    GL_DAY_1,
    GL_DAY_2,
    type GlSnapshot,
    openJournal,
    postEntryOn,
    voidPostedEntry,
} from './books-report-helpers'
import { createCustomer } from './customer-form-helpers'
import {
    ACCOUNT_LABELS,
    createDraftEntry,
    openEntriesList,
    searchEntries,
} from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'
import { createPostedTransfer } from './transfer-helpers'

// The shipped Journal in core's report view (/a/reports/<id>), read by the e2e user, who
// is not the first admin and so reaches it through the viewer share Books keeps. Every
// test makes its own accounts, customer and entries through the UI, names them with
// `uniqueName`, and finds its own blocks by their headings ("<number> · <type>"). Entries
// are dated GL_DAY_1, GL_DAY_2: never before 2026-07-01, so the close date
// books-settings.spec.ts sets on the shared DB does not refuse a post.
//
// The Journal has no account filter, so a day holds every other spec's entries too, and
// the table is a FlashList that mounts only the rows near its view: `journalRows` scrolls
// the list from top to end in ONE page.evaluate and keeps every row it sees (one run's rows),
// and a test waits for the Total row in it, the proof that every row above it was drawn.
//
// Not covered here (core's own e2e cover them for every report): Customize, loading, no
// access, Copy link and Save as, error and timeout states.

const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const BANK = { type: 'Bank', detailType: 'Checking' }

type Row = GlSnapshot['rows'][number]

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
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

// The posted entry open in its read view: its number, from the title the server's
// answer writes ("Journal entry JE-41").
async function openEntryNumber(page: Page): Promise<string> {
    const title = page.getByTestId('entry-title')
    await expect(title).toHaveText(/^Journal entry JE-\d+$/)
    return (await title.innerText()).trim().replace(/^Journal entry /, '')
}

// Opens the entry whose memo is `memo` from the entries list, in its read view.
async function openEntryByMemo(page: Page, memo: string) {
    await openEntriesList(page)
    await searchEntries(page, memo)
    await page
        .locator('[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])')
        .filter({ has: page.getByText(memo, { exact: true }) })
        .first()
        .click()
    await expect(page.getByTestId('entry-read-only')).toBeVisible()
}

// A cell's figure without the currency sign the Total rows carry.
function figure(text: string | undefined): string {
    return (text ?? '').replace('$', '')
}

function cents(text: string | undefined): number {
    const value = figure(text).replace(/,/g, '')
    return value === '' ? 0 : Math.round(Number(value) * 100)
}

// Core's short day words for a detail row's date (core/reports/lib/dates.ts shortDay).
function shortDay(day: string): string {
    const words = dayWords(day)
    return `${words.slice(0, 3)}${words.slice(words.indexOf(' '))}`
}

function hasTotal(snapshot: GlSnapshot) {
    return snapshot.rows.some(row => row.kind === 'total')
}

function totalRow(snapshot: GlSnapshot): Row | undefined {
    return snapshot.rows.find(row => row.kind === 'total')
}

function blockLabels(snapshot: GlSnapshot) {
    return snapshot.rows.filter(row => row.kind === 'group').map(row => row.label)
}

function blockHead(snapshot: GlSnapshot, heading: string): Row | undefined {
    return snapshot.rows.find(row => row.kind === 'group' && row.label === heading)
}

// The rows of the block headed `heading`: its lines and its total, up to the next block or
// the Total.
function block(snapshot: GlSnapshot, heading: string): Row[] {
    const start = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === heading)
    if (start < 0) return []
    const after = snapshot.rows.slice(start + 1)
    const end = after.findIndex(row => row.kind === 'group' || row.kind === 'total')
    return end < 0 ? after : after.slice(0, end)
}

function linesOf(snapshot: GlSnapshot, heading: string): Row[] {
    return block(snapshot, heading).filter(row => row.kind === 'detail')
}

function blockTotal(snapshot: GlSnapshot, heading: string): Row | undefined {
    return block(snapshot, heading).find(row => row.kind === 'subtotal')
}

// A row that carries the draft's memo in its label or any cell.
function showsDraft(row: Row, memo: string): boolean {
    return row.label.includes(memo) || Object.values(row.cells).some(text => text.includes(memo))
}

// The Total row's Debit and Credit, and the sum of the block total rows' Debit cells, in cents.
function totals(snapshot: GlSnapshot) {
    const total = totalRow(snapshot)
    const blockDebits = snapshot.rows
        .filter(row => row.kind === 'subtotal')
        .reduce((sum, row) => sum + cents(row.cells.debit), 0)
    return {
        debit: cents(total?.cells.debit),
        credit: cents(total?.cells.credit),
        blockDebits,
    }
}

// Scrolls the report's list to its top, or one screen down; false when it could not move
// (already at its end, or no rows).
function scrollList(page: Page, where: 'top' | 'down'): Promise<boolean> {
    return page.evaluate(async to => {
        const row = document.querySelector(
            '[data-testid="report-table"] [data-testid^="report-row-"]'
        )
        let list = row?.parentElement ?? null
        while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement
        if (!list) return false
        const before = list.scrollTop
        if (to === 'top') list.scrollTop = 0
        else list.scrollTop = before + list.clientHeight * 0.8
        // Two frames: the list draws the rows of its new window.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return list.scrollTop !== before
    }, where)
}

// Every row of the report, top to end, in ONE page.evaluate: scroll a screen, wait two
// frames, read the mounted rows as glSnapshot does, repeat. Each row is kept with its place
// in the list's content (its offset from the list's top plus the scroll), and the rows are
// returned in that order. A live re-run can land between two screens (other workers post
// on GL_DAY_1 / GL_DAY_2): a kept row that shows other text or cells or moved, a new row in
// a kept row's place, or another document period starts the read again from the top, so
// the rows returned are one run's. Stops at the Total row, which ends the last page; `rows`
// holds no total when the end was not reached (the caller polls again).
function journalRows(page: Page): Promise<GlSnapshot> {
    return page.evaluate(async () => {
        type Kind = GlSnapshot['rows'][number]['kind']
        type Read = {
            id: string
            kind: Kind
            label: string
            cells: Record<string, string>
            at: number
        }
        const frames = () =>
            new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const kindOf = (id: string): Kind | null => {
            if (id.startsWith('g:')) return 'group'
            if (id.startsWith('opening:')) return 'opening'
            if (id.startsWith('d:')) return 'detail'
            if (id.startsWith('s:')) return 'subtotal'
            if (id.startsWith('total')) return 'total'
            return null
        }
        const periodText = () =>
            (
                document.querySelector(
                    '[data-testid="report-document-period"]'
                ) as HTMLElement | null
            )?.innerText.trim() ?? ''
        const screen = (list: HTMLElement): Read[] => {
            const table = document.querySelector('[data-testid="report-table"]')
            const origin = list.getBoundingClientRect().top - list.scrollTop
            const cells = new Map<string, Record<string, string>>()
            for (const cell of table?.querySelectorAll('[data-testid^="report-cell-"]') ?? []) {
                const rest = (cell.getAttribute('data-testid') ?? '').slice('report-cell-'.length)
                const dash = rest.indexOf('-')
                const id = rest.slice(dash + 1)
                const row = cells.get(id) ?? {}
                row[rest.slice(0, dash)] = (cell as HTMLElement).innerText.trim()
                cells.set(id, row)
            }
            const out: Read[] = []
            const mounted = [
                ...(table?.querySelectorAll('[data-testid^="report-row-"]') ?? []),
            ].map(element => ({
                id: (element.getAttribute('data-testid') ?? '').slice('report-row-'.length),
                label: (element as HTMLElement).innerText.trim(),
                at: Math.round(element.getBoundingClientRect().top - origin),
            }))
            for (const { id, label, at } of mounted) {
                const kind = kindOf(id)
                if (kind) out.push({ id, kind, label, cells: cells.get(id) ?? {}, at })
            }
            return out
        }
        const listOf = (): HTMLElement | null => {
            const row = document.querySelector(
                '[data-testid="report-table"] [data-testid^="report-row-"]'
            )
            let list = row?.parentElement ?? null
            while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement
            return list
        }
        const same = (a: Read, b: Read) =>
            a.kind === b.kind &&
            a.label === b.label &&
            Math.abs(a.at - b.at) <= 1 &&
            JSON.stringify(a.cells) === JSON.stringify(b.cells)

        let kept = new Map<string, Read>()
        let places = new Map<number, string>()
        let header = periodText()
        const restart = async () => {
            kept = new Map()
            places = new Map()
            header = periodText()
            const list = listOf()
            if (list) list.scrollTop = 0
            await frames()
        }
        await restart()
        for (let step = 0, restarts = 0; step < 2000 && restarts < 10; step++) {
            const list = listOf()
            if (!list) break
            const rows = screen(list)
            const consistent =
                periodText() === header &&
                rows.every(row => {
                    const known = kept.get(row.id)
                    if (known) return same(known, row)
                    return (places.get(row.at) ?? row.id) === row.id
                })
            if (!consistent) {
                restarts++
                await restart()
                continue
            }
            for (const row of rows) {
                kept.set(row.id, row)
                places.set(row.at, row.id)
            }
            if (rows.some(row => row.kind === 'total')) break
            const before = list.scrollTop
            const atEnd = () => list.scrollTop + list.clientHeight >= list.scrollHeight - 1
            // While the list still measures its new rows it can pull the scroll back: set
            // it again until it moves or the list's end is reached (at most ~1 s of frames).
            for (let tries = 0; tries < 30 && list.scrollTop === before && !atEnd(); tries++) {
                list.scrollTop = before + list.clientHeight * 0.8
                await frames()
            }
            if (list.scrollTop !== before) continue
            if (!atEnd()) break
            // At the end with no Total: the next page is loading. Wait (at most ~1.5 s of
            // frames) for the list to grow, else hand back the partial read.
            const height = list.scrollHeight
            for (let wait = 0; wait < 45 && list.scrollHeight === height; wait++) await frames()
            if (list.scrollHeight === height) break
        }
        const rows = [...kept.values()]
            .sort((a, b) => a.at - b.at)
            .map(({ id, kind, label, cells }) => ({ id, kind, label, cells }))
        return { header, rows }
    })
}

// Polls whole-report reads until `isReady` holds and returns that read, so every later
// assertion reads the same rows.
async function journalWhen(
    page: Page,
    isReady: (snapshot: GlSnapshot) => boolean,
    message: string
): Promise<GlSnapshot> {
    const last: { snapshot: GlSnapshot } = { snapshot: { header: '', rows: [] } }
    await expect
        .poll(
            async () => {
                last.snapshot = await journalRows(page)
                return isReady(last.snapshot)
            },
            { message }
        )
        .toBe(true)
    return last.snapshot
}

// Presses the heading of the block headed `heading`. At the top of the list core's sticky
// copy of a heading lies over the list row: that copy is what a user presses there.
async function pressBlockHeading(page: Page, heading: string) {
    const snapshot = await journalWhen(
        page,
        s => blockHead(s, heading) !== undefined,
        `the block ${heading}`
    )
    const id = blockHead(snapshot, heading)?.id ?? ''
    const sticky = page.getByTestId(`report-sticky-row-${id}`)
    if (await sticky.isVisible()) return sticky.click()
    await scrollList(page, 'top')
    const row = page.getByTestId(`report-row-${id}`)
    for (let step = 0; step < 80 && !(await row.count()); step++) await scrollList(page, 'down')
    await row.evaluate(element => element.scrollIntoView({ block: 'center' }))
    if (await sticky.isVisible()) return sticky.click()
    await row.click()
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

// Posts a two-line entry on `date` that debits `account` and credits Business Checking, and
// returns its heading in the Journal.
async function postSimple(page: Page, date: string, account: string, amount: string) {
    await postEntryOn(page, {
        date,
        memo: uniqueName(`JR ${amount}`),
        lines: [
            { account, debit: amount },
            { account: ACCOUNT_LABELS.checking, credit: amount },
        ],
    })
    return `${await openEntryNumber(page)} · Journal entry`
}

test.describe('journal-report: report', () => {
    test('the Books hub opens the Journal: business name, title and one Period chip', async ({
        page,
    }) => {
        await startBooks(page)
        await openJournal(page)
        await expect(page.getByTestId('report-document-title')).toHaveText('Journal')
        await expect
            .poll(async () => {
                const shown = (await page.getByTestId('report-business-name').allInnerTexts())[0]
                const expected = await expectedHeading(page)
                return { matches: shown?.trim() === expected && expected !== '', shown, expected }
            })
            .toMatchObject({ matches: true })
        await expect(page.getByTestId('report-param-period')).toContainText('This month to date')
        const chips = await page
            .getByTestId('report-screen')
            .locator('[data-testid^="report-param-"]')
            .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))
        expect(chips).toEqual(['report-param-period'])
    })

    test("an entry's block lists its lines in form order with date, account, name, description and a balanced total", async ({
        page,
    }) => {
        await startBooks(page)
        const accountA = uniqueName('JR account A')
        const numberA = `J${test.info().workerIndex}-${Date.now() % 1e9}`
        const accountB = uniqueName('JR account B')
        const customer = uniqueName('JR customer')
        const entryMemo = uniqueName('JR entry memo')
        const lineMemo = uniqueName('JR line memo')
        // The customer first, from the Books landing (general-ledger.spec.ts): from the chart,
        // the Lists hub that createCustomer passes through stays mounted hidden.
        await createCustomer(page, { name: customer })
        await openChart(page)
        await createAccount(page, accountA, EXPENSE, numberA)
        await createAccount(page, accountB, BANK)
        await openEntriesFromSidebar(page)
        const labelA = `${numberA} ${accountA}`
        await postEntryOn(page, {
            date: GL_DAY_1,
            memo: entryMemo,
            lines: [
                { account: labelA, debit: '60.00', memo: lineMemo },
                { account: labelA, debit: '40.00', name: customer },
                { account: accountB, credit: '100.00' },
            ],
        })
        const number = await openEntryNumber(page)
        const heading = `${number} · Journal entry`

        await openJournal(page)
        await choosePeriod(page, { from: GL_DAY_1, to: GL_DAY_1 })
        const s = await journalWhen(
            page,
            snap =>
                snap.header === dayWords(GL_DAY_1) &&
                hasTotal(snap) &&
                linesOf(snap, heading).length === 3,
            'the entry and its three lines on the first day'
        )
        expect(s.header).toBe(dayWords(GL_DAY_1))
        const lines = linesOf(s, heading)
        expect(lines.map(row => row.label)).toEqual([
            shortDay(GL_DAY_1),
            shortDay(GL_DAY_1),
            shortDay(GL_DAY_1),
        ])
        expect(lines.map(row => figure(row.cells.debit))).toEqual(['60.00', '40.00', ''])
        expect(lines.map(row => figure(row.cells.credit))).toEqual(['', '', '100.00'])
        expect(lines.map(row => row.cells.account)).toEqual([labelA, labelA, accountB])
        expect(lines.map(row => row.cells.name ?? '')).toEqual(['', customer, ''])
        expect(lines.map(row => row.cells.description)).toEqual([lineMemo, entryMemo, entryMemo])
        const total = blockTotal(s, heading)
        expect(total?.label).toBe(`Total ${heading}`)
        expect(figure(total?.cells.debit)).toBe('100.00')
        expect(figure(total?.cells.credit)).toBe('100.00')
    })

    test('blocks come in posting order with their types; a void shows its void reversal, a draft never shows', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = uniqueName('JR order expense')
        const bank = uniqueName('JR order bank')
        const e1Memo = uniqueName('JR voided entry')
        const draftMemo = uniqueName('JR draft')
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        await createAccount(page, bank, BANK)
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: GL_DAY_2,
            memo: e1Memo,
            lines: [
                { account: expense, debit: '25.00' },
                { account: ACCOUNT_LABELS.checking, credit: '25.00' },
            ],
        })
        const e1 = await openEntryNumber(page)
        const transfer = await createPostedTransfer(
            page,
            {
                from: ACCOUNT_LABELS.checking,
                to: bank,
                amount: '15.00',
                memo: uniqueName('JR transfer'),
            },
            GL_DAY_2
        )
        await createDraftEntry(page, {
            memo: draftMemo,
            amount: '5.00',
            debitAccount: expense,
            creditAccount: ACCOUNT_LABELS.checking,
        })
        await openEntryByMemo(page, e1Memo)
        await voidPostedEntry(page)

        await openJournal(page)
        await choosePeriod(page, { from: GL_DAY_2, to: GL_DAY_2 })
        const e1Heading = `${e1} · Journal entry`
        const transferHeading = `${transfer.number} · Transfer`
        const voidHeading = `${e1} · Void reversal of ${e1}`
        const s = await journalWhen(
            page,
            snap =>
                snap.header === dayWords(GL_DAY_2) &&
                hasTotal(snap) &&
                [e1Heading, transferHeading, voidHeading].every(h => blockHead(snap, h)),
            'the voided entry, the transfer and the void reversal on the second day'
        )
        const labels = blockLabels(s)
        expect(transfer.number).toMatch(/^TR-\d+$/)
        expect(labels.indexOf(e1Heading)).toBeGreaterThanOrEqual(0)
        expect(labels.indexOf(transferHeading)).toBeGreaterThan(labels.indexOf(e1Heading))
        expect(labels.indexOf(voidHeading)).toBeGreaterThan(labels.indexOf(transferHeading))
        expect(s.rows.filter(row => showsDraft(row, draftMemo))).toEqual([])

        // The draft is dated today and its lines have no day, so the GL_DAY_2 period drops it
        // by date alone. All dates takes every row, a row with no day too: only the posted
        // filter keeps the draft out of this whole-report read.
        await choosePeriod(page, { preset: 'allDates' })
        const all = await journalWhen(
            page,
            snap =>
                snap.header === 'All dates' &&
                hasTotal(snap) &&
                [e1Heading, transferHeading, voidHeading].every(h => blockHead(snap, h)),
            'the whole report for All dates'
        )
        expect(all.header).toBe('All dates')
        expect(all.rows.filter(row => showsDraft(row, draftMemo))).toEqual([])
    })

    test("the Total row's Debit equals its Credit and the sum of the block totals", async ({
        page,
    }) => {
        await startBooks(page)
        const expense = uniqueName('JR total expense')
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        await openEntriesFromSidebar(page)
        const heading = await postSimple(page, GL_DAY_2, expense, '12.34')

        await openJournal(page)
        await choosePeriod(page, { from: GL_DAY_2, to: GL_DAY_2 })
        const s = await journalWhen(
            page,
            snap =>
                snap.header === dayWords(GL_DAY_2) &&
                hasTotal(snap) &&
                blockTotal(snap, heading) !== undefined &&
                totals(snap).debit === totals(snap).credit &&
                totals(snap).debit === totals(snap).blockDebits,
            'every block of the second day and the Total, from one run'
        )
        const total = totalRow(s)
        const sums = totals(s)
        expect(total?.label).toBe('Total')
        expect(sums.debit).toBeGreaterThan(0)
        expect(sums.debit).toBe(sums.credit)
        expect(sums.debit).toBe(sums.blockDebits)
    })

    test('a press on a block heading folds it to its totals; Collapse all and Expand all fold and open every block', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = uniqueName('JR fold expense')
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        await openEntriesFromSidebar(page)
        const first = await postSimple(page, GL_DAY_1, expense, '70.00')
        const second = await postSimple(page, GL_DAY_1, expense, '30.00')

        await openJournal(page)
        await choosePeriod(page, { from: GL_DAY_1, to: GL_DAY_1 })
        await journalWhen(
            page,
            snap =>
                hasTotal(snap) &&
                linesOf(snap, first).length === 2 &&
                linesOf(snap, second).length === 2,
            'both blocks open'
        )

        await pressBlockHeading(page, first)
        const folded = await journalWhen(
            page,
            snap =>
                hasTotal(snap) &&
                blockHead(snap, first) !== undefined &&
                linesOf(snap, first).length === 0,
            'the first block folded'
        )
        const head = blockHead(folded, first)
        expect(figure(head?.cells.debit)).toBe('70.00')
        expect(figure(head?.cells.credit)).toBe('70.00')
        expect(linesOf(folded, second).length).toBe(2)

        await pressToolbar(page, 'report-fold-all', 'Collapse all')
        const collapsed = await journalWhen(
            page,
            snap =>
                hasTotal(snap) &&
                blockHead(snap, first) !== undefined &&
                blockHead(snap, second) !== undefined &&
                snap.rows.every(row => row.kind !== 'detail'),
            'every block folded'
        )
        expect(figure(blockHead(collapsed, second)?.cells.debit)).toBe('30.00')

        await pressToolbar(page, 'report-fold-all', 'Expand all')
        await journalWhen(
            page,
            snap =>
                hasTotal(snap) &&
                linesOf(snap, first).length === 2 &&
                linesOf(snap, second).length === 2,
            'every block open again'
        )
    })

    test('a press on the Debit heading sorts the lines inside each block and keeps the blocks in order', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = uniqueName('JR sort expense')
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: GL_DAY_1,
            memo: uniqueName('JR sort three debits'),
            lines: [
                { account: expense, debit: '10.00' },
                { account: expense, debit: '30.00' },
                { account: expense, debit: '20.00' },
                { account: ACCOUNT_LABELS.checking, credit: '60.00' },
            ],
        })
        const sorted = `${await openEntryNumber(page)} · Journal entry`
        const other = await postSimple(page, GL_DAY_1, expense, '5.00')

        await openJournal(page)
        await choosePeriod(page, { from: GL_DAY_1, to: GL_DAY_1 })
        const debitsOf = (s: GlSnapshot) =>
            linesOf(s, sorted)
                .map(row => figure(row.cells.debit))
                .filter(debit => debit !== '')
        const blocksInOrder = (s: GlSnapshot) => {
            const labels = blockLabels(s)
            return labels.indexOf(sorted) >= 0 && labels.indexOf(other) > labels.indexOf(sorted)
        }
        const plain = await journalWhen(
            page,
            s => hasTotal(s) && linesOf(s, sorted).length === 4 && linesOf(s, other).length === 2,
            'the two blocks in the report order'
        )
        expect(debitsOf(plain)).toEqual(['10.00', '30.00', '20.00'])
        expect(blocksInOrder(plain)).toBe(true)
        const sortParam = () => new URL(page.url()).searchParams.get('s')

        await page.getByTestId('report-sort-debit').click()
        await expect.poll(sortParam).toBe('debit:asc')
        const ascending = await journalWhen(
            page,
            s => hasTotal(s) && debitsOf(s)[0] === '10.00' && debitsOf(s)[1] === '20.00',
            'the lines by Debit, ascending'
        )
        expect(debitsOf(ascending)).toEqual(['10.00', '20.00', '30.00'])
        expect(linesOf(ascending, sorted).length).toBe(4)
        expect(blocksInOrder(ascending)).toBe(true)

        await page.getByTestId('report-sort-debit').click()
        await expect.poll(sortParam).toBe('debit:desc')
        const descending = await journalWhen(
            page,
            s => hasTotal(s) && debitsOf(s)[0] === '30.00',
            'the lines by Debit, descending'
        )
        expect(debitsOf(descending)).toEqual(['30.00', '20.00', '10.00'])
        expect(blocksInOrder(descending)).toBe(true)

        await page.getByTestId('report-sort-debit').click()
        await expect.poll(sortParam).toBeNull()
        const unsorted = await journalWhen(
            page,
            s => hasTotal(s) && debitsOf(s)[1] === '30.00',
            'the report order again'
        )
        expect(debitsOf(unsorted)).toEqual(['10.00', '30.00', '20.00'])
        expect(blocksInOrder(unsorted)).toBe(true)
    })
})
