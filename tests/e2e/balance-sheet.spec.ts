import { expect, type Page, test } from '@playwright/test'
import { authStorageKey, login, navigateToPackage, pressToolbar } from '@tinycld/core/e2e-helpers'
import {
    BALANCE_SHEET_TITLE,
    NET_INCOME_LABEL,
    RETAINED_EARNINGS_LABEL,
    SECTION_TITLES,
    TOTAL_LIABILITIES_AND_EQUITY_LABEL,
} from '~/tinycld/books/lib/balance-sheet-fixture'
import { SEED_ACCOUNTS } from '~/tinycld/books/lib/seed-accounts'
import { PRIOR_YEAR_SEED } from '~/tinycld/books/lib/trial-balance-fixture'
import { createAccount, DESKTOP, openChart } from './account-register-helpers'
import {
    type BsSnapshot,
    browserToday,
    bsLinesUnder,
    bsSnapshot,
    chooseAsOf,
    chooseRows,
    dayWords,
    openBalanceSheet,
    openBalanceSheetAccount,
    postEntryOn,
} from './books-report-helpers'
import { postedEntryNumber } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'

// The shipped Balance Sheet in core's report view (/a/reports/<id>), read by the e2e
// user through the viewer share Books keeps. Every test makes its own accounts and
// entries through the UI, names them with `uniqueName`, and reads rows in ONE snapshot
// (`bsSnapshot`). Entries are dated today: never before 2026-07-01, so the close date
// and the fiscal start month books-settings.spec.ts sets on the shared DB neither refuse a
// post nor change what a test asserts.
//
// Other workers post today on the shared DB, so an exact figure is asserted only on an
// account the test owns, as a relation inside one snapshot (Total Assets = Total
// liabilities and equity; Change = Current − Prior year), or on a day on or before the
// seed's prior-year entry S (P3): `PRIOR_YEAR_SEED`, the only posted entry on or before S.
//
// The table is a FlashList: only mounted rows are in the DOM. The tests run 1280 wide and
// tall, and a snapshot is taken only when both ends of the rows it reads are in it: the
// mounted rows are one contiguous run, so every row between the two ends is there too.
//
// Not covered here (core's own e2e cover them for every report): Expand all / Collapse
// all, loading, error, timeout, no access, Copy link and Save as.

const BANK = { type: 'Bank', detailType: 'Checking' }
const CREDIT_CARD = { type: 'Credit card', detailType: 'Credit card' }
const INCOME = { type: 'Income', detailType: 'Service income' }
const OTHER_ASSET = { type: 'Other asset', detailType: 'Security deposits' }

// Desktop width, and tall so the whole outline of a busy shared book mounts at once.
const TALL = { width: DESKTOP.width, height: 4000 }

const RECEIVABLE = SEED_ACCOUNTS.find(account => account.key === 'receivable')
const RECEIVABLE_LABEL = `${RECEIVABLE?.number} ${RECEIVABLE?.name}`
// The seed's prior-year entry: debit Accounts receivable, credit Consulting income.
const SEED_CENTS = PRIOR_YEAR_SEED.lines[0][1]

type Row = BsSnapshot['rows'][number]

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(TALL)
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

async function createAccounts(
    page: Page,
    accounts: { name: string; kind: typeof BANK }[]
): Promise<void> {
    await openChart(page)
    for (const { name, kind } of accounts) await createAccount(page, name, kind)
}

// Created accounts sort near the top of their type: unnumbered, and "AA" first.
function accountName(prefix: string): string {
    return uniqueName(`AA ${prefix}`)
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

// Polls snapshots until `isReady` holds and returns that snapshot, so every later
// assertion reads the same single snapshot.
async function snapshotWhen(
    page: Page,
    isReady: (snapshot: BsSnapshot) => boolean,
    message: string
): Promise<BsSnapshot> {
    const last: { snapshot: BsSnapshot | null } = { snapshot: null }
    await expect
        .poll(
            async () => {
                last.snapshot = await bsSnapshot(page)
                return isReady(last.snapshot)
            },
            { message }
        )
        .toBe(true)
    if (!last.snapshot) throw new Error(message)
    return last.snapshot
}

function indexOf(snapshot: BsSnapshot, label: string): number {
    return snapshot.rows.findIndex(row => row.label === label)
}

function has(snapshot: BsSnapshot, ...labels: string[]): boolean {
    return labels.every(label => indexOf(snapshot, label) >= 0)
}

function rowOf(snapshot: BsSnapshot, label: string): Row {
    const row = snapshot.rows.find(candidate => candidate.label === label)
    if (!row) throw new Error(`no row labelled ${label}`)
    return row
}

// A figure cell's text as cents: "$1,234.50" → 123450, "-12.00" and "(12.00)" negative;
// null when the cell is blank.
function cents(text: string | undefined): number | null {
    const trimmed = (text ?? '').trim()
    if (trimmed === '') return null
    const isNegative = trimmed.startsWith('-') || trimmed.startsWith('(')
    const digits = trimmed.replace(/[^0-9.]/g, '')
    const value = Math.round(Number.parseFloat(digits) * 100)
    return isNegative ? -value : value
}

function figure(snapshot: BsSnapshot, label: string, column: string): number | null {
    return cents(rowOf(snapshot, label).cells[column])
}

function roundHalfAway(value: number): number {
    return Math.sign(value) * Math.round(Math.abs(value))
}

// % change as core computes and shows it: Change ÷ |Prior year| at scale 4, × 100, then
// one decimal, half away from zero; blank when Prior year is 0.
function expectedPct(change: number, prior: number): string {
    if (prior === 0) return ''
    const hundredths = roundHalfAway((change * 10000) / Math.abs(prior))
    const tenths = roundHalfAway(hundredths / 10)
    return `${(tenths / 10).toFixed(1)}%`
}

// Core's Negative numbers option may draw a negative in parentheses.
function pctText(text: string | undefined): string {
    const trimmed = (text ?? '').trim()
    const parens = /^\((.*)\)$/.exec(trimmed)
    return parens ? `-${parens[1]}` : trimmed
}

// The column heading's short day (Intl en-US), the day being a YYYY-MM-DD.
function shortDay(day: string): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`))
}

// The same day twelve months earlier (core addMonths: Feb 29 → Feb 28).
function priorDay(day: string): string {
    const monthDay = day.slice(5) === '02-29' ? '02-28' : day.slice(5)
    return `${Number(day.slice(0, 4)) - 1}-${monthDay}`
}

// S, the seed's prior-year day, and the browser's year (the seed's year).
async function seedDay(page: Page): Promise<{ year: number; s: string }> {
    const year = Number((await browserToday(page)).slice(0, 4))
    return { year, s: `${year - PRIOR_YEAR_SEED.yearsAgo}-${PRIOR_YEAR_SEED.day}` }
}

// Folds the open group row labelled `label`: the row must be there and open, so a fold
// that stops working fails here, not in a later poll. A fold runs the report again, so it
// waits for the toggle's new state. An open group at the top of the list is covered by
// core's stuck copy of it, so a reader presses that copy; else the row itself.
async function foldRow(page: Page, label: string): Promise<void> {
    const row = page
        .getByTestId('report-table')
        .locator('[data-testid^="report-row-"]')
        .filter({ has: page.getByText(label, { exact: true }) })
        .first()
    await expect(row, `the group row ${label}`).toBeVisible()
    await expect(row, `the group row ${label} is open`).toHaveAttribute('aria-expanded', 'true')
    const id = ((await row.getAttribute('data-testid')) ?? '').slice('report-row-'.length)
    const copy = page.getByTestId(`report-sticky-row-${id}`)
    const target = (await copy.isVisible()) ? copy : row
    await target.click()
    await expect(row).toHaveAttribute('aria-expanded', 'false')
}

// Opens the folded group row labelled `label` and waits for the toggle's new state.
async function unfoldRow(page: Page, label: string): Promise<void> {
    const row = page
        .getByTestId('report-table')
        .locator('[data-testid^="report-row-"]')
        .filter({ has: page.getByText(label, { exact: true }) })
        .first()
    await expect(row, `the group row ${label} is folded`).toHaveAttribute('aria-expanded', 'false')
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
}

test.describe('balance-sheet: report', () => {
    test('opens from the hub with its header, controls and dated columns', async ({ page }) => {
        await startBooks(page)
        await openBalanceSheet(page)
        const today = await browserToday(page)

        await expect
            .poll(async () => {
                const snapshot = await bsSnapshot(page)
                const expected = await expectedHeading(page)
                return { matches: snapshot.business === expected && expected !== '', expected }
            })
            .toMatchObject({ matches: true })
        const snapshot = await bsSnapshot(page)
        expect(snapshot.title).toBe(BALANCE_SHEET_TITLE)
        expect(snapshot.header).toBe(`As of ${dayWords(today)}`)
        expect(snapshot.headings.current).toBe(shortDay(today))
        expect(snapshot.headings.prior).toBe(shortDay(priorDay(today)))

        const chips = await page
            .getByTestId('report-controls')
            .locator('[data-testid^="report-param-"]')
            .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))
        expect(chips).toEqual(['report-param-asOf', 'report-param-rows'])
        await expect(page.getByTestId('report-param-asOf')).toContainText('Today')
        await expect(page.getByTestId('report-param-rows')).toContainText('Non-zero')

        await page.getByTestId('report-param-asOf').click()
        const popover = page.getByTestId('report-period-popover')
        await expect(popover).toBeVisible()
        // Core's preset words (core/reports/lib/params.ts PRESET_LABELS).
        const presets = [
            ['today', 'Today'],
            ['endOfLastMonth', 'End of last month'],
            ['endOfLastQuarter', 'End of last quarter'],
            ['endOfLastFiscalYear', 'End of last fiscal year'],
        ]
        for (const [preset, words] of presets) {
            const pill = popover.getByTestId(`report-period-preset-${preset}`)
            await expect(pill).toBeVisible()
            await expect(pill).toHaveText(words)
        }
        await expect(popover.getByTestId('report-period-as-of')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(popover).toHaveCount(0)

        await pressToolbar(page, 'report-customize-open', 'Customize')
        const panel = page.getByTestId('report-customize')
        await panel.getByTestId('report-customize-section-columns').click()
        const columns = panel.locator('[data-testid^="report-option-column-"]')
        await expect(columns.first()).toBeVisible()
        const columnIds = await columns.evaluateAll(elements =>
            elements.map(element => element.getAttribute('data-testid'))
        )
        expect(columnIds).toEqual([
            'report-option-column-current',
            'report-option-column-prior',
            'report-option-column-change',
            'report-option-column-pct',
        ])
        for (const label of ['Current', 'Prior year', 'Change', '% change']) {
            await expect(panel.getByText(label, { exact: true })).toBeVisible()
        }
    })

    test('places each account under its section, class and type, by its normal side', async ({
        page,
    }) => {
        const bank = accountName('BS bank')
        const card = accountName('BS card')
        await startBooks(page)
        await createAccounts(page, [
            { name: bank, kind: BANK },
            { name: card, kind: CREDIT_CARD },
        ])
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo: uniqueName('BS outline'),
            lines: [
                { account: bank, debit: '250.00' },
                { account: card, credit: '250.00' },
            ],
        })
        await openBalanceSheet(page)

        const assets = await snapshotWhen(
            page,
            s => has(s, SECTION_TITLES.asset, 'Total Bank accounts', bank),
            `the Assets section through Total Bank accounts, with ${bank}`
        )
        expect(figure(assets, bank, 'current')).toBe(25000)
        const assetChain = [SECTION_TITLES.asset, 'Current assets', 'Bank accounts', bank]
        const assetAt = assetChain.map(label => indexOf(assets, label))
        expect(assetAt).toEqual([...assetAt].sort((a, b) => a - b))
        expect(indexOf(assets, bank)).toBeLessThan(indexOf(assets, 'Total Bank accounts'))
        const assetDepths = assetChain.map(label => rowOf(assets, label).depth)
        expect(assetDepths).toEqual([0, 1, 2, 3])

        await foldRow(page, SECTION_TITLES.asset)
        const liabilities = await snapshotWhen(
            page,
            s => has(s, SECTION_TITLES.liability, 'Total Credit cards', card),
            `the Liabilities section through Total Credit cards, with ${card}`
        )
        expect(figure(liabilities, card, 'current')).toBe(25000)
        const cardChain = [SECTION_TITLES.liability, 'Current liabilities', 'Credit cards', card]
        const cardAt = cardChain.map(label => indexOf(liabilities, label))
        expect(cardAt).toEqual([...cardAt].sort((a, b) => a - b))
        expect(indexOf(liabilities, card)).toBeLessThan(indexOf(liabilities, 'Total Credit cards'))
        const cardDepths = cardChain.map(label => rowOf(liabilities, label).depth)
        expect(cardDepths).toEqual([0, 1, 2, 3])
    })

    test('balances: total assets equal total liabilities and equity', async ({ page }) => {
        await startBooks(page)
        await openBalanceSheet(page)
        await foldRow(page, SECTION_TITLES.asset)
        await foldRow(page, SECTION_TITLES.liability)
        const snapshot = await snapshotWhen(
            page,
            s =>
                has(
                    s,
                    `Total ${SECTION_TITLES.asset}`,
                    SECTION_TITLES.equity,
                    `Total ${SECTION_TITLES.equity}`,
                    TOTAL_LIABILITIES_AND_EQUITY_LABEL
                ),
            'Total Assets through Total liabilities and equity'
        )
        for (const column of ['current', 'prior']) {
            const assets = figure(snapshot, `Total ${SECTION_TITLES.asset}`, column)
            expect(assets).not.toBeNull()
            expect(figure(snapshot, TOTAL_LIABILITIES_AND_EQUITY_LABEL, column)).toBe(assets)
        }
        const equityOrder = [
            SECTION_TITLES.equity,
            RETAINED_EARNINGS_LABEL,
            NET_INCOME_LABEL,
            `Total ${SECTION_TITLES.equity}`,
        ].map(label => indexOf(snapshot, label))
        expect(equityOrder.every(at => at >= 0)).toBe(true)
        expect(equityOrder).toEqual([...equityOrder].sort((a, b) => a - b))
    })

    test('net income and retained earnings stand in equity, income accounts do not', async ({
        page,
    }) => {
        const bank = accountName('BS4 bank')
        const income = accountName('BS4 income')
        await startBooks(page)
        await createAccounts(page, [
            { name: bank, kind: BANK },
            { name: income, kind: INCOME },
        ])
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo: uniqueName('BS income'),
            lines: [
                { account: bank, debit: '80.00' },
                { account: income, credit: '80.00' },
            ],
        })
        await openBalanceSheet(page)

        // Each section is read whole in its own snapshot, then folded, so the next one
        // mounts however long other specs make the outline: together the three cover every
        // row, and no row anywhere is labelled with the income account's name.
        const assets = await snapshotWhen(
            page,
            s => has(s, SECTION_TITLES.asset, bank, `Total ${SECTION_TITLES.asset}`),
            `the Assets section through Total Assets, with ${bank}`
        )
        expect(figure(assets, bank, 'current')).toBe(8000)
        expect(assets.rows.map(row => row.label)).not.toContain(income)

        await foldRow(page, SECTION_TITLES.asset)
        const liabilities = await snapshotWhen(
            page,
            s => has(s, SECTION_TITLES.liability, `Total ${SECTION_TITLES.liability}`),
            'the Liabilities section through Total Liabilities'
        )
        expect(liabilities.rows.map(row => row.label)).not.toContain(income)

        await foldRow(page, SECTION_TITLES.liability)
        const rest = await snapshotWhen(
            page,
            s => has(s, SECTION_TITLES.equity, TOTAL_LIABILITIES_AND_EQUITY_LABEL),
            'the Equity section through Total liabilities and equity'
        )
        expect(rest.rows.map(row => row.label)).not.toContain(income)
        const equity = indexOf(rest, SECTION_TITLES.equity)
        const totalEquity = indexOf(rest, `Total ${SECTION_TITLES.equity}`)
        for (const label of [RETAINED_EARNINGS_LABEL, NET_INCOME_LABEL]) {
            expect(indexOf(rest, label)).toBeGreaterThan(equity)
            expect(indexOf(rest, label)).toBeLessThan(totalEquity)
        }

        const { year, s } = await seedDay(page)
        await chooseAsOf(page, { day: s })
        const onSeedDay = await snapshotWhen(
            page,
            snapshot => has(snapshot, RETAINED_EARNINGS_LABEL, NET_INCOME_LABEL),
            'Retained earnings and Net income as of the seed day'
        )
        expect(figure(onSeedDay, NET_INCOME_LABEL, 'current')).toBe(SEED_CENTS)
        expect(figure(onSeedDay, RETAINED_EARNINGS_LABEL, 'current')).toBe(0)

        await chooseAsOf(page, { day: `${year - 1}-${PRIOR_YEAR_SEED.day}` })
        const yearLater = await snapshotWhen(
            page,
            snapshot => has(snapshot, RETAINED_EARNINGS_LABEL, NET_INCOME_LABEL),
            'Retained earnings and Net income a year after the seed day'
        )
        expect(figure(yearLater, NET_INCOME_LABEL, 'prior')).toBe(SEED_CENTS)
        expect(figure(yearLater, RETAINED_EARNINGS_LABEL, 'prior')).toBe(0)
    })

    test('the prior-year column reads the same day a year earlier', async ({ page }) => {
        await startBooks(page)
        await openBalanceSheet(page)
        const { year, s } = await seedDay(page)

        await chooseAsOf(page, { day: `${year - 1}-${PRIOR_YEAR_SEED.day}` })
        const yearLater = await snapshotWhen(
            page,
            snapshot => has(snapshot, RECEIVABLE_LABEL, `Total ${SECTION_TITLES.asset}`),
            `${RECEIVABLE_LABEL} and Total Assets a year after the seed day`
        )
        expect(yearLater.headings.prior).toBe(shortDay(s))
        const current = figure(yearLater, RECEIVABLE_LABEL, 'current')
        expect(current).not.toBeNull()
        expect(figure(yearLater, RECEIVABLE_LABEL, 'prior')).toBe(SEED_CENTS)
        const change = figure(yearLater, RECEIVABLE_LABEL, 'change')
        expect(change).toBe((current ?? 0) - SEED_CENTS)
        expect(pctText(rowOf(yearLater, RECEIVABLE_LABEL).cells.pct)).toBe(
            expectedPct(change ?? 0, SEED_CENTS)
        )
        const totalAssets = `Total ${SECTION_TITLES.asset}`
        expect(figure(yearLater, totalAssets, 'change')).toBe(
            (figure(yearLater, totalAssets, 'current') ?? 0) -
                (figure(yearLater, totalAssets, 'prior') ?? 0)
        )

        await chooseAsOf(page, { day: s })
        const onSeedDay = await snapshotWhen(
            page,
            snapshot => has(snapshot, RECEIVABLE_LABEL),
            `${RECEIVABLE_LABEL} as of the seed day`
        )
        expect(figure(onSeedDay, RECEIVABLE_LABEL, 'current')).toBe(SEED_CENTS)
        expect(figure(onSeedDay, RECEIVABLE_LABEL, 'prior')).toBe(0)
        expect(figure(onSeedDay, RECEIVABLE_LABEL, 'change')).toBe(SEED_CENTS)
        expect(rowOf(onSeedDay, RECEIVABLE_LABEL).cells.pct ?? '').toBe('')
    })

    test('rows: Non-zero hides a zero account and an empty class, Active shows them', async ({
        page,
    }) => {
        const bank = accountName('BS6 bank')
        const other = accountName('BS6 other')
        await startBooks(page)
        await createAccounts(page, [
            { name: bank, kind: BANK },
            { name: other, kind: OTHER_ASSET },
        ])
        await openEntriesFromSidebar(page)
        const today = await browserToday(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('BS6 deposit'),
            lines: [
                { account: other, debit: '40.00' },
                { account: bank, credit: '40.00' },
            ],
        })
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('BS6 refund'),
            lines: [
                { account: bank, debit: '40.00' },
                { account: other, credit: '40.00' },
            ],
        })
        await openBalanceSheet(page)

        const nonzero = await snapshotWhen(
            page,
            s => has(s, SECTION_TITLES.asset, `Total ${SECTION_TITLES.asset}`),
            'the Assets section through Total Assets'
        )
        const labels = nonzero.rows.map(row => row.label)
        expect(labels).not.toContain(bank)
        expect(labels).not.toContain(other)
        expect(labels).not.toContain('Other assets')

        await chooseRows(page, 'active')
        await foldRow(page, 'Current assets')
        await foldRow(page, 'Fixed assets')
        const active = await snapshotWhen(
            page,
            s => has(s, 'Other assets', other, 'Total Other assets'),
            `Other assets through Total Other assets, with ${other}`
        )
        expect(figure(active, other, 'current')).toBe(0)
        expect(indexOf(active, 'Other assets')).toBeLessThan(indexOf(active, other))
        expect(indexOf(active, other)).toBeLessThan(indexOf(active, 'Total Other assets'))

        const { year } = await seedDay(page)
        const beforeSeed = `${year - PRIOR_YEAR_SEED.yearsAgo}-08-14`
        await chooseAsOf(page, { day: beforeSeed })
        const sections = Object.values(SECTION_TITLES)
        const empty = await snapshotWhen(
            page,
            s =>
                has(
                    s,
                    ...sections,
                    ...sections.map(title => `Total ${title}`),
                    RETAINED_EARNINGS_LABEL,
                    NET_INCOME_LABEL,
                    TOTAL_LIABILITIES_AND_EQUITY_LABEL
                ),
            'every section, its total and the equity rows on a day with no posted line'
        )
        for (const label of [
            ...sections.map(title => `Total ${title}`),
            RETAINED_EARNINGS_LABEL,
            NET_INCOME_LABEL,
            TOTAL_LIABILITIES_AND_EQUITY_LABEL,
        ]) {
            expect(figure(empty, label, 'current'), label).toBe(0)
        }
    })

    test('pressing an account opens its posted lines, labelled, in posting order', async ({
        page,
    }) => {
        const bank = accountName('BS7 bank')
        const card = accountName('BS7 card')
        const lineMemo = uniqueName('BS7 line memo')
        const entryMemo = uniqueName('BS7 entry memo')
        await startBooks(page)
        await createAccounts(page, [
            { name: bank, kind: BANK },
            { name: card, kind: CREDIT_CARD },
        ])
        await openEntriesFromSidebar(page)
        const today = await browserToday(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('BS7 entry with a line memo'),
            lines: [
                { account: bank, debit: '30.00', memo: lineMemo },
                { account: card, credit: '30.00' },
            ],
        })
        const first = await postedEntryNumber(page)
        // B's line has no memo of its own, so its label reads the entry's.
        await postEntryOn(page, {
            date: today,
            memo: entryMemo,
            lines: [
                { account: bank, debit: '12.50' },
                { account: card, credit: '12.50' },
            ],
        })
        const second = await postedEntryNumber(page)
        await openBalanceSheet(page)

        const closed = await snapshotWhen(
            page,
            s => has(s, bank, 'Total Bank accounts'),
            `${bank} through Total Bank accounts`
        )
        expect(bsLinesUnder(closed, bank)).toEqual([])

        await openBalanceSheetAccount(page, bank)
        const opened = await snapshotWhen(
            page,
            s => bsLinesUnder(s, bank).length === 2,
            `${bank} opened onto its two lines`
        )
        const lines = bsLinesUnder(opened, bank).map(row => ({
            label: row.label,
            current: cents(row.cells.current),
            prior: cents(row.cells.prior),
            change: row.cells.change ?? '',
            pct: row.cells.pct ?? '',
        }))
        expect(lines).toEqual([
            {
                label: `${today} · ${first} · ${lineMemo}`,
                current: 3000,
                prior: 0,
                change: '',
                pct: '',
            },
            {
                label: `${today} · ${second} · ${entryMemo}`,
                current: 1250,
                prior: 0,
                change: '',
                pct: '',
            },
        ])

        // Retained earnings is a computed row: no fold chevron, and a press opens nothing.
        // The next run (Liabilities opened again) carries whatever the press changed.
        await foldRow(page, SECTION_TITLES.asset)
        await foldRow(page, SECTION_TITLES.liability)
        const retained = page
            .getByTestId('report-table')
            .locator('[data-testid^="report-row-c:retainedEarnings"]')
        await expect(retained).toBeVisible()
        await expect(retained).not.toHaveAttribute('aria-expanded')
        await expect(retained).not.toHaveAttribute('role', 'button')
        await retained.click()
        await unfoldRow(page, SECTION_TITLES.liability)
        const after = await snapshotWhen(
            page,
            s => has(s, 'Current liabilities', RETAINED_EARNINGS_LABEL, NET_INCOME_LABEL),
            'Liabilities open again, through Retained earnings and Net income'
        )
        expect(bsLinesUnder(after, RETAINED_EARNINGS_LABEL)).toEqual([])
        const next = after.rows[indexOf(after, RETAINED_EARNINGS_LABEL) + 1]
        expect(next?.label).toBe(NET_INCOME_LABEL)
    })

    test('a post made on another page appears in the open report without a reload', async ({
        page,
        browser,
    }) => {
        const credited = accountName('BS8 credited')
        const debited = accountName('BS8 debited')
        await startBooks(page)
        await openBalanceSheet(page)
        await snapshotWhen(
            page,
            s => has(s, SECTION_TITLES.asset, 'Bank accounts'),
            'the open report with its Bank accounts'
        )
        await page.evaluate(() => {
            ;(window as unknown as { bsNotReloaded?: boolean }).bsNotReloaded = true
        })

        // Page B is a second browser context signed in as the same user: its own session
        // and its own realtime connection, so the post reaches page A through the server.
        const otherContext = await browser.newContext()
        try {
            const other = await otherContext.newPage()
            await startBooks(other)
            await createAccounts(other, [
                { name: credited, kind: BANK },
                { name: debited, kind: BANK },
            ])
            await openEntriesFromSidebar(other)
            await postEntryOn(other, {
                date: await browserToday(other),
                memo: uniqueName('BS8 live post'),
                lines: [
                    { account: debited, debit: '60.00' },
                    { account: credited, credit: '60.00' },
                ],
            })

            // Only a run after the post has a row for the new account.
            const live = await snapshotWhen(
                page,
                s => has(s, debited, credited),
                `${debited} and ${credited} in the open report`
            )
            expect(figure(live, debited, 'current')).toBe(6000)
            expect(figure(live, credited, 'current')).toBe(-6000)
            const notReloaded = await page.evaluate(
                () => (window as unknown as { bsNotReloaded?: boolean }).bsNotReloaded
            )
            expect(notReloaded).toBe(true)
        } finally {
            await otherContext.close()
        }
    })
})
