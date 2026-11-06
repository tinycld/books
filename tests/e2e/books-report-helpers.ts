import { expect, type Page } from '@playwright/test'
import { hubRow, navigateToPackage, rowOf } from '@tinycld/core/e2e-helpers'

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

// Below core's mobile breakpoint (useBreakpoint) the Books sidebar lives in the drawer.
const MOBILE_MAX_WIDTH = 767

// MobileDrawer opens from a pan that starts in the 20px strip at the left edge;
// react-native-gesture-handler listens for the mouse on web, so a drag drives it
// (tests/e2e/mobile-drawer.spec.ts).
async function openBooksMenu(page: Page): Promise<void> {
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

// Narrows the report to the accounts named (full names), picked one by one through the
// Accounts picker under Add filter: a search per name, its option checked, then Apply.
export async function filterToAccounts(page: Page, names: readonly string[]): Promise<void> {
    await page.getByTestId('report-add-filter').click()
    await page.getByTestId('report-add-filter-accounts').click()
    const picker = page.getByTestId('report-filter-picker')
    await expect(picker).toBeVisible()
    for (const name of names) {
        await picker.getByTestId('report-filter-search').fill(name)
        await picker.getByRole('checkbox', { name, exact: true }).click()
    }
    await picker.getByTestId('report-filter-apply').click()
    await expect(picker).toBeHidden()
    await expect(page.getByTestId('report-param-accounts')).toBeVisible()
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
