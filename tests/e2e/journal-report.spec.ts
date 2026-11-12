import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, pressToolbar, waitForTableFit } from '@tinycld/core/e2e-helpers'
import { textWidth } from '@tinycld/core/reports/lib/text-width'
import { GENERAL_LEDGER_LONG_SECTION } from '../../tinycld/books/lib/general-ledger-fixture'
import { createAccount, DESKTOP, openChart, PHONE } from './account-register-helpers'
import {
    browserToday,
    choosePeriod,
    dayWords,
    expectedHeading,
    GL_DAY_1,
    GL_DAY_2,
    type GlSnapshot,
    glSnapshot,
    openEntriesFromSidebar,
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

// A box of a row's label or one of its cells. `cut`: the element, or a child, shows an
// ellipsis (its text is wider than its box).
type Box = { top: number; bottom: number; left: number; right: number; width: number; cut: boolean }

type RowGeometry = {
    // The row's label (the Entry / Date column) and every drawn cell, by column id.
    label: Box | null
    cells: Record<string, Box>
    // The left and right edges of the room the rows get: the list scroller's client area
    // (no gutter).
    rowsLeft: number
    rowsRight: number
    // The label's text, and how far its text starts right of the label box's left edge
    // (the indent and a group's caret).
    labelText: string
    labelTextStart: number
    // The report table's right edge, and the right edges of the Debit and Credit headings
    // and of every drawn Debit and Credit cell.
    tableRight: number
    figureRights: number[]
    headingCount: number
    // Neither the table nor a sideways scroller inside it scrolls sideways.
    noSidewaysScroll: boolean
    tableScrollsSideways: boolean
}

// Brings the row `id` into the middle of the report's list and reads its geometry, in ONE
// page.evaluate: the list is a FlashList that mounts only the rows near its view, so the
// row is found by scrolling from the top. Null when the row is not in the list.
function rowGeometry(page: Page, id: string): Promise<RowGeometry | null> {
    return page.evaluate(async rowId => {
        const frames = () =>
            new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const table = document.querySelector('[data-testid="report-table"]') as HTMLElement | null
        if (!table) return null
        const listOf = (): HTMLElement | null => {
            const any = table.querySelector('[data-testid^="report-row-"]')
            let list = any?.parentElement ?? null
            while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement
            return list
        }
        const rowEl = () =>
            table.querySelector(`[data-testid="${CSS.escape(`report-row-${rowId}`)}"]`)
        const list = listOf()
        if (!list) return null
        if (!rowEl()) {
            list.scrollTop = 0
            await frames()
            for (let step = 0; step < 400 && !rowEl(); step++) {
                const before = list.scrollTop
                list.scrollTop = before + list.clientHeight * 0.8
                await frames()
                if (list.scrollTop === before) {
                    // At the end: a next page may be loading; give it a moment.
                    for (let wait = 0; wait < 30 && !rowEl(); wait++) await frames()
                    if (list.scrollTop === before && !rowEl()) break
                }
            }
        }
        const found = rowEl()
        if (!found) return null
        found.scrollIntoView({ block: 'center' })
        await frames()
        const box = (element: Element | null) => {
            if (!element) return null
            const rect = element.getBoundingClientRect()
            const cut = [element, ...element.querySelectorAll('*')].some(
                e => e instanceof HTMLElement && e.scrollWidth > e.clientWidth
            )
            return rect.height > 0
                ? {
                      top: rect.top,
                      bottom: rect.bottom,
                      left: rect.left,
                      right: rect.right,
                      width: rect.width,
                      cut,
                  }
                : null
        }
        const cells: Record<string, Box> = {}
        for (const cell of table.querySelectorAll('[data-testid^="report-cell-"]')) {
            const rest = (cell.getAttribute('data-testid') ?? '').slice('report-cell-'.length)
            const dash = rest.indexOf('-')
            if (rest.slice(dash + 1) !== rowId) continue
            const cellBox = box(cell)
            if (cellBox) cells[rest.slice(0, dash)] = cellBox
        }
        const visible = (element: Element) => element.getBoundingClientRect().height > 0
        const figures = [
            ...table.querySelectorAll(
                '[data-testid="report-heading-debit"], [data-testid="report-heading-credit"], [data-testid^="report-cell-debit-"], [data-testid^="report-cell-credit-"]'
            ),
        ].filter(visible)
        const scrollers = [table, ...table.querySelectorAll('*')].filter(element => {
            const overflowX = getComputedStyle(element).overflowX
            return element === table || overflowX === 'auto' || overflowX === 'scroll'
        })
        const listRect = list.getBoundingClientRect()
        // The label's Text is its last child (a group's caret comes before it).
        const labelTextEl = found.lastElementChild ?? found
        return {
            label: box(found),
            cells,
            rowsLeft: listRect.left + list.clientLeft,
            rowsRight: listRect.left + list.clientLeft + list.clientWidth,
            labelText: labelTextEl.textContent ?? '',
            labelTextStart:
                labelTextEl.getBoundingClientRect().left - found.getBoundingClientRect().left,
            tableRight: table.getBoundingClientRect().right,
            figureRights: figures.map(element => element.getBoundingClientRect().right),
            headingCount: figures.filter(element =>
                (element.getAttribute('data-testid') ?? '').startsWith('report-heading-')
            ).length,
            noSidewaysScroll: scrollers.every(
                element => element.scrollWidth === element.clientWidth
            ),
            tableScrollsSideways: table.scrollWidth !== table.clientWidth,
        }
    }, id)
}

const near = (a: number | undefined, b: number | undefined, slack = 1) =>
    a !== undefined && b !== undefined && Math.abs(a - b) <= slack

// The top of a row's column: the label column (Entry / Date) is the row's label box.
function topOf(row: RowGeometry | null, col: string): number | undefined {
    if (col === 'entry') return row?.label?.top
    return row?.cells[col]?.top
}

// The parts of a row the reader needs whole (spec §3 "Every width fits"): each one that is
// missing or shows an ellipsis, named `<what>:<column>` ('entry' is the row's label).
function cutParts(what: string, row: RowGeometry | null, columns: readonly string[]): string[] {
    return columns
        .filter(col => {
            const part = col === 'entry' ? row?.label : row?.cells[col]
            return part == null || part.cut
        })
        .map(col => `${what}:${col}`)
}

// Spec §3 Phone: date and account; then name and description; then debit and credit.
const PHONE_LINES = [
    ['entry', 'account'],
    ['name', 'description'],
    ['debit', 'credit'],
] as const

function phoneLineShape(row: RowGeometry | null) {
    const tops = PHONE_LINES.map(cols => cols.map(col => topOf(row, col)))
    const credit = row?.cells.credit
    return {
        measured: tops.flat().every(top => top !== undefined),
        eachLineOneTop: tops.map(line => line.every(top => near(top, line[0]))),
        linesInOrder: tops
            .slice(1)
            .every((line, i) => (line[0] ?? 0) > (tops[i]?.[0] ?? Number.POSITIVE_INFINITY) + 1),
        // Credit ends at the right edge of the rows' room (within 2 px) and never past the
        // table's right edge. The rows' room, not the table, is the edge to be near: on CI
        // Chromium draws a classic scrollbar, so the list's gutter lies between the rows
        // and the table's right edge (lesson 11).
        creditAtRightEdge: near(credit?.right, row?.rowsRight, 2),
        creditInsideTable:
            credit !== undefined && row !== null && credit.right <= row.tableRight + 0.5,
    }
}

// A block heading or total row's text (cellTextStyle: group, subtotal and total rows are
// bold) and the right padding of its label (pr-3), as core's labelNeed counts them.
const SUMMARY_TEXT = { size: 'sm', weight: 'semibold' } as const
const LABEL_END_PADDING = 12

// A block heading or block total row on a phone (spec §3 Phone): label and figures on one
// line when they fit, else the label, then every figure on the line right below it.
// `fits` is decided from the row's own measure: the room left of its first figure (from
// the rows' left edge to the Debit cell) holds the label's start, its text at core's
// published text width (`textWidth`, the upper estimate core sizes with) and its padding.
function labelAndFigures(row: RowGeometry | null) {
    const label = row?.label
    const cells = Object.values(row?.cells ?? {})
    const firstFigureLeft = Math.min(...cells.map(cell => cell.left))
    const room = firstFigureLeft - (row?.rowsLeft ?? 0)
    const need =
        (row?.labelTextStart ?? 0) +
        textWidth(row?.labelText ?? '', SUMMARY_TEXT) +
        LABEL_END_PADDING
    const fits = need <= room
    const distinct: number[] = []
    for (const top of [label?.top, ...cells.map(cell => cell.top)]) {
        if (top !== undefined && !distinct.some(seen => near(seen, top))) distinct.push(top)
    }
    const figuresWhere = () => {
        if (cells.every(cell => near(cell.top, label?.top))) return 'beside'
        if (cells.every(cell => near(cell.top, label?.bottom))) return 'below'
        return 'mixed'
    }
    // A heading whose block total follows draws no figures: only its label, across the row.
    const figures = cells.length === 0 ? 'none' : figuresWhere()
    return {
        measured: label != null,
        atMostTwoLines: distinct.length <= 2,
        figuresWhereTheyFit: figures === 'none' || figures === (fits ? 'beside' : 'below'),
        figures,
        fits,
        need,
        room,
    }
}

// A line row at a tablet or desktop width (spec §3 Every width fits, §5 layouts).
function wideLineShape(row: RowGeometry | null) {
    const date = row?.label
    const tops = Object.fromEntries(
        ['account', 'name', 'description', 'debit', 'credit'].map(col => [
            col,
            row?.cells[col]?.top,
        ])
    )
    return {
        measured: date != null && Object.values(tops).every(top => top !== undefined),
        figuresInsideTable:
            (row?.headingCount ?? 0) === 2 &&
            (row?.figureRights ?? []).every(right => right <= (row?.tableRight ?? 0) + 1),
        debitOnDateLine: near(tops.debit, date?.top),
        textOnNextLine: ['name', 'description'].every(col => near(tops[col], date?.bottom)),
        allOnDateLine: Object.values(tops).every(top => near(top, date?.top)),
        descriptionWiderThanName:
            (row?.cells.description?.width ?? 0) > (row?.cells.name?.width ?? 0),
        noSidewaysScroll: row?.noSidewaysScroll ?? false,
    }
}

// The rows a fit test reads: its entry's block (heading, lines, total) and its void
// reversal's block (heading, total), from one whole-report read.
type FitRows = {
    lines: string[]
    heads: string[]
    totals: string[]
}

function fitRows(s: GlSnapshot, heading: string, voidHeading: string): FitRows {
    return {
        lines: linesOf(s, heading).map(row => row.id),
        heads: [heading, voidHeading].map(h => blockHead(s, h)?.id ?? ''),
        totals: [heading, voidHeading].map(h => blockTotal(s, h)?.id ?? ''),
    }
}

// Every part the reader needs whole on the fit test's rows: the lines' date, Debit and
// Credit, both block headings and both "Total …" labels; `extra` adds line columns.
async function cutOnRows(page: Page, rows: FitRows, extra: readonly string[] = []) {
    const cut: string[] = []
    for (const [i, id] of rows.lines.entries()) {
        cut.push(
            ...cutParts(`line${i}`, await rowGeometry(page, id), [
                'entry',
                'debit',
                'credit',
                ...extra,
            ])
        )
    }
    for (const [i, id] of [...rows.heads, ...rows.totals].entries()) {
        cut.push(...cutParts(`block${i}`, await rowGeometry(page, id), ['entry']))
    }
    return cut
}

// The seeded long section (seed.ts seedLongSection, GENERAL_LEDGER_LONG_SECTION): two entries
// of 131 lines each (130 one-dollar debits and one offset credit), dated 2020-09-15 and
// 2020-09-16 (GENERAL_LEDGER_LONG_SECTION.dates), every line described by the entry memo
// "Daily sweep".
const SWEEP_MEMO = 'Daily sweep'
const SWEEP_LINES = 131
const SWEEP_CENTS = 13000

// One /api/reports/run answer, as the server sent it: money cells are minor units.
type AnswerRow = {
    id: string
    kind: string
    label: string
    section?: string
    cells: Record<string, number | string | boolean | null>
}
type Answer = { cursor: string; rows: AnswerRow[]; next: string }
type SentRun = {
    params?: { period?: { from?: string; to?: string } }
    options?: { cursor?: string }
}

const answerCents = (value: number | string | boolean | null | undefined) =>
    typeof value === 'number' ? value : 0

// The sweep blocks of an answer, found by their lines' Description, never by position.
function sweepBlocks(rows: AnswerRow[]) {
    return rows
        .filter(row => row.kind === 'group')
        .map(group => {
            const lines = rows.filter(row => row.kind === 'detail' && row.section === group.id)
            const total = rows.find(row => row.kind === 'subtotal' && row.section === group.id)
            return { group, lines, total }
        })
        .filter(
            ({ lines }) =>
                lines.length > 0 && lines.every(line => line.cells.description === SWEEP_MEMO)
        )
}

// Scrolls the report's list to its end.
function scrollToEnd(page: Page) {
    return page
        .getByTestId('report-table')
        .locator('[data-testid^="report-row-"]')
        .first()
        .evaluate(row => {
            let scroller = row.parentElement
            while (scroller && getComputedStyle(scroller).overflowY !== 'auto') {
                scroller = scroller.parentElement
            }
            if (scroller) scroller.scrollTop = scroller.scrollHeight
        })
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

    test('on a phone the Journal opens from the Books menu and each line wraps onto three lines, nothing cut', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = uniqueName('JR phone expense')
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        await openEntriesFromSidebar(page)
        const heading = await postSimple(page, GL_DAY_1, expense, '1234.56')
        const number = heading.replace(/ · Journal entry$/, '')
        await voidPostedEntry(page)
        const voidHeading = `${number} · Void reversal of ${number}`

        // The phone path: Reports from the Books menu drawer (openBooksReports).
        await page.setViewportSize(PHONE)
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

        await choosePeriod(page, { from: GL_DAY_1, to: GL_DAY_1 })
        const s = await journalWhen(
            page,
            snap =>
                snap.header === dayWords(GL_DAY_1) &&
                hasTotal(snap) &&
                linesOf(snap, heading).length === 2 &&
                blockTotal(snap, voidHeading) !== undefined,
            'the entry and its void reversal on the first day'
        )
        expect(await waitForTableFit(page)).toBe('mobile')
        const rows = fitRows(s, heading, voidHeading)
        const [lineId = ''] = rows.lines

        await expect
            .poll(async () => phoneLineShape(await rowGeometry(page, lineId)), {
                message: 'the authored phone lines (spec §3 Phone)',
            })
            .toEqual({
                measured: true,
                eachLineOneTop: [true, true, true],
                linesInOrder: true,
                creditAtRightEdge: true,
                creditInsideTable: true,
            })
        await expect
            .poll(
                async () => {
                    const shapes = []
                    // The block headings and totals, and the report's short "Total" row.
                    for (const id of [...rows.heads, ...rows.totals, totalRow(s)?.id ?? '']) {
                        shapes.push(labelAndFigures(await rowGeometry(page, id)))
                    }
                    return shapes
                },
                {
                    message:
                        'block headings and totals: label and figures on one line when they fit, else the figures right below the label',
                }
            )
            .toMatchObject(
                Array.from({ length: 5 }, () => ({
                    measured: true,
                    atMostTwoLines: true,
                    figuresWhereTheyFit: true,
                }))
            )
        await expect
            .poll(() => cutOnRows(page, rows), { message: 'nothing the reader needs is cut' })
            .toEqual([])
        expect((await rowGeometry(page, lineId))?.tableScrollsSideways).toBe(false)
    })

    test('at tablet and desktop widths a line wraps only where its one line does not fit, all inside the table and nothing cut', async ({
        page,
    }) => {
        await startBooks(page)
        // A 30-character customer, a numbered account with a 20-character name and a
        // 70-character entry memo: each competes for the line's room.
        const customer = `JR customer ${uniqueName('C').replace(/ /g, '-').slice(-18)}`
        const account = `JA ${uniqueName('A').replace(/ /g, '-').slice(-17)}`
        // Five digits (the label "<5 digits> <20 chars>" is spec §5's 26-character measure),
        // unique on the shared DB: account numbers are a unique index, only this test makes
        // 9xxxx numbers, and the four digits are the run's start second, so two runs collide
        // only when they start in the same second or exactly 10,000 s apart (CI starts each
        // run on an empty DB).
        const accountNumber = `9${String(Math.floor(Date.now() / 1000) % 1e4).padStart(4, '0')}`
        const memo =
            `${uniqueName('JR wide memo')} for the design team's monthly software plan`.slice(0, 70)
        expect([customer.length, account.length, memo.length]).toEqual([30, 20, 70])
        await createCustomer(page, { name: customer })
        await openChart(page)
        await createAccount(page, account, EXPENSE, accountNumber)
        await openEntriesFromSidebar(page)
        const accountLabel = `${accountNumber} ${account}`
        await postEntryOn(page, {
            date: GL_DAY_1,
            memo,
            lines: [
                { account: accountLabel, debit: '1234.56', name: customer },
                { account: ACCOUNT_LABELS.checking, credit: '1234.56' },
            ],
        })
        const number = await openEntryNumber(page)
        await voidPostedEntry(page)
        const heading = `${number} · Journal entry`
        const voidHeading = `${number} · Void reversal of ${number}`

        await openJournal(page)
        await choosePeriod(page, { from: GL_DAY_1, to: GL_DAY_1 })
        const s = await journalWhen(
            page,
            snap =>
                snap.header === dayWords(GL_DAY_1) &&
                hasTotal(snap) &&
                linesOf(snap, heading).length === 2 &&
                blockTotal(snap, voidHeading) !== undefined,
            'the entry and its void reversal on the first day'
        )
        const rows = fitRows(s, heading, voidHeading)
        const [lineId = ''] = rows.lines
        expect(linesOf(s, heading)[0]?.cells.account).toBe(accountLabel)
        expect(linesOf(s, heading)[0]?.cells.name).toBe(customer)

        // The report view has no Books sidebar: its rows are the window less the 64 px rail.
        // Spec §5 gates the one line at 880 px rows (display.oneLine.minWidth): a 900 window
        // gives 836 px rows (< 880), so it draws the tablet layout; 1024 and 1280 give rows
        // of 960 and 1216 px, so they draw the one line.
        for (const { size, layout } of [
            { size: { width: 900, height: 800 }, layout: 'tablet' },
            { size: { width: 1024, height: 800 }, layout: 'one-line' },
            { size: { width: 1280, height: 800 }, layout: 'one-line' },
        ]) {
            const isTablet = layout === 'tablet'
            await page.setViewportSize(size)
            expect(await waitForTableFit(page), `the layout at ${size.width}`).toBe(layout)
            await expect
                .poll(async () => wideLineShape(await rowGeometry(page, lineId)), {
                    message: `the ${isTablet ? 'tablet layout' : 'one line'} at ${size.width}`,
                })
                .toEqual({
                    measured: true,
                    figuresInsideTable: true,
                    debitOnDateLine: true,
                    textOnNextLine: isTablet,
                    allOnDateLine: !isTablet,
                    // D1 reversed: Description's flexGrow 2 gives it the most of the spare
                    // room on the one line; the tablet layout gives it 8 tracks to Name's 4.
                    descriptionWiderThanName: true,
                    noSidewaysScroll: true,
                })
            await expect
                .poll(
                    async () => [
                        ...cutParts('account20', await rowGeometry(page, lineId), ['account']),
                        ...(await cutOnRows(page, rows)),
                    ],
                    { message: `nothing the reader needs is cut at ${size.width}` }
                )
                .toEqual([])
        }
    })

    test('a long period pages as it scrolls: a block longer than the first page continues on the next, then the Total', async ({
        page,
    }) => {
        await startBooks(page)
        await openJournal(page)
        const [from, to] = GENERAL_LEDGER_LONG_SECTION.dates

        // The answers of the runs over the sweep days, in the order they arrive.
        const answers: Promise<Answer>[] = []
        page.on('response', response => {
            if (!response.url().includes('/api/reports/run') || !response.ok()) return
            const body = response.request().postDataJSON() as SentRun | null
            if (body?.params?.period?.from !== from || body.params.period.to !== to) return
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
        // The first next page waits until the test has seen the list ask for it. The cursor
        // of that held request names the first page the list follows.
        let release = () => {}
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        let heldCursor = ''
        await page.route('**/api/reports/run', async route => {
            const body = route.request().postDataJSON() as SentRun | null
            const cursor = body?.options?.cursor ?? ''
            if (cursor) {
                if (heldCursor === '') heldCursor = cursor
                await held
            }
            await route.continue()
        })

        await choosePeriod(page, { from, to })
        await expect
            .poll(async () => {
                await scrollToEnd(page)
                if (heldCursor === '') return false
                return page.getByTestId('report-loading-more').isVisible()
            })
            .toBe(true)

        // A live re-run (another worker's post) can bring more than one first page: the one
        // the list follows is the first page whose next cursor the held request carries.
        const first = (await Promise.all(answers)).findLast(
            answer => answer.cursor === '' && answer.next === heldCursor
        ) as Answer
        expect(first, 'the first page whose next page the list asked for').toBeDefined()

        // The first answer: the first sweep block whole, the second cut after its group row.
        const [firstSweep, secondSweep] = sweepBlocks(first.rows)
        expect(firstSweep?.lines.length, 'the first sweep block is whole on page 1').toBe(
            SWEEP_LINES
        )
        expect(answerCents(firstSweep?.total?.cells.debit)).toBe(SWEEP_CENTS)
        expect(answerCents(firstSweep?.total?.cells.credit)).toBe(SWEEP_CENTS)
        expect(secondSweep, "the second sweep block's group row is on page 1").toBeDefined()
        expect(secondSweep?.lines.length).toBeGreaterThan(0)
        expect(secondSweep?.lines.length).toBeLessThan(SWEEP_LINES)
        expect(secondSweep?.total, 'the second block has no block total on page 1').toBeUndefined()
        expect(first.next, 'the first answer ends inside the second block').not.toBe('')
        const lastBeforeTotal = first.rows.findLast(row => row.kind !== 'total')
        expect(lastBeforeTotal?.section).toBe(secondSweep?.group.id)
        release()

        // Every page after the first, following page.next to the last page.
        await expect
            .poll(async () => {
                await scrollToEnd(page)
                return (await Promise.all(answers)).some(
                    answer => answer.cursor !== '' && answer.next === ''
                )
            })
            .toBe(true)
        const all = await Promise.all(answers)
        const chain = [first]
        for (let at = first; at.next !== ''; ) {
            const next = all.find(answer => answer.cursor === at.next)
            expect(next, 'each next page follows the page before it').toBeDefined()
            if (!next) break
            chain.push(next)
            at = next
        }
        const later = chain.slice(1)
        const secondId = secondSweep?.group.id
        const laterLines = later.flatMap(answer =>
            answer.rows.filter(row => row.kind === 'detail' && row.section === secondId)
        )
        expect(laterLines.length).toBeGreaterThan(0)
        expect(laterLines.every(row => row.cells.description === SWEEP_MEMO)).toBe(true)
        const secondLineIds = [...(secondSweep?.lines ?? []), ...laterLines].map(row => row.id)
        expect(new Set(secondLineIds).size, 'no line of the second block repeats').toBe(
            secondLineIds.length
        )
        expect(secondLineIds.length, 'the second block holds all its lines').toBe(SWEEP_LINES)
        expect(
            later.some(answer => answer.rows.some(row => row.id === secondId)),
            "the second block's group row is not sent again"
        ).toBe(false)

        // The second block's total after its last line, then the report's Total.
        const last = chain.at(-1) as Answer
        const secondTotalAt = last.rows.findIndex(
            row => row.kind === 'subtotal' && row.section === secondId
        )
        const totalAt = last.rows.findIndex(row => row.kind === 'total')
        expect(secondTotalAt, "the second block's total is on the last page").toBeGreaterThan(-1)
        expect(totalAt).toBe(last.rows.length - 1)
        expect(secondTotalAt).toBeLessThan(totalAt)
        expect(
            last.rows.slice(secondTotalAt + 1).some(row => row.section === secondId),
            'no line of the second block after its total'
        ).toBe(false)
        const secondTotal = last.rows[secondTotalAt]
        expect(answerCents(secondTotal?.cells.debit)).toBe(SWEEP_CENTS)
        expect(answerCents(secondTotal?.cells.credit)).toBe(SWEEP_CENTS)
        const total = last.rows[totalAt]
        expect(answerCents(total?.cells.debit)).toBeGreaterThan(0)
        expect(answerCents(total?.cells.debit)).toBe(answerCents(total?.cells.credit))

        // The list shows a line of the next page and, at its end, the Total row.
        const laterIds = new Set(laterLines.map(row => row.id))
        await expect
            .poll(
                async () => {
                    await scrollToEnd(page)
                    const snap = await glSnapshot(page)
                    return {
                        nextPageLine: snap.rows.some(
                            row => laterIds.has(row.id) && row.cells.description === SWEEP_MEMO
                        ),
                        total: snap.rows.some(row => row.kind === 'total'),
                    }
                },
                { message: 'a line of the next page and the Total row in the list' }
            )
            .toEqual({ nextPageLine: true, total: true })
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('a post made on another page appears as a new block in the open Journal without a reload', async ({
        page,
        browser,
    }) => {
        await startBooks(page)
        await openJournal(page)
        await choosePeriod(page, { from: GL_DAY_2, to: GL_DAY_2 })
        // The day may hold other specs' entries, or none (core's empty state).
        await expect
            .poll(async () => {
                const header = page.getByTestId('report-document-period')
                const empty = page.getByTestId('report-empty').getByTestId('report-empty-message')
                if (await empty.isVisible()) return await empty.innerText()
                return (await header.isVisible()) ? await header.innerText() : ''
            })
            .toMatch(new RegExp(`(^|No rows for )${dayWords(GL_DAY_2)}$`))
        await page.evaluate(() => {
            ;(window as unknown as { jrNotReloaded?: boolean }).jrNotReloaded = true
        })

        // Page B is a second browser context signed in as the same user: its own session
        // and its own realtime connection, so the post reaches page A through the server.
        const memo = uniqueName('JR live post')
        const otherContext = await browser.newContext()
        const other = await otherContext.newPage()
        await startBooks(other)
        await openEntriesFromSidebar(other)
        await postEntryOn(other, {
            date: GL_DAY_2,
            memo,
            lines: [
                { account: ACCOUNT_LABELS.equity, debit: '17.00' },
                { account: ACCOUNT_LABELS.checking, credit: '17.00' },
            ],
        })
        const heading = `${await openEntryNumber(other)} · Journal entry`
        await otherContext.close()

        const live = await journalWhen(
            page,
            s => hasTotal(s) && linesOf(s, heading).length === 2,
            'the new block in the open report'
        )
        expect(linesOf(live, heading).map(row => row.cells.description)).toEqual([memo, memo])
        expect(figure(blockTotal(live, heading)?.cells.debit)).toBe('17.00')
        const notReloaded = await page.evaluate(
            () => (window as unknown as { jrNotReloaded?: boolean }).jrNotReloaded
        )
        expect(notReloaded).toBe(true)
    })

    test('a period with no posted line shows the empty state with its period and Show this fiscal year', async ({
        page,
    }) => {
        await startBooks(page)
        await openJournal(page)
        // After the close date books-settings.spec.ts holds; no seed or spec posts on July 2,
        // and an entry dated today would land on it only when today is July 2.
        const today = await browserToday(page)
        const year = today.slice(0, 4)
        const day = today === `${year}-07-02` ? `${year}-07-03` : `${year}-07-02`
        await choosePeriod(page, { from: day, to: day })
        const empty = page.getByTestId('report-empty')
        await expect(empty).toBeVisible()
        await expect(empty.getByTestId('report-empty-message')).toHaveText(
            `No rows for ${dayWords(day)}`
        )
        await expect(empty.getByTestId('report-empty-action')).toHaveText('Show this fiscal year')
        await expect(
            page.getByTestId('report-table').locator('[data-testid^="report-row-"]')
        ).toHaveCount(0)
    })
})
