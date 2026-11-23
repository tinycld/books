import fs from 'node:fs'
import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test'
import {
    authStorageKey,
    cellOf,
    chooseParamOption,
    downloadReport,
    hubRow,
    inStatement,
    navigateToPackage,
    type ReportExportFormat,
    rowOf,
} from '@tinycld/core/e2e-helpers'
import { bucketWords, rangeWords } from '@tinycld/core/reports/lib/dates'
import {
    PROFIT_AND_LOSS_BY_MONTH_TITLE,
    PROFIT_AND_LOSS_TITLE,
} from '~/tinycld/books/lib/profit-and-loss-fixture'
import { TRANSACTION_DETAIL_TITLE } from '~/tinycld/books/lib/report-drill-down-fixture'
import {
    SALES_TAX_LIABILITY_FROM,
    SALES_TAX_LIABILITY_TITLE,
    SALES_TAX_LIABILITY_TO,
} from '~/tinycld/books/lib/sales-tax-liability-fixture'
import { isPhone, swipeFromLeftEdge } from './account-register-helpers'
import { fillLine, type LineInput, openNewEntry, postOpenEntry } from './journal-entries-helpers'

// Books' reports run in core's report view: on the Books route (/a/books/reports/<id>) when
// a Books link or the Books sidebar opens one, on core's route (/a/reports/<id>) when the
// Reports hub does. These helpers drive the view through core's test ids
// (core/reports/components) and read it in one snapshot.

export type AsOfPreset = 'today' | 'endOfLastMonth' | 'endOfLastQuarter' | 'endOfLastFiscalYear'

export type TbSnapshot = {
    rows: {
        id: string
        kind: 'group' | 'opening' | 'detail'
        label: string
        number: string
        debit: string
        credit: string
    }[]
    total: { label: string; debit: string; credit: string }
}

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

// A YYYY-MM-DD day in the words core's document header writes (core/reports/lib/dates.ts dayWords).
export function dayWords(day: string): string {
    return `${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`
}

// The browser's today as YYYY-MM-DD: the Today preset and a new entry's date both use it.
export function browserToday(page: Page): Promise<string> {
    return page.evaluate(() => {
        const now = new Date()
        const pad = (value: number) => String(value).padStart(2, '0')
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    })
}

// The entries list from the Books sidebar: the chart has no way to it, and postEntryOn /
// openNewEntry expect the list, an entry, the dashboard or the Lists hub on screen.
export async function openEntriesFromSidebar(page: Page): Promise<void> {
    const item = page.getByTestId('books-nav-entries')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    await expect(toggle).toBeVisible()
    if (!(await item.isVisible())) await toggle.click()
    await item.click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

// Polls `take` (one report snapshot, e.g. glSnapshot) until `isReady` holds and returns
// that snapshot, so every later assertion reads the same single snapshot.
export async function snapshotWhen<T>(
    page: Page,
    take: (page: Page) => Promise<T>,
    isReady: (snapshot: T) => boolean,
    message: string
): Promise<T> {
    const last: { snapshot: T | undefined } = { snapshot: undefined }
    await expect
        .poll(
            async () => {
                last.snapshot = await take(page)
                return isReady(last.snapshot)
            },
            { message }
        )
        .toBe(true)
    if (last.snapshot === undefined) throw new Error(message)
    return last.snapshot
}

// The heading core's document header prints (useReportView headingOf): the Books business
// name, else the organization's name. Read-only: books-settings.spec.ts types over the
// business name and restores it on the shared DB, so it is read when compared. Both reads
// go through the page's own fetch (same origin, the browser's warm connection): a fresh
// Node-side request context can spend seconds on its first name lookup of localhost,
// which would eat the budget of a poll that calls this.
export async function expectedHeading(page: Page): Promise<string> {
    const key = await authStorageKey(page)
    const read = await page.evaluate(async k => {
        const token =
            (JSON.parse(localStorage.getItem(k) ?? '{}') as { token?: string }).token ?? ''
        const settings = await fetch('/api/collections/books_settings/records/bookssettings01', {
            headers: { Authorization: token },
        })
        const businessName = settings.ok
            ? ((await settings.json()) as { business_name?: string }).business_name
            : undefined
        if (!settings.ok || businessName?.trim()) {
            return { settingsOk: settings.ok, orgOk: true, heading: businessName?.trim() ?? '' }
        }
        const org = await fetch('/api/org-info')
        const name = org.ok ? ((await org.json()) as { name?: string }).name : undefined
        return { settingsOk: true, orgOk: org.ok, heading: (name ?? '').trim() }
    }, key)
    expect(read.settingsOk).toBe(true)
    expect(read.orgOk).toBe(true)
    return read.heading
}

// Below core's mobile breakpoint (useBreakpoint) the Books sidebar lives in the drawer.
const MOBILE_MAX_WIDTH = 767

// The drawer swipe lives with the other Books navigation helpers; re-exported so its
// importers here keep their path.
export { swipeFromLeftEdge }

export async function openBooksMenu(page: Page): Promise<void> {
    // ActivePkgSync closes the drawer on every route change, so the swipe waits for
    // the Books index redirect to settle and for the drawer's mount.
    await expect(page).toHaveURL(/\/a\/books\/\w/)
    const panel = page.getByTestId('mobile-drawer-panel')
    await panel.waitFor({ state: 'attached' })
    await swipeFromLeftEdge(page)
    await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
}

const OPEN_FOLD_TIMEOUT_MS = 5000

// Opens the Reports section of the Books sidebar and leaves it open. The sidebar must be on
// screen (on a phone: the Books menu, the drawer). The fold state is kept across screens
// and reloads (books-ui-store persists it through AsyncStorage, which hydrates a tick after
// the first render), so the label can flip from Expand to Collapse after it is read. The
// press and the check on its result run as one retried block: a press that landed on a fold
// that hydration had just opened closes it, the label reads Expand again, and the next pass
// opens it. The retries stop at the default expect timeout (5s), so a stuck fold fails with
// its own message and not at the test timeout.
export async function openReportsSection(page: Page): Promise<void> {
    const toggle = page.getByTestId('books-sidebar-reports-toggle').filter({ visible: true })
    await expect(toggle).toHaveAttribute('aria-label', /^(Expand|Collapse) Reports$/)
    await expect(async () => {
        if ((await toggle.getAttribute('aria-label')) === 'Expand Reports') await toggle.click()
        await expect(toggle).toHaveAttribute('aria-label', 'Collapse Reports')
    }).toPass({ timeout: OPEN_FOLD_TIMEOUT_MS })
}

// Core's Reports hub filtered to Books, reached the way a user does: All reports in the
// Reports section of the Books sidebar (on a phone, in the Books menu, the drawer). Open
// Books at the desktop viewport first when the page is a phone: navigateToPackage clicks
// the desktop rail.
export async function openBooksReports(page: Page): Promise<void> {
    await navigateToPackage(page, 'books')
    const width = page.viewportSize()?.width ?? Number.POSITIVE_INFINITY
    if (width <= MOBILE_MAX_WIDTH) await openBooksMenu(page)
    await openReportsSection(page)
    await page.getByTestId('books-sidebar-reports-all').filter({ visible: true }).click()
    await expect(page).toHaveURL(/\/a\/reports\?package=books/)
    await page.getByTestId('reports-hub').waitFor()
}

// The e2e user is not the first admin, who owns the shipped reports (core shipped.go
// firstAdmin), so the Trial Balance reaches it through the viewer share Books keeps. The
// Books hub has no tabs: it lists every Books report the reader can open (D2).
export async function openTrialBalance(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, 'Trial Balance').click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// The last day of the month before `day`'s: core's endOfLastMonth (server/reports/params.go
// asOfDay), which reads only the reader's day.
export function endOfLastMonth(day: string): string {
    const lastDay = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 0))
    return lastDay.toISOString().slice(0, 10)
}

type RunAnswer = { params?: { id: string; value?: unknown }[] }

// The day a run of the Trial Balance resolved As of to, from core's run answer.
function resolvedAsOf(answer: RunAnswer): string {
    const value = answer.params?.find(param => param.id === 'asOf')?.value
    if (typeof value !== 'string') throw new Error(`the run answered no As of day: ${value}`)
    return value
}

// The end of the last fiscal quarter or year depends on the Books fiscal start month,
// which books-settings.spec.ts changes on the shared DB for a few seconds, so the day is
// read from the answer of the run that the preset starts, never computed here.
function presetRunAnswer(page: Page, preset: AsOfPreset): Promise<RunAnswer> {
    return page
        .waitForResponse(response => {
            if (!response.url().includes('/api/reports/run') || !response.ok()) return false
            const body = response.request().postDataJSON() as {
                params?: { asOf?: { preset?: string } }
            } | null
            return body?.params?.asOf?.preset === preset
        })
        .then(response => response.json() as Promise<RunAnswer>)
}

// Sets As of and waits until the document period names the new day. The period is
// written from the day the server resolved, so it shows that day only once the run for
// the new As of has landed; the day is known before the change for Today, End of last
// month and a typed day, and read from the new run's answer for the fiscal presets.
export async function chooseAsOf(
    page: Page,
    choice: { preset: AsOfPreset } | { day: string }
): Promise<void> {
    await page.getByTestId('report-param-asOf').click()
    const popover = page.getByTestId('report-period-popover')
    await expect(popover).toBeVisible()
    const today = await browserToday(page)
    let day: Promise<string>
    if ('preset' in choice) {
        const { preset } = choice
        if (preset === 'today') day = Promise.resolve(today)
        else if (preset === 'endOfLastMonth') day = Promise.resolve(endOfLastMonth(today))
        else day = presetRunAnswer(page, preset).then(resolvedAsOf)
        await page.getByTestId(`report-period-preset-${preset}`).click()
    } else {
        day = Promise.resolve(choice.day)
        // A typed day applies on change and keeps the popover open (ParamPeriodControl onDate).
        await page.getByTestId('report-period-as-of').fill(choice.day)
        await page.keyboard.press('Escape')
    }
    await expect(popover).toHaveCount(0)
    await expect(page.getByTestId('report-document-period')).toHaveText(
        `As of ${dayWords(await day)}`
    )
}

const FILTER_OPTION_PREFIX = 'report-filter-option-'

// A chip names at most two choices (core NAMED_CHOICES); more read as a count.
const CHIP_NAMED_CHOICES = 2

// The accounts a run asked for, sorted: the ids of `params.accounts` in its body.
function runAccountIds(response: Response): string[] | null {
    const body = response.request().postDataJSON() as { params?: { accounts?: unknown } } | null
    const accounts = body?.params?.accounts
    if (!Array.isArray(accounts) || !accounts.every(id => typeof id === 'string')) return null
    return [...accounts].sort()
}

// Narrows the report to the accounts named (full names), picked one by one through the
// Accounts picker under Add filter (opened here unless the test already opened it): a
// search per name, its option checked, then Apply. Returns the picked account ids, read
// from each option's test id (core ParamPickerParts `report-filter-option-<id>`).
// It waits for a run response that asks for exactly the picked ids (the key change
// refetches even a cached body, as the run's staleTime is 0), then for "Updating…" to
// go, then for the chip to name the picks (when it names them, at most two).
// For a body new to the page, that means the filtered rows are on screen: core keeps
// the previous run's rows (keepPreviousData) and shows "Updating…" until the new run
// lands. For a body already run on the page, it does not: React Query draws the cached
// rows at once with no "Updating…", and the response event comes when the headers
// arrive, before the refetch commits. So the helper can return while the cached figures
// are still on screen; a caller that needs the new figures waits for them itself.
export async function filterToAccounts(page: Page, names: readonly string[]): Promise<string[]> {
    const entry = page.getByTestId('report-add-filter-accounts')
    if (!(await entry.isVisible())) await page.getByTestId('report-add-filter').click()
    await entry.click()
    const picker = page.getByTestId('report-filter-picker')
    await expect(picker).toBeVisible()
    const ids: string[] = []
    for (const name of names) {
        await picker.getByTestId('report-filter-search').fill(name)
        const option = picker.getByRole('checkbox', { name, exact: true })
        const testId = (await option.getAttribute('data-testid')) ?? ''
        if (!testId.startsWith(FILTER_OPTION_PREFIX)) {
            throw new Error(`the option ${name} has no account id: ${testId}`)
        }
        ids.push(testId.slice(FILTER_OPTION_PREFIX.length))
        await option.click()
    }
    const picked = JSON.stringify([...ids].sort())
    const runs: string[] = []
    const watch = (response: Response) => {
        if (!response.url().includes('/api/reports/run') || !response.ok()) return
        const runIds = runAccountIds(response)
        if (runIds) runs.push(JSON.stringify(runIds))
    }
    page.on('response', watch)
    try {
        await picker.getByTestId('report-filter-apply').click()
        await expect(picker).toBeHidden()
        await expect
            .poll(() => runs.includes(picked), {
                message: `a run with the accounts ${picked} landed`,
            })
            .toBe(true)
    } finally {
        page.off('response', watch)
    }
    await expect(page.getByTestId('report-updating')).toHaveCount(0)
    const chip = page.getByTestId('report-param-accounts')
    await expect(chip).toBeVisible()
    const chipNamesPicks = names.length <= CHIP_NAMED_CHOICES
    if (chipNamesPicks) for (const name of names) await expect(chip).toContainText(name)
    return ids
}

// Every mounted row of the report table, top to bottom, with its No., Debit and Credit
// cells, and the Total row, read in ONE pass so no re-render lands between two reads. The
// row kind comes from core's row id: g: an account, opening: its balance before the as-of
// month, d: a line. The table is a FlashList: only mounted rows are read, and a Total row
// that is not mounted reads as an empty label (a test asserts `total.label` first, as its
// precondition).
export function tbSnapshot(page: Page): Promise<TbSnapshot> {
    return page.evaluate(() => {
        const table = document.querySelector('[data-testid="report-table"]')
        const cells = new Map<string, string>()
        for (const cell of table?.querySelectorAll('[data-testid^="report-cell-"]') ?? []) {
            cells.set(
                cell.getAttribute('data-testid') ?? '',
                (cell as HTMLElement).innerText.trim()
            )
        }
        const cellText = (column: string, id: string) =>
            cells.get(`report-cell-${column}-${id}`) ?? ''
        const labels = [...(table?.querySelectorAll('[data-testid^="report-row-"]') ?? [])]
            .map(element => ({
                id: (element.getAttribute('data-testid') ?? '').slice('report-row-'.length),
                label: (element as HTMLElement).innerText.trim(),
                top: element.getBoundingClientRect().top,
            }))
            .sort((a, b) => a.top - b.top)
        const kindOf = (id: string): TbSnapshot['rows'][number]['kind'] | null => {
            if (id.startsWith('g:')) return 'group'
            if (id.startsWith('opening:')) return 'opening'
            if (id.startsWith('d:')) return 'detail'
            return null
        }
        const rows: TbSnapshot['rows'] = []
        let total = { label: '', debit: '', credit: '' }
        for (const { id, label } of labels) {
            if (id.startsWith('total')) {
                total = { label, debit: cellText('debit', id), credit: cellText('credit', id) }
                continue
            }
            const kind = kindOf(id)
            if (!kind) continue
            rows.push({
                id,
                kind,
                label,
                number: cellText('number', id),
                debit: cellText('debit', id),
                credit: cellText('credit', id),
            })
        }
        return { rows, total }
    })
}

// The rows that follow the account row labelled `label` until the next account row: its
// opening row, then its lines.
function rowsUnder(snapshot: TbSnapshot, label: string): TbSnapshot['rows'] {
    const start = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
    if (start < 0) return []
    const after = snapshot.rows.slice(start + 1)
    const end = after.findIndex(row => row.kind === 'group')
    return end < 0 ? after : after.slice(0, end)
}

// The posted lines under the account row labelled `label`, without its opening row.
export function detailsUnder(snapshot: TbSnapshot, label: string): TbSnapshot['rows'] {
    return rowsUnder(snapshot, label).filter(row => row.kind === 'detail')
}

// The opening row ("Balance before <month>") under the account row labelled `label`.
export function openingUnder(
    snapshot: TbSnapshot,
    label: string
): TbSnapshot['rows'][number] | undefined {
    return rowsUnder(snapshot, label).find(row => row.kind === 'opening')
}

// The opening row's label for an as-of day (YYYY-MM-DD): the month in the words core's
// report view writes for a month label.
export function balanceBeforeLabel(day: string): string {
    return `Balance before ${bucketWords('month', day.slice(0, 7))}`
}

// Opens an account row and waits until its opening row shows beneath it. Every opened
// account has one, also an account with no line in the as-of month; a test that reads the
// lines waits for them itself.
export async function openAccountRow(page: Page, label: string): Promise<void> {
    await rowOf(page, label).click()
    await expect
        .poll(async () => openingUnder(await tbSnapshot(page), label) !== undefined, {
            message: `the opening row under ${label}`,
        })
        .toBe(true)
}

// The General Ledger's two days: after 2026-07-01, so no close date or fiscal start month
// that books-settings.spec.ts sets on the shared DB refuses a post or moves a fiscal year
// between them, and in one month for the custom periods.
export const GL_DAY_1 = '2026-08-04'
export const GL_DAY_2 = '2026-08-18'

export type GlSnapshot = {
    // The period the document header prints (report-document-period).
    header: string
    rows: {
        id: string
        kind: 'group' | 'opening' | 'detail' | 'subtotal' | 'total'
        label: string
        // Each cell's text by column id (type, number, name, description, split, debit,
        // credit, balance).
        cells: Record<string, string>
    }[]
}

// The shipped General Ledger from the Books hub, reached as openTrialBalance reaches the
// Trial Balance: through the viewer share Books keeps, with no tab press.
export async function openGeneralLedger(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, 'General Ledger').click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// The shipped Journal from the Books hub, reached as openGeneralLedger reaches the General
// Ledger. core's hubRow matches any row whose text holds the title (case-blind), so the row
// is narrowed to the one whose title reads "Journal" exactly.
export async function openJournal(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, 'Journal')
        .filter({ has: page.getByText('Journal', { exact: true }) })
        .click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// Voids the posted entry open in its read view: Void from its actions (the bar on desktop,
// the More menu on a phone), confirmed in `void-dialog`. The Void badge shows at once
// (optimistic); the link to the void reversal comes only with the server's answer, so the
// helper waits for both.
export async function voidPostedEntry(page: Page): Promise<void> {
    await expect(page.getByTestId('entry-badge')).toHaveText('Posted')
    if (isPhone(page)) {
        await page.getByTestId('entry-more').click()
        await page.getByRole('menuitem', { name: 'Void', exact: true }).click()
    } else {
        await page
            .getByTestId('entry-actions')
            .getByRole('button', { name: 'Void', exact: true })
            .click()
    }
    const dialog = page.getByTestId('void-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('void-confirm').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('entry-badge')).toHaveText('Void')
    await expect(page.getByTestId('entry-link-reversed-by')).toBeVisible()
}

// Sets the Period: a preset applies at once and closes the popover; Custom days apply as
// they are typed (the URL holds them) and Escape closes the popover. Core pre-fills the
// Custom days from the current run's resolved period, so when they already hold the days
// asked for, the shown run is over those days: filling them fires no change and the URL
// never gets them, so only Escape is pressed.
export async function choosePeriod(
    page: Page,
    choice: { preset: 'thisMonthToDate' | 'allDates' } | { from: string; to: string }
): Promise<void> {
    await page.getByTestId('report-param-period').click()
    const popover = page.getByTestId('report-period-popover')
    await expect(popover).toBeVisible()
    if ('preset' in choice) {
        await page.getByTestId(`report-period-preset-${choice.preset}`).click()
    } else {
        await page.getByTestId('report-period-preset-custom').click()
        const fromInput = page.getByTestId('report-period-from')
        const toInput = page.getByTestId('report-period-to')
        await expect(fromInput).toBeVisible()
        const isShown =
            (await fromInput.inputValue()) === choice.from &&
            (await toInput.inputValue()) === choice.to
        if (!isShown) {
            await fromInput.fill(choice.from)
            await toInput.fill(choice.to)
            await expect(page.getByTestId('report-period-error')).toHaveCount(0)
            await expect
                .poll(() => new URL(page.url()).searchParams.get('p-period'))
                .toBe(`${choice.from}..${choice.to}`)
        }
        await page.keyboard.press('Escape')
    }
    await expect(popover).toHaveCount(0)
}

// Every mounted row of the report table, top to bottom, with every cell, and the document
// period, read in ONE pass so no re-render lands between two reads. The row kind comes from
// core's row id: g: a section, opening: its beginning balance, d: a line, s: its total.
export function glSnapshot(page: Page): Promise<GlSnapshot> {
    return page.evaluate(() => {
        const table = document.querySelector('[data-testid="report-table"]')
        const period = document.querySelector('[data-testid="report-document-period"]')
        const cells = new Map<string, Record<string, string>>()
        for (const cell of table?.querySelectorAll('[data-testid^="report-cell-"]') ?? []) {
            const rest = (cell.getAttribute('data-testid') ?? '').slice('report-cell-'.length)
            const dash = rest.indexOf('-')
            const column = rest.slice(0, dash)
            const id = rest.slice(dash + 1)
            const row = cells.get(id) ?? {}
            row[column] = (cell as HTMLElement).innerText.trim()
            cells.set(id, row)
        }
        const kindOf = (id: string): GlSnapshot['rows'][number]['kind'] | null => {
            if (id.startsWith('g:')) return 'group'
            if (id.startsWith('opening:')) return 'opening'
            if (id.startsWith('d:')) return 'detail'
            if (id.startsWith('s:')) return 'subtotal'
            if (id.startsWith('total')) return 'total'
            return null
        }
        const rows: GlSnapshot['rows'] = []
        const labels = [...(table?.querySelectorAll('[data-testid^="report-row-"]') ?? [])]
            .map(element => ({
                id: (element.getAttribute('data-testid') ?? '').slice('report-row-'.length),
                label: (element as HTMLElement).innerText.trim(),
                top: element.getBoundingClientRect().top,
            }))
            .sort((a, b) => a.top - b.top)
        for (const { id, label } of labels) {
            const kind = kindOf(id)
            if (kind) rows.push({ id, kind, label, cells: cells.get(id) ?? {} })
        }
        return { header: (period as HTMLElement | null)?.innerText.trim() ?? '', rows }
    })
}

// A read of a layout report (the Balance Sheet, the Profit and Loss and its by-month form).
export type ReportSnapshot = {
    // The document header's first line: the Books business name.
    business: string
    title: string
    // The period the document header prints (report-document-period).
    header: string
    // Each column heading's text by column id (report-heading-<col>).
    headings: Record<string, string>
    rows: {
        id: string
        kind: 'group' | 'opening' | 'detail' | 'subtotal' | 'computed' | 'total'
        // The outline level core indents the label to: 16 + depth × 16 px (ReportRow labelStyle).
        depth: number
        label: string
        // Each cell's text by column id.
        cells: Record<string, string>
    }[]
}

// The shipped Balance Sheet from the Books hub, reached as openTrialBalance reaches the
// Trial Balance: through the viewer share Books keeps. A layout report has no empty state,
// so the table always shows.
export async function openBalanceSheet(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, 'Balance Sheet').click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page.getByTestId('report-table')).toBeVisible()
}

// `all` is the Trial Balance's own choice (server/report_trial_balance.go): every account,
// with or without a balance.
const ROWS_LABELS = { nonzero: 'Non-zero', active: 'Active', all: 'All' } as const

// Sets Rows through its chip and waits until the URL holds the new value and the run
// for it has landed: core keeps the previous run's rows on screen until the new run
// lands. The run is awaited by its request body, so the choice must be one the page has
// not run with these params before (React Query answers a body it has cached with no
// request).
export async function chooseRows(page: Page, choice: keyof typeof ROWS_LABELS): Promise<void> {
    const landed = page.waitForResponse(response => {
        if (!response.url().includes('/api/reports/run') || !response.ok()) return false
        const body = response.request().postDataJSON() as { params?: { rows?: string } } | null
        return (body?.params?.rows ?? 'nonzero') === choice
    })
    await chooseParamOption(page, 'rows', { from: 'chip', labels: [ROWS_LABELS[choice]] })
    await expect
        .poll(() => new URL(page.url()).searchParams.get('p-rows') ?? 'nonzero')
        .toBe(choice)
    await landed
    await expect(page.getByTestId('report-param-rows')).toContainText(ROWS_LABELS[choice])
}

// The document header, every column heading and every mounted row of the report table, top
// to bottom, with every cell, read in ONE pass so no re-render lands between two reads. The
// row kind comes from core's row id: g: a group or an account, opening: an opened account's
// balance before the as-of month, d: a line, s: a group's total, c: a computed row, total:
// the Total.
export function reportSnapshot(page: Page): Promise<ReportSnapshot> {
    return page.evaluate(() => {
        const textOf = (element: Element | null | undefined) =>
            (element as HTMLElement | null | undefined)?.innerText.trim() ?? ''
        // Core draws headings with CSS `uppercase`, and innerText applies it; the
        // heading's value is the words before that transform.
        const untransformedText = (element: Element) =>
            (element.textContent ?? '').replace(/\s+/g, ' ').trim()
        const header = document.querySelector('[data-testid="report-document-header"]')
        const business =
            textOf(header)
                .split('\n')
                .map(line => line.trim())
                .find(line => line !== '') ?? ''
        const headings: Record<string, string> = {}
        for (const heading of document.querySelectorAll('[data-testid^="report-heading-"]')) {
            const id = (heading.getAttribute('data-testid') ?? '').slice('report-heading-'.length)
            if (id === 'row') continue
            headings[id] = untransformedText(heading)
        }
        const table = document.querySelector('[data-testid="report-table"]')
        const cells = new Map<string, Record<string, string>>()
        for (const cell of table?.querySelectorAll('[data-testid^="report-cell-"]') ?? []) {
            const rest = (cell.getAttribute('data-testid') ?? '').slice('report-cell-'.length)
            const dash = rest.indexOf('-')
            const row = cells.get(rest.slice(dash + 1)) ?? {}
            row[rest.slice(0, dash)] = textOf(cell)
            cells.set(rest.slice(dash + 1), row)
        }
        const kindOf = (id: string): ReportSnapshot['rows'][number]['kind'] | null => {
            if (id.startsWith('g:')) return 'group'
            if (id.startsWith('opening:')) return 'opening'
            if (id.startsWith('d:')) return 'detail'
            if (id.startsWith('s:')) return 'subtotal'
            if (id.startsWith('c:')) return 'computed'
            if (id.startsWith('total')) return 'total'
            return null
        }
        const rows: ReportSnapshot['rows'] = []
        const labels = [...(table?.querySelectorAll('[data-testid^="report-row-"]') ?? [])]
            .map(element => ({
                id: (element.getAttribute('data-testid') ?? '').slice('report-row-'.length),
                label: textOf(element),
                padding: Number.parseFloat(getComputedStyle(element).paddingLeft),
                top: element.getBoundingClientRect().top,
            }))
            .sort((a, b) => a.top - b.top)
        for (const { id, label, padding } of labels) {
            const kind = kindOf(id)
            if (!kind) continue
            const depth = Math.round((padding - 16) / 16)
            rows.push({ id, kind, depth, label, cells: cells.get(id) ?? {} })
        }
        return {
            business,
            title: textOf(document.querySelector('[data-testid="report-document-title"]')),
            header: textOf(document.querySelector('[data-testid="report-document-period"]')),
            headings,
            rows,
        }
    })
}

// A row that shows only under an opened row: a line, or the opening row above the lines.
function isOpenedRow(row: ReportSnapshot['rows'][number]): boolean {
    return row.kind === 'detail' || row.kind === 'opening'
}

// The rows an opened row labelled `label` shows beneath it, until the next row that is not
// one of them: its opening row, when the report has one, then its lines.
function reportRowsUnder(snapshot: ReportSnapshot, label: string): ReportSnapshot['rows'] {
    const start = snapshot.rows.findIndex(row => !isOpenedRow(row) && row.label === label)
    if (start < 0) return []
    const after = snapshot.rows.slice(start + 1)
    const end = after.findIndex(row => !isOpenedRow(row))
    return end < 0 ? after : after.slice(0, end)
}

// The opened lines under the row labelled `label`, without its opening row. Empty when the
// row is not mounted or not open.
export function reportLinesUnder(snapshot: ReportSnapshot, label: string): ReportSnapshot['rows'] {
    return reportRowsUnder(snapshot, label).filter(row => row.kind === 'detail')
}

// The opening row ("Balance before <month>", see balanceBeforeLabel) under the row labelled
// `label`. Undefined when the row is not mounted, not open, or its report has no opening row.
export function reportOpeningUnder(
    snapshot: ReportSnapshot,
    label: string
): ReportSnapshot['rows'][number] | undefined {
    return reportRowsUnder(snapshot, label).find(row => row.kind === 'opening')
}

// The table mounts only the rows near its scroll position (a FlashList), and a section
// grows with every account that earlier runs and other specs post to today. An account
// whose name sorts below theirs is then not mounted when its section opens. Books' reports
// sort accounts by number, then name (server/report_profit_and_loss.go plRecordSort,
// report_balance_sheet.go), so an unnumbered account named from this key sorts above every
// account made before it: "AA 0" comes before the other specs' "AA <letter>" names, and
// the countdown makes a later run's name sort before an earlier run's.
export function sectionTopKey(): string {
    return `AA 0${String(9_999_999_999_999 - Date.now()).padStart(13, '0')}`
}

// True when the account row labelled `label` lies inside the open group `group`: below the
// group's row, with only the group's own rows (indented under it) between them. The group's
// total and the next group are not indented under it, so the account is above the total.
export function isInGroup(snapshot: ReportSnapshot, group: string, label: string): boolean {
    const at = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
    const titleAt = snapshot.rows
        .slice(0, Math.max(at, 0))
        .map(row => row.kind === 'group' && row.label === group)
        .lastIndexOf(true)
    if (at < 0 || titleAt < 0) return false
    const titleDepth = snapshot.rows[titleAt].depth
    return snapshot.rows
        .slice(titleAt + 1, at + 1)
        .every(row => (row.kind === 'group' || isOpenedRow(row)) && row.depth > titleDepth)
}

// Scrolls the report list, its own scroller (the rows' nearest overflow-y: auto ancestor):
// to its top, to its end, or so the mounted row `rowId` stands at the list's top edge.
function scrollReportList(page: Page, to: { at: 'top' | 'end' } | { rowId: string }) {
    return page
        .getByTestId('report-table')
        .locator('[data-testid^="report-row-"]')
        .first()
        .evaluate((first, target) => {
            let list = first.parentElement
            while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement
            if (!list) throw new Error('the report rows have no vertical scroller')
            if ('at' in target) {
                list.scrollTop = target.at === 'top' ? 0 : list.scrollHeight
                return
            }
            // A row id holds quotes and brackets, so the row is matched by its test id's
            // value, not through a selector.
            const testId = `report-row-${target.rowId}`
            const row = [...list.querySelectorAll('[data-testid^="report-row-"]')].find(
                element => element.getAttribute('data-testid') === testId
            )
            if (!row) throw new Error(`the row ${target.rowId} is not mounted`)
            list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top
        }, to)
}

// Scrolls the report list to its end, then takes one snapshot: the last rows of the report
// (a section's last account, its total and every row after it) mount however long the
// sections above them are. For snapshotWhen, which scrolls again on each poll, as a list
// that loads its rows in pages grows when its end is reached.
export async function reportSnapshotAtEnd(page: Page): Promise<ReportSnapshot> {
    await scrollReportList(page, { at: 'end' })
    return reportSnapshot(page)
}

// As reportSnapshotAtEnd, for a report that tdSnapshot reads (Transaction Detail, the
// General Ledger, the Journal) on its own screen: its report Total mounts however many
// sections stand above it.
export async function tdSnapshotAtEnd(page: Page): Promise<TdSnapshot> {
    await scrollReportList(page, { at: 'end' })
    return tdSnapshot(page)
}

// Scrolls the report list to its top, then takes one snapshot: the first rows mount again
// after a test has read the end of the list.
export async function reportSnapshotAtTop(page: Page): Promise<ReportSnapshot> {
    await scrollReportList(page, { at: 'top' })
    return reportSnapshot(page)
}

// The label of every row of the report, read from its top to the row labelled `last`. The
// table mounts only the rows near its scroll position, so this scrolls the list a stretch
// at a time: the bottom mounted row of each snapshot goes to the list's top, and the next
// snapshot counts only once that row is in it, so no row between two stretches is missed.
// The first snapshot counts only once the row labelled `first`, the report's first row, is
// in it.
export async function reportLabelsThrough(
    page: Page,
    first: string,
    last: string,
    message: string
): Promise<string[]> {
    await scrollReportList(page, { at: 'top' })
    const seen = new Set<string>()
    const state: { anchor: string | null } = { anchor: null }
    await expect
        .poll(
            async () => {
                const { rows } = await reportSnapshot(page)
                const joined =
                    state.anchor === null
                        ? rows.some(row => row.label === first)
                        : rows.some(row => row.id === state.anchor)
                if (!joined) return false
                for (const row of rows) seen.add(row.label)
                if (seen.has(last)) return true
                const bottom = rows[rows.length - 1]
                state.anchor = bottom.id
                await scrollReportList(page, { rowId: bottom.id })
                return false
            },
            { message, intervals: [100] }
        )
        .toBe(true)
    return [...seen]
}

// Presses an account row of a layout report and waits until its lines show beneath it.
export async function openReportAccount(page: Page, label: string): Promise<void> {
    await rowOf(page, label).click()
    await expect
        .poll(async () => reportLinesUnder(await reportSnapshot(page), label).length)
        .toBeGreaterThan(0)
}

// Posts a journal entry on `date`: Books must be open on a screen openNewEntry reaches. The
// form starts with two lines; each line past them is added with Add line.
export async function postEntryOn(
    page: Page,
    entry: { date: string; memo: string; lines: LineInput[] }
): Promise<void> {
    await openNewEntry(page)
    await page.getByTestId('entry-date').fill(entry.date)
    await page.getByTestId('entry-memo').fill(entry.memo)
    for (const [index, line] of entry.lines.entries()) {
        if (index >= 2) await page.getByTestId('entry-add-line').click()
        await fillLine(page, index, line)
    }
    await postOpenEntry(page)
}

// Downloads the open report in `format` through core's Export menu (the toolbar button,
// or "⋯" where the toolbar folds it) and returns the name the server gave the file and
// its bytes, read in the test process.
export async function exportReport(
    page: Page,
    format: ReportExportFormat
): Promise<{ name: string; bytes: Buffer }> {
    const download = await downloadReport(page, format)
    const path = await download.path()
    return { name: download.suggestedFilename(), bytes: fs.readFileSync(path) }
}

export const BOM = [0xef, 0xbb, 0xbf]

// The records of an RFC 4180 CSV text with CRLF line ends: quoted fields may hold
// commas, doubled quotes and line breaks.
function parseCsv(text: string): string[][] {
    const records: string[][] = []
    let record: string[] = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        if (inQuotes) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"'
                i++
            } else if (char === '"') inQuotes = false
            else field += char
            continue
        }
        if (char === '"') inQuotes = true
        else if (char === ',') {
            record.push(field)
            field = ''
        } else if (char === '\r' && text[i + 1] === '\n') {
            record.push(field)
            records.push(record)
            record = []
            field = ''
            i++
        } else field += char
    }
    if (field !== '' || record.length > 0) {
        record.push(field)
        records.push(record)
    }
    return records
}

// The records of an exported CSV file after its byte order mark: the heading line, then
// one record per row of the report, every group open.
export function csvRecords(bytes: Buffer): string[][] {
    expect([...bytes.subarray(0, 3)], 'the CSV starts with the byte order mark').toEqual(BOM)
    return parseCsv(bytes.subarray(3).toString('utf8'))
}

// The shipped Profit and Loss from the Books hub, reached as openJournal reaches the
// Journal. "Profit and Loss by Month" holds "Profit and Loss", so the row is narrowed to
// the one whose title reads "Profit and Loss" exactly.
export async function openProfitAndLoss(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, PROFIT_AND_LOSS_TITLE)
        .filter({ has: page.getByText(PROFIT_AND_LOSS_TITLE, { exact: true }) })
        .click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page.getByTestId('report-table')).toBeVisible()
}

// The shipped Profit and Loss by Month from the Books hub, the row whose title reads
// "Profit and Loss by Month" exactly.
export async function openProfitAndLossByMonth(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, PROFIT_AND_LOSS_BY_MONTH_TITLE)
        .filter({ has: page.getByText(PROFIT_AND_LOSS_BY_MONTH_TITLE, { exact: true }) })
        .click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page.getByTestId('report-table')).toBeVisible()
}

// The shipped Sales Tax Liability from the Books hub, reached as openBalanceSheet reaches
// the Balance Sheet: through the viewer share Books keeps. It has an empty state, so the
// table or the empty text shows.
export async function openSalesTaxLiability(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, SALES_TAX_LIABILITY_TITLE).click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// Sets the Period to October 2026, the month the seed posts its taxed sales in, and waits
// until the document period names it. In November the default Last month already is
// October, so choosePeriod changes nothing. Else core keeps the old rows until the new run
// lands, but the period words and the rows come from the same run result, so the words
// show October only once October's rows show.
export async function chooseOctober(page: Page): Promise<void> {
    await choosePeriod(page, { from: SALES_TAX_LIABILITY_FROM, to: SALES_TAX_LIABILITY_TO })
    await expect(page.getByTestId('report-document-period')).toHaveText(
        rangeWords(SALES_TAX_LIABILITY_FROM, SALES_TAX_LIABILITY_TO)
    )
}

// Narrows the report to the agencies named, through core's Agency picker. An unset Agency
// has no chip (core lists an optional param under Add filter), so the first pick starts
// from Add filter and a later one from the chip. It then waits until the URL holds the
// agencies and the rows show only those agencies' group rows: a wait on the rows, not on a
// run response (React Query answers a body it has cached with no request).
export async function chooseAgencies(page: Page, names: readonly string[]): Promise<void> {
    const chip = page.getByTestId('report-param-agencies')
    const from = (await chip.isVisible()) ? 'chip' : 'add-filter'
    await chooseParamOption(page, 'agencies', {
        from,
        search: names.length === 1 ? names[0] : undefined,
        labels: [...names],
    })
    await expect.poll(() => new URL(page.url()).searchParams.get('p-agencies')).not.toBeNull()
    const wanted = [...names].sort((a, b) => a.localeCompare(b))
    await snapshotWhen(
        page,
        reportSnapshot,
        snapshot =>
            snapshot.rows
                .filter(row => row.kind === 'group' && row.depth === 0)
                .map(row => row.label)
                .join('|') === wanted.join('|'),
        `the rows show only the agencies ${wanted.join(', ')}`
    )
}

// The Sales Tax Liability's phone lines (its spec's `mobile` layout): the label on line 1,
// Gross total and Non-taxable on line 2, Taxable amount and Tax amount on line 3.
const PHONE_LINE_2 = ['gross', 'nontaxable'] as const
const PHONE_LINE_3 = ['taxable', 'tax'] as const

type PhoneRect = { top: number; bottom: number; left: number; right: number }

type PhoneLinesRead = {
    label: PhoneRect | null
    cells: Record<string, { rect: PhoneRect; text: string; isCut: boolean } | null>
    tableScrollWidth: number
    tableClientWidth: number
}

// Reads the row `rowId`'s label and figure cells, and the report table's widths, in ONE
// pass. A cell is cut when it, or any element inside it, is wider than its box.
function readPhoneLines(page: Page, rowId: string): Promise<PhoneLinesRead> {
    return page.evaluate(
        ({ id, columns }) => {
            const rectOf = (element: Element): PhoneRect => {
                const box = element.getBoundingClientRect()
                return { top: box.top, bottom: box.bottom, left: box.left, right: box.right }
            }
            // A row id holds quotes and brackets (g:["…","…"]), so elements are matched by
            // their test id's value, not through a selector.
            const marked = [...document.querySelectorAll('[data-testid^="report-"]')]
            const byTestId = (testId: string) =>
                marked.find(element => element.getAttribute('data-testid') === testId) ?? null
            const label = byTestId(`report-row-${id}`)
            const cells: PhoneLinesRead['cells'] = {}
            for (const column of columns) {
                const cell = byTestId(`report-cell-${column}-${id}`)
                if (!cell) {
                    cells[column] = null
                    continue
                }
                const isCut = [cell, ...cell.querySelectorAll('*')].some(
                    element => element.scrollWidth > element.clientWidth
                )
                cells[column] = {
                    rect: rectOf(cell),
                    text: (cell as HTMLElement).innerText.trim(),
                    isCut,
                }
            }
            const table = document.querySelector('[data-testid="report-table"]')
            return {
                label: label ? rectOf(label) : null,
                cells,
                tableScrollWidth: table?.scrollWidth ?? -1,
                tableClientWidth: table?.clientWidth ?? -2,
            }
        },
        { id: rowId, columns: [...PHONE_LINE_2, ...PHONE_LINE_3] }
    )
}

// What breaks the phone lines on one read; empty when the row is laid out right.
function phoneLineProblems(read: PhoneLinesRead): string[] {
    const problems: string[] = []
    if (!read.label) return ['the row label is not mounted']
    const label = read.label
    const columns = [...PHONE_LINE_2, ...PHONE_LINE_3]
    for (const column of columns) {
        const cell = read.cells[column]
        if (!cell) {
            problems.push(`no ${column} cell`)
            continue
        }
        if (cell.text === '') problems.push(`${column} shows no figure`)
        if (cell.isCut) problems.push(`${column} "${cell.text}" is cut`)
        if (cell.rect.top < label.bottom - 1) {
            problems.push(
                `${column} (top ${cell.rect.top}) is not below the label (bottom ${label.bottom})`
            )
        }
    }
    const top = (column: string) => read.cells[column]?.rect.top ?? Number.NaN
    const bottom = (column: string) => read.cells[column]?.rect.bottom ?? Number.NaN
    if (Math.abs(top('gross') - top('nontaxable')) > 1) {
        problems.push(
            `gross (top ${top('gross')}) and nontaxable (top ${top('nontaxable')}) are not on one line`
        )
    }
    if (Math.abs(top('taxable') - top('tax')) > 1) {
        problems.push(
            `taxable (top ${top('taxable')}) and tax (top ${top('tax')}) are not on one line`
        )
    }
    const line2Bottom = Math.max(bottom('gross'), bottom('nontaxable'))
    if (!(Math.min(top('taxable'), top('tax')) >= line2Bottom - 1)) {
        problems.push(
            `line 3 (top ${Math.min(top('taxable'), top('tax'))}) is not below line 2 (bottom ${line2Bottom})`
        )
    }
    if (read.tableScrollWidth !== read.tableClientWidth) {
        problems.push(
            `the report table scrolls sideways (scrollWidth ${read.tableScrollWidth}, clientWidth ${read.tableClientWidth})`
        )
    }
    return problems
}

// Asserts a report row on a phone wraps to the Sales Tax Liability's three lines: the label
// on line 1 above every figure, Gross total and Non-taxable side by side on line 2,
// Taxable amount and Tax amount side by side on line 3 below it, each of the four showing
// a figure that is not cut, and the report table not scrolling sideways. Polled: the
// layout settles a frame after a resize or a press.
export async function expectPhoneLines(page: Page, rowId: string): Promise<void> {
    await expect
        .poll(async () => phoneLineProblems(await readPhoneLines(page, rowId)), {
            message: `the phone lines of report row ${rowId}`,
        })
        .toEqual([])
}

// How long a press is watched for a run it starts. An opened row's lines come from a new
// run (/api/reports/run with the row's path in `expand`), which the press sends at once
// and which lands well inside this window.
const PRESS_WATCH_MS = 1500

// The length of a P&L section's `expand` path: its type and its currency (["income",
// "USD"]). An account's path adds the account between them.
const SECTION_PATH_LENGTH = 2

// Presses the row labelled `label` and proves it opens nothing: over the watch window no
// run asks to open a row under a section (an `expand` path longer than a section's), and
// no snapshot taken in it shows a line beneath the row. Other workers post on the shared
// DB, so a live re-run may come in the window; only one that opens a row fails.
export async function expectPressOpensNothing(page: Page, label: string): Promise<ReportSnapshot> {
    const opening: unknown[][][] = []
    const watch = (request: Request) => {
        if (!request.url().includes('/api/reports/run') || request.method() !== 'POST') return
        const body = request.postDataJSON() as { options?: { expand?: unknown[][] } } | null
        const deep = (body?.options?.expand ?? []).filter(path => path.length > SECTION_PATH_LENGTH)
        if (deep.length > 0) opening.push(deep)
    }
    page.on('request', watch)
    try {
        await rowOf(page, label).click()
        const until = Date.now() + PRESS_WATCH_MS
        let last = await reportSnapshot(page)
        while (Date.now() < until) {
            expect(reportLinesUnder(last, label), `lines beneath ${label} after the press`).toEqual(
                []
            )
            last = await reportSnapshot(page)
        }
        expect(reportLinesUnder(last, label), `lines beneath ${label} after the press`).toEqual([])
        expect(opening, `runs that open a row after the press on ${label}`).toEqual([])
        return last
    } finally {
        page.off('request', watch)
    }
}

// --- Transaction Detail by Account (report drill-down). ---

// The shipped Transaction Detail by Account from the Books hub, reached as
// openTrialBalance reaches the Trial Balance, with no account chosen: Accounts is
// under Add filter until set (D8). The period stays This month to date.
export async function openTransactionDetailFromHub(page: Page): Promise<void> {
    await openBooksReports(page)
    await hubRow(page, TRANSACTION_DETAIL_TITLE)
        .filter({ has: page.getByText(TRANSACTION_DETAIL_TITLE, { exact: true }) })
        .click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(
        page.getByTestId('report-table').or(page.getByTestId('report-empty'))
    ).toBeVisible()
}

// Transaction Detail by Account narrowed to `opts.accounts` (full names), opened from
// the Books sidebar's Reports hub.
export async function openTransactionDetail(
    page: Page,
    opts: { accounts: readonly string[] }
): Promise<void> {
    await openTransactionDetailFromHub(page)
    await filterToAccounts(page, opts.accounts)
}

export type TdSnapshot = {
    title: string
    // The period the document header prints (report-document-period).
    header: string
    // Each param chip's text by param id (report-param-<id>).
    chips: Record<string, string>
    // Each column heading's text by column id (report-heading-<col>), before CSS uppercase.
    headings: Record<string, string>
    rows: {
        id: string
        kind: 'group' | 'detail' | 'subtotal' | 'total'
        label: string
        // Each cell's text by column id.
        cells: Record<string, string>
    }[]
}

// The document header, the chips, the headings and every mounted row of one report
// view, top to bottom, read in ONE pass so no re-render lands between two reads. With no
// `scope` it reads the statement on the page and leaves out the drill panel; with the
// panel (`report-drill-panel`) as scope it reads only the panel.
export function tdSnapshot(page: Page, scope?: Locator): Promise<TdSnapshot> {
    const root = scope ?? page.locator('body')
    return root.evaluate((element, excludePanel) => {
        const PANEL = '[data-testid="report-drill-panel"]'
        const all = (selector: string) =>
            [...element.querySelectorAll(selector)].filter(
                node => !excludePanel || node.closest(PANEL) === null
            )
        const first = (selector: string) => all(selector)[0]
        const textOf = (node: Element | null | undefined) =>
            (node as HTMLElement | null | undefined)?.innerText.trim() ?? ''
        const testIdOf = (node: Element) => node.getAttribute('data-testid') ?? ''
        const chips: Record<string, string> = {}
        for (const chip of all('[data-testid^="report-param-"]')) {
            chips[testIdOf(chip).slice('report-param-'.length)] = textOf(chip)
        }
        const headings: Record<string, string> = {}
        for (const heading of all('[data-testid^="report-heading-"]')) {
            const id = testIdOf(heading).slice('report-heading-'.length)
            if (id === 'row') continue
            headings[id] = (heading.textContent ?? '').replace(/\s+/g, ' ').trim()
        }
        const table = first('[data-testid="report-table"]')
        const cells = new Map<string, Record<string, string>>()
        for (const cell of table?.querySelectorAll('[data-testid^="report-cell-"]') ?? []) {
            const rest = testIdOf(cell).slice('report-cell-'.length)
            const dash = rest.indexOf('-')
            const row = cells.get(rest.slice(dash + 1)) ?? {}
            row[rest.slice(0, dash)] = textOf(cell)
            cells.set(rest.slice(dash + 1), row)
        }
        const kindOf = (id: string): TdSnapshot['rows'][number]['kind'] | null => {
            if (id.startsWith('g:')) return 'group'
            if (id.startsWith('d:')) return 'detail'
            if (id.startsWith('s:')) return 'subtotal'
            if (id.startsWith('total')) return 'total'
            return null
        }
        const rows: TdSnapshot['rows'] = []
        const labels = [...(table?.querySelectorAll('[data-testid^="report-row-"]') ?? [])]
            .map(node => ({
                id: testIdOf(node).slice('report-row-'.length),
                label: textOf(node),
                top: node.getBoundingClientRect().top,
            }))
            .sort((a, b) => a.top - b.top)
        for (const { id, label } of labels) {
            const kind = kindOf(id)
            if (kind) rows.push({ id, kind, label, cells: cells.get(id) ?? {} })
        }
        return {
            title: textOf(first('[data-testid="report-document-title"]')),
            header: textOf(first('[data-testid="report-document-period"]')),
            chips,
            headings,
            rows,
        }
    }, scope === undefined)
}

export type TdRow = TdSnapshot['rows'][number]

// A figure's digits, sign and point, without a currency sign or grouping.
export function figureDigits(text: string | undefined): string {
    return (text ?? '').replace(/[^0-9.\-−]/g, '')
}

// The lines of the section headed `label`: the detail rows after its heading, up to the
// next row that is not a line.
export function tdLinesOf(snapshot: TdSnapshot, label: string): TdRow[] {
    const start = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
    if (start < 0) return []
    const after = snapshot.rows.slice(start + 1)
    const end = after.findIndex(row => row.kind !== 'detail')
    return end < 0 ? after : after.slice(0, end)
}

// The "Total <label>" row of the section headed `label`.
export function tdSubtotalOf(snapshot: TdSnapshot, label: string): TdRow | undefined {
    return snapshot.rows.find(row => row.kind === 'subtotal' && row.label === `Total ${label}`)
}

// The report's Total row.
export function tdTotalOf(snapshot: TdSnapshot): TdRow | undefined {
    return snapshot.rows.find(row => row.kind === 'total')
}

// --- Statement figures that open Transaction Detail (report drill-down §3). ---

// Presses the figure of `columnId` on the row whose label is exactly `rowLabel`, in the
// statement (or in `scope`, the drill panel): core's `report-cell-<col>-<row id>`. A
// figure that opens is a link (core DrillFigure), so the press first checks the role: a
// figure with no drill would fold its group instead of opening the drill.
export async function pressFigure(
    page: Page,
    columnId: string,
    rowLabel: string,
    scope?: Locator
): Promise<void> {
    const cell = await cellOf(page, columnId, rowLabel, scope)
    await expect(cell, `${rowLabel}'s ${columnId} figure is a link`).toHaveRole('link')
    await cell.click()
}

// The text of the figure of `columnId` on the row whose label is exactly `rowLabel`, in
// the statement.
export async function figureText(page: Page, columnId: string, rowLabel: string): Promise<string> {
    const cell = await cellOf(page, columnId, rowLabel)
    await expect(cell).toBeVisible()
    return (await cell.innerText()).trim()
}

// --- The drill panel (report drill-down §3, a window of 1360 px or more). ---

// Core's side panel beside the statement (core ReportDrillPanel): every locator that
// reads or drives the opened report passes it as its scope.
export function drillPanel(page: Page): Locator {
    return page.getByTestId('report-drill-panel')
}

// --- A report that is not live (the six that read every journal line). ---

// The note core draws over a run that is not live (core ReportManualBand MANUAL_NOTE).
export const MANUAL_NOTE =
    'This report does not update by itself. Press Refresh to see new changes.'

// The band's parts by surface: the report itself, or the report in the drill panel. Each
// surface has its own test ids, so the two bands are never mixed up.
export function manualBand(page: Page, surface: 'report' | 'report-drill' = 'report') {
    const own = (part: string) =>
        surface === 'report'
            ? inStatement(page, `report-${part}`)
            : drillPanel(page).getByTestId(`report-drill-${part}`)
    return { band: own('manual-band'), note: own('manual-note'), refresh: own('refresh') }
}

function isReportRun(url: string, method: string): boolean {
    return method === 'POST' && new URL(url).pathname === '/api/reports/run'
}

// Resolves with the next report run the page sends. Start it before the action that
// sends the run, and await it after.
export function nextReportRun(page: Page): Promise<Request> {
    return page.waitForRequest(request => isReportRun(request.url(), request.method()))
}

// Holds each report run for which `isHeld` is true until the returned release is called,
// and continues every run. The caller calls release() and then
// page.unrouteAll({ behavior: 'wait' }), so no handler is still waiting when the test ends.
export async function holdReportRuns(
    page: Page,
    isHeld: (request: Request) => boolean = () => true
): Promise<() => void> {
    let release = () => {}
    const held = new Promise<void>(resolve => {
        release = resolve
    })
    await page.route('**/api/reports/run', async route => {
        if (isHeld(route.request())) await held
        await route.continue()
    })
    return release
}

// Presses Refresh on a report that is not live. The note is read first: only a run that is
// not live draws it. The awaited answer can be an earlier run's (a re-run of the saved
// report by its topics, from another worker's share or save), so only the caller's poll
// for the figure it needs proves the Refresh landed. Call it only after the write it must
// show is committed (postOpenEntry waits for the server's number).
export async function refreshReport(
    page: Page,
    surface: 'report' | 'report-drill' = 'report'
): Promise<void> {
    const { note, refresh } = manualBand(page, surface)
    await expect(note).toHaveText(MANUAL_NOTE)
    await Promise.all([
        page.waitForResponse(response => isReportRun(response.url(), response.request().method())),
        refresh.click(),
    ])
    await expect(refresh).toBeEnabled()
}

// How a wrapped line of Transaction Detail is drawn, read in ONE pass: whether its Amount
// sits below its Date (the label), and whether its Date, No. and Amount show their whole
// text: no element in them is cut (scrollWidth ≤ clientWidth), and their text is drawn on
// one line (a Date broken into "Jul 14," / "2026" is not whole). With `scope` it reads
// the line inside the panel.
export function wrappedLineFit(
    page: Page,
    rowId: string,
    scope?: Locator
): Promise<{ wraps: boolean; date: boolean; number: boolean; amount: boolean }> {
    const root = scope ?? page.locator('body')
    return root.evaluate((element, id) => {
        const find = (testId: string) => element.querySelector(`[data-testid="${testId}"]`)
        const isUncut = (node: Element) =>
            [node, ...node.querySelectorAll('*')].every(
                e => !(e instanceof HTMLElement) || e.scrollWidth <= e.clientWidth
            )
        // Every drawn box of the cell's text lies within one line's height: a text that
        // breaks onto a second line spans two.
        const isOneLine = (node: Element) => {
            const rects: DOMRect[] = []
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
            for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                if (!text.textContent?.trim()) continue
                const range = document.createRange()
                range.selectNodeContents(text)
                for (const rect of range.getClientRects()) {
                    if (rect.width > 0 && rect.height > 0) rects.push(rect)
                }
            }
            if (rects.length === 0) return true
            const top = Math.min(...rects.map(rect => rect.top))
            const bottom = Math.max(...rects.map(rect => rect.bottom))
            const lineHeight = Math.max(...rects.map(rect => rect.height))
            return bottom - top <= lineHeight + 1
        }
        const isWhole = (node: Element | null) => node !== null && isUncut(node) && isOneLine(node)
        const date = find(`report-row-${id}`)
        const number = find(`report-cell-number-${id}`)
        const amount = find(`report-cell-amount-${id}`)
        const wraps =
            date !== null &&
            amount !== null &&
            amount.getBoundingClientRect().top >= date.getBoundingClientRect().bottom - 1
        return { wraps, date: isWhole(date), number: isWhole(number), amount: isWhole(amount) }
    }, rowId)
}

// The spec's fit (spec §3 "Every width fits"): every column heading and every Amount
// ends inside the table's right edge, and nothing in the table scrolls sideways. With no
// `scope` it measures the statement; with the panel as scope, the panel's table.
export async function expectTableFits(page: Page, scope?: Locator): Promise<void> {
    const root = scope ?? page.locator('body')
    await expect
        .poll(
            () =>
                root.evaluate((element, excludePanel) => {
                    const PANEL = '[data-testid="report-drill-panel"]'
                    const inScope = (node: Element) => !excludePanel || node.closest(PANEL) === null
                    const table = [
                        ...element.querySelectorAll('[data-testid="report-table"]'),
                    ].find(inScope)
                    if (!table) return 'no report-table'
                    const right = table.getBoundingClientRect().right
                    const visible = (node: Element) => {
                        const box = node.getBoundingClientRect()
                        return box.width > 0 && box.height > 0
                    }
                    const measured = [
                        ...element.querySelectorAll('[data-testid^="report-heading-"]'),
                        ...table.querySelectorAll('[data-testid^="report-cell-amount-"]'),
                    ].filter(node => inScope(node) && visible(node))
                    if (measured.length === 0) return 'no heading or Amount measured'
                    const outside = measured
                        .filter(node => node.getBoundingClientRect().right > right + 1)
                        .map(node => node.getAttribute('data-testid'))
                    if (outside.length > 0) return `past the table's right edge: ${outside}`
                    // On a phone the chips ride in the list's top area (core
                    // report-controls), a strip that scrolls sideways by design; the
                    // fit is the table's rows and headings.
                    const scrolls = [table, ...table.querySelectorAll('*')]
                        .filter(node => node.closest('[data-testid="report-controls"]') === null)
                        .filter(node => {
                            const overflowX = getComputedStyle(node).overflowX
                            return node === table || overflowX === 'auto' || overflowX === 'scroll'
                        })
                        .filter(node => node.scrollWidth !== node.clientWidth)
                    if (scrolls.length > 0) return `${scrolls.length} element(s) scroll sideways`
                    return 'fits'
                }, scope === undefined),
            { message: 'the report table fits its width' }
        )
        .toBe('fits')
}
