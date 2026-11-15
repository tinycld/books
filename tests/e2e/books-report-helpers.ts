import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test'
import {
    authStorageKey,
    cellOf,
    chooseParamOption,
    hubRow,
    navigateToPackage,
    rowOf,
} from '@tinycld/core/e2e-helpers'
import {
    PROFIT_AND_LOSS_BY_MONTH_TITLE,
    PROFIT_AND_LOSS_TITLE,
} from '~/tinycld/books/lib/profit-and-loss-fixture'
import { TRANSACTION_DETAIL_TITLE } from '~/tinycld/books/lib/report-drill-down-fixture'
import { isPhone } from './account-register-helpers'
import { fillLine, type LineInput, openNewEntry, postOpenEntry } from './journal-entries-helpers'

// Books' reports run in core's report view (/a/reports/<id>). These helpers drive it
// through core's test ids (core/reports/components) and read it in one snapshot.

export type AsOfPreset = 'today' | 'endOfLastMonth' | 'endOfLastQuarter' | 'endOfLastFiscalYear'

export type TbSnapshot = {
    rows: {
        id: string
        kind: 'group' | 'detail'
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
// openNewEntry expect the list, an entry or the Lists hub on screen.
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

// MobileDrawer opens from a pan that starts in the 20px strip at the left edge;
// react-native-gesture-handler listens for the mouse on web, so a drag drives it
// (tests/e2e/mobile-drawer.spec.ts).
export async function openBooksMenu(page: Page): Promise<void> {
    // ActivePkgSync closes the drawer on every route change, so the swipe waits for
    // the Books index redirect to settle and for the drawer's mount.
    await expect(page).toHaveURL(/\/a\/books\/\w/)
    const panel = page.getByTestId('mobile-drawer-panel')
    await panel.waitFor({ state: 'attached' })
    const y = (page.viewportSize()?.height ?? 844) / 2
    await page.mouse.move(5, y)
    await page.mouse.down()
    await page.mouse.move(100, y, { steps: 8 })
    await page.mouse.move(200, y, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
}

// Core's Reports hub filtered to Books, reached the way a user does: Reports in the Books
// sidebar (on a phone, in the Books menu, the drawer). Open Books at the desktop viewport
// first when the page is a phone: navigateToPackage clicks the desktop rail.
export async function openBooksReports(page: Page): Promise<void> {
    await navigateToPackage(page, 'books')
    const width = page.viewportSize()?.width ?? Number.POSITIVE_INFINITY
    let reports = page.getByTestId('books-nav-reports')
    if (width <= MOBILE_MAX_WIDTH) {
        await openBooksMenu(page)
        reports = page.getByTestId('mobile-drawer-panel').getByTestId('books-nav-reports')
    }
    await reports.click()
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

// Narrows the report to the accounts named (full names), picked one by one through the
// Accounts picker under Add filter (opened here unless the test already opened it): a
// search per name, its option checked, then Apply. Returns the picked account ids, read
// from each option's test id (core ParamPickerParts `report-filter-option-<id>`).
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
    await picker.getByTestId('report-filter-apply').click()
    await expect(picker).toBeHidden()
    await expect(page.getByTestId('report-param-accounts')).toBeVisible()
    return ids
}

// Every mounted row of the report table, top to bottom, with its No., Debit and Credit
// cells, and the Total row, read in ONE pass so no re-render lands between two reads. The
// table is a FlashList: only mounted rows are read, and a Total row that is not mounted
// reads as an empty label (a test asserts `total.label` first, as its precondition).
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
        const rows: TbSnapshot['rows'] = []
        let total = { label: '', debit: '', credit: '' }
        for (const { id, label } of labels) {
            if (id.startsWith('total')) {
                total = { label, debit: cellText('debit', id), credit: cellText('credit', id) }
                continue
            }
            const kind = id.startsWith('g:') ? 'group' : id.startsWith('d:') ? 'detail' : null
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

// The rows that follow the account row labelled `label` until the next account row.
export function detailsUnder(snapshot: TbSnapshot, label: string): TbSnapshot['rows'] {
    const start = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
    if (start < 0) return []
    const after = snapshot.rows.slice(start + 1)
    const end = after.findIndex(row => row.kind !== 'detail')
    return end < 0 ? after : after.slice(0, end)
}

// Opens an account row and waits until its lines show beneath it.
export async function openAccountRow(page: Page, label: string): Promise<void> {
    await rowOf(page, label).click()
    await expect
        .poll(async () => detailsUnder(await tbSnapshot(page), label).length)
        .toBeGreaterThan(0)
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
// they are typed (the URL holds them) and Escape closes the popover.
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
        await page.getByTestId('report-period-from').fill(choice.from)
        await page.getByTestId('report-period-to').fill(choice.to)
        await expect(page.getByTestId('report-period-error')).toHaveCount(0)
        await expect
            .poll(() => new URL(page.url()).searchParams.get('p-period'))
            .toBe(`${choice.from}..${choice.to}`)
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
        kind: 'group' | 'detail' | 'subtotal' | 'computed' | 'total'
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
// row kind comes from core's row id: g: a group or an account, d: a line, s: a group's
// total, c: a computed row, total: the Total.
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

// The opened lines under the row labelled `label`: the detail rows that follow it until the
// next row that is not a line. Empty when the row is not mounted or not open.
export function reportLinesUnder(snapshot: ReportSnapshot, label: string): ReportSnapshot['rows'] {
    const start = snapshot.rows.findIndex(row => row.kind !== 'detail' && row.label === label)
    if (start < 0) return []
    const after = snapshot.rows.slice(start + 1)
    const end = after.findIndex(row => row.kind !== 'detail')
    return end < 0 ? after : after.slice(0, end)
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

// The accounts a run asked for, sorted: the ids of `params.accounts` in its body.
function runAccountIds(response: Response): string[] | null {
    const body = response.request().postDataJSON() as { params?: { accounts?: unknown } } | null
    const accounts = body?.params?.accounts
    if (!Array.isArray(accounts) || !accounts.every(id => typeof id === 'string')) return null
    return [...accounts].sort()
}

// Narrows the open report to the accounts named (full names) and waits until a run that
// asks for exactly the picked account ids has landed and the Accounts chip names every
// one: core keeps the previous run's rows on screen until the new run lands. The run is
// awaited by its body, so the choice must be one the page has not run before (React Query
// answers a cached body with no request). A chip names at most two choices (core
// NAMED_CHOICES), so pass at most two names.
export async function filterToAccountsAndWait(page: Page, names: readonly string[]): Promise<void> {
    const runs: string[] = []
    const watch = (response: Response) => {
        if (!response.url().includes('/api/reports/run') || !response.ok()) return
        const ids = runAccountIds(response)
        if (ids) runs.push(JSON.stringify(ids))
    }
    page.on('response', watch)
    try {
        const picked = [...(await filterToAccounts(page, names))].sort()
        await expect
            .poll(() => runs.includes(JSON.stringify(picked)), {
                message: `a run with the accounts ${picked.join(', ')} landed`,
            })
            .toBe(true)
    } finally {
        page.off('response', watch)
    }
    const chip = page.getByTestId('report-param-accounts')
    for (const name of names) await expect(chip).toContainText(name)
}

// Transaction Detail by Account narrowed to `opts.accounts` (full names), opened from
// the Books sidebar's Reports hub.
export async function openTransactionDetail(
    page: Page,
    opts: { accounts: readonly string[] }
): Promise<void> {
    await openTransactionDetailFromHub(page)
    await filterToAccountsAndWait(page, opts.accounts)
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
                    const scrolls = [table, ...table.querySelectorAll('*')]
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
