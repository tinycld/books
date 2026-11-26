import { expect, type Locator, type Page, test } from '@playwright/test'
import {
    cellOf,
    login,
    navigateToPackage,
    pressToolbar,
    rowOf,
    waitForTableFit,
} from '@tinycld/core/e2e-helpers'
import { TRANSACTION_DETAIL_TITLE } from '~/tinycld/books/lib/report-drill-down-fixture'
import { createAccount, openChart } from './account-register-helpers'
import {
    BILL_URL,
    billCellTestId,
    openNewBill,
    pickBillVendor,
    pickLineAccount,
    postBill,
} from './bill-helpers'
import {
    browserToday,
    chooseAsOf,
    choosePeriod,
    chooseRows,
    dayWords,
    expectedHeading,
    expectTableFits,
    figureDigits,
    figureText,
    filterToAccounts,
    openBalanceSheet,
    openEntriesFromSidebar,
    openGeneralLedger,
    openJournal,
    openProfitAndLoss,
    openProfitAndLossByMonth,
    openTransactionDetail,
    openTransactionDetailFromHub,
    openTrialBalance,
    postEntryOn,
    pressFigure,
    refreshReport,
    sectionTopKey,
    snapshotWhen,
    type TdRow,
    type TdSnapshot,
    tdLinesOf,
    tdSnapshot,
    tdSnapshotAtEnd,
    tdSubtotalOf,
    tdTotalOf,
} from './books-report-helpers'
import { ACCOUNT_LABELS, postedEntryNumber } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'
import { expectRecordUrl, recordIdFromUrl } from './record-key-helpers'
import { createPostedTransfer, TRANSFER_URL } from './transfer-helpers'

// Transaction Detail by Account on core's report screen (/a/reports/<id>), and the line
// rows of it, the General Ledger and the Journal that open the transaction that posted
// them (report drill-down spec §3, §7 items 6, 7, 9, 10). The e2e user is not the first
// admin, so it reaches each shipped report through the viewer share Books keeps.

const SCREEN = { width: 1280, height: 720 }
const NARROW = { width: 1024, height: 720 }
const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const BANK = { type: 'Bank', detailType: 'Checking' }
// The bill vendor bill-form.spec.ts uses.
const SUMMIT = 'Summit IT Services'
// The day of the General Ledger and Journal test's entry: no other spec or seed posts on
// it, so the Journal narrowed to it holds only that entry's block (a Journal of today
// holds every spec's entries and mounts only the rows near its view). After 2026-06-30,
// the close date books-settings.spec.ts holds on the shared DB.
const JOURNAL_DAY = '2026-07-29'
// The days of the section-figure test's entry, one for each worker that runs at the same
// time. The test reads Total Expenses of its day twice (the statement, then the drilled
// report), so a post by another test on that day between the reads changes the second
// read: other workers post expenses today on the shared DB, and the copies of this test
// under --repeat-each run side by side. No spec or seed posts on these days, and a worker
// runs one test at a time, so only that worker's copies post on its day, one after the
// other. After 2026-06-30, the close date books-settings.spec.ts holds.
const SECTION_DAYS = [
    '2026-07-03',
    '2026-07-04',
    '2026-07-05',
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
    '2026-07-10',
    '2026-07-12',
    '2026-07-13',
    '2026-07-14',
    '2026-07-16',
    '2026-07-17',
    '2026-07-18',
    '2026-07-21',
    '2026-07-23',
    '2026-07-24',
    '2026-07-26',
    '2026-07-27',
    '2026-07-28',
]

// This worker's section day. parallelIndex is unique among the workers that run at the
// same time, so two workers never share a day.
function sectionDay(): string {
    const index = test.info().parallelIndex
    const day = SECTION_DAYS[index]
    if (!day) throw new Error(`No section day for parallel worker ${index}: add days`)
    return day
}
const EQUITY = { type: 'Equity', detailType: "Owner's equity" }
const EXPENSES = 'Expenses'
const TOTAL_EXPENSES = `Total ${EXPENSES}`
const RETAINED_EARNINGS = 'Retained earnings'
const SHORT_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
]

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(SCREEN)
}

async function createAccounts(
    page: Page,
    accounts: { name: string; kind: typeof EXPENSE }[]
): Promise<void> {
    await openChart(page)
    for (const { name, kind } of accounts) await createAccount(page, name, kind)
}

// The table mounts only the rows near its scroll position, and a section grows with every
// account other runs and specs post: an account named from sectionTopKey sorts at the top
// of its group, so its row mounts when the group opens.
function accountName(prefix: string): string {
    return uniqueName(`${sectionTopKey()} ${prefix}`)
}

// The entry open in its read view: its id from the URL (`/books/entries/<id>`).
async function entryIdFromUrl(page: Page): Promise<string> {
    return recordIdFromUrl(page, 'entries')
}

// This month to date in the words core's document header and empty state print
// (core/reports/lib/params.ts rangeWords): one day alone, else "<Month> 1 – <today>".
function monthToDateWords(today: string): string {
    const first = `${today.slice(0, 8)}01`
    if (first === today) return dayWords(today)
    return `${dayWords(first).replace(/, \d{4}$/, '')} – ${dayWords(today)}`
}

// The Period chip of a Custom range, as core's chip writes it (core/reports/lib/params.ts
// chipText over dates.ts rangeChipText): one day alone, else the first year dropped when
// both ends share it.
function customPeriodChip(from: string, to: string): string {
    if (from === to) return `Period: ${shortDay(to)}`
    const fromText =
        from.slice(0, 4) === to.slice(0, 4)
            ? shortDay(from).replace(/, \d{4}$/, '')
            : shortDay(from)
    return `Period: ${fromText} – ${shortDay(to)}`
}

function groupOf(snapshot: TdSnapshot, label: string): TdRow | undefined {
    return snapshot.rows.find(row => row.kind === 'group' && row.label === label)
}

// The line of the section headed `section` whose Description is `memo`. An entry memo is
// the Description of each of the entry's lines, so the line is found in its section.
function lineWith(snapshot: TdSnapshot, section: string, memo: string): TdRow | undefined {
    return tdLinesOf(snapshot, section).find(row => row.cells.description === memo)
}

// Presses a line's label (the link) and checks it is a link named "Open: <label>".
async function pressLineLabel(page: Page, row: TdRow): Promise<void> {
    const label = page.getByTestId(`report-row-${row.id}`)
    await expect(label).toHaveRole('link')
    await expect(label).toHaveAccessibleName(`Open: ${row.label}`)
    await label.click()
}

// Presses a section heading where the reader sees it: the first section's heading sits at
// the list's top, under core's stuck copy of it (`report-sticky-row-<id>`, StickyGroup),
// which folds the section on a press as the row does; elsewhere the row itself.
async function pressHeading(page: Page, id: string): Promise<void> {
    const row = page.getByTestId(`report-row-${id}`)
    const stickyId = `report-sticky-row-${id}`
    const isCovered = await row.evaluate((element, copyId) => {
        const box = element.getBoundingClientRect()
        const onTop = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return (
            onTop?.closest('[data-testid^="report-sticky-row-"]')?.getAttribute('data-testid') ===
            copyId
        )
    }, stickyId)
    if (isCovered) await page.getByTestId(stickyId).click()
    else await row.click()
}

// A day in the words a Transaction Detail line's Date shows (core/reports/lib/dates.ts
// shortDay): "Nov 14, 2026".
function shortDay(day: string): string {
    return `${SHORT_MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`
}

function firstOfMonth(day: string): string {
    return `${day.slice(0, 8)}01`
}

function firstOfLastMonth(day: string): string {
    const first = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 2, 1))
    return first.toISOString().slice(0, 10)
}

// Collapse all, and waits until the section headed `section` reads folded.
async function collapseAll(page: Page, section: string): Promise<void> {
    await pressToolbar(page, 'report-fold-all', 'Collapse all')
    await expect(rowOf(page, section)).toHaveAttribute('aria-expanded', 'false')
}

// Folds the statement, then opens the one section the test reads (by its label, the
// fold toggle) and waits for `label`'s row under it: the shared DB holds every other
// spec's accounts, so only the rows near the section's top are mounted. `label` is named
// from accountName, so it stands at the section's top.
async function openSectionTo(page: Page, section: string, label: string): Promise<void> {
    await collapseAll(page, section)
    await rowOf(page, section).click()
    await expect(rowOf(page, section)).toHaveAttribute('aria-expanded', 'true')
    await expect(rowOf(page, label)).toBeVisible()
}

// The test id of the element that holds the focus, or of its nearest ancestor with one.
function focusedTestId(page: Page): Promise<string> {
    return page.evaluate(
        () => document.activeElement?.closest('[data-testid]')?.getAttribute('data-testid') ?? ''
    )
}

function urlPeriod(page: Page): string | null {
    return new URL(page.url()).searchParams.get('p-period')
}

// How long a press is watched for a drill it starts: a drill pushes the opened report's
// route at once, well inside this window.
const PRESS_WATCH_MS = 1500

// Presses `target` and proves it opens nothing: over the watch window the URL stays the
// report's, its title stays `title`, and no drill panel shows.
async function expectPressStays(page: Page, target: Locator, title: string): Promise<void> {
    const reportUrl = page.url()
    await target.click()
    const until = Date.now() + PRESS_WATCH_MS
    do {
        expect(page.url(), `the URL after the press on ${title}`).toBe(reportUrl)
        await expect(page.getByTestId('report-title')).toHaveText(title)
        await expect(page.getByTestId('report-drill-panel')).toHaveCount(0)
    } while (Date.now() < until)
}

// Checks the screen is Transaction Detail by Account, opened as a separate screen.
async function expectTransactionDetailScreen(page: Page): Promise<void> {
    await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)
    await expect(page.getByTestId('report-drill-panel')).toHaveCount(0)
}

test.describe('report-drill-down: screen', () => {
    // The entry line, Back and the section heading need one account and one entry; the
    // transfer and the bill lines are the next test, so neither test makes every document.
    test('a line opens the entry that posted it, and Back returns to the report', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = uniqueName('TD6 expense')
        // The bank's section comes first, so the expense heading this test folds is not the
        // first section, which the report's sticky heading covers.
        const bank = uniqueName('TD6 bank')
        await createAccounts(page, [
            { name: expense, kind: EXPENSE },
            { name: bank, kind: BANK },
        ])
        const today = await browserToday(page)
        const memo = uniqueName('TD6 entry')
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: today,
            memo,
            lines: [
                { account: expense, debit: '75.00' },
                { account: bank, credit: '75.00' },
            ],
        })
        const entryId = await entryIdFromUrl(page)

        await openTransactionDetail(page, { accounts: [expense, bank] })
        const header = page.getByTestId('report-document-header')
        await expect(header).toContainText(TRANSACTION_DETAIL_TITLE)
        await expect(header).toContainText(monthToDateWords(today))
        await expect
            .poll(async () => {
                const shown = (await page.getByTestId('report-business-name').innerText()).trim()
                const expected = await expectedHeading(page)
                return { matches: shown === expected && expected !== '', shown, expected }
            })
            .toMatchObject({ matches: true })
        const before = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdLinesOf(s, expense).length === 1,
            `${expense}'s entry line`
        )

        const entryLine = lineWith(before, expense, memo)
        if (!entryLine) throw new Error(`no line whose Description is ${memo}`)
        await pressLineLabel(page, entryLine)
        await expectRecordUrl(page, 'entries', entryId)
        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)
        const back = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdLinesOf(s, expense).length === 1,
            'the report again after Back'
        )
        expect(back.chips.period).toBe(before.chips.period)
        expect(back.chips.accounts).toBe(before.chips.accounts)

        const sections = await snapshotWhen(
            page,
            tdSnapshot,
            s => groupOf(s, expense) !== undefined && tdSubtotalOf(s, expense) !== undefined,
            `${expense}'s heading and total`
        )
        const total = tdSubtotalOf(sections, expense)
        const heading = groupOf(sections, expense)
        if (!total || !heading) throw new Error(`no heading or total for ${expense}`)
        await expect(page.getByTestId(`report-row-${total.id}`)).not.toHaveRole('link')
        const headingLabel = page.getByTestId(`report-row-${heading.id}`)
        await expect(headingLabel).toHaveAttribute('aria-expanded', 'true')
        const reportUrl = page.url()
        await headingLabel.click()
        await expect(headingLabel).toHaveAttribute('aria-expanded', 'false')
        expect(page.url()).toBe(reportUrl)
    })

    test("a press on a line's Amount opens its transfer, and a bill line opens its bill", async ({
        page,
    }) => {
        await startBooks(page)
        const expense = uniqueName('TD6 expense')
        const fromBank = uniqueName('TD6 from bank')
        const toBank = uniqueName('TD6 to bank')
        await createAccounts(page, [
            { name: expense, kind: EXPENSE },
            { name: fromBank, kind: BANK },
            { name: toBank, kind: BANK },
        ])
        await openEntriesFromSidebar(page)
        await createPostedTransfer(page, {
            from: fromBank,
            to: toBank,
            amount: '50.00',
            memo: uniqueName('TD6 transfer'),
        })
        await openNewBill(page)
        await pickBillVendor(page, SUMMIT)
        const line = await pickLineAccount(page, 0, expense)
        await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill('40.00')
        await page.getByTestId('form-input-memo').fill(uniqueName('TD6 bill'))
        await postBill(page)

        await openTransactionDetail(page, { accounts: [expense, toBank] })
        const before = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdLinesOf(s, expense).length === 1 && tdLinesOf(s, toBank).length === 1,
            `${expense}'s bill line and ${toBank}'s transfer line`
        )

        // A press anywhere on the row opens it: here its Amount, not its label.
        const transferLine = tdLinesOf(before, toBank)[0]
        expect(transferLine.cells.type).toBe('Transfer')
        await page.getByTestId(`report-cell-amount-${transferLine.id}`).click()
        await expect(page).toHaveURL(TRANSFER_URL)
        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)

        const again = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdLinesOf(s, expense).some(row => row.cells.type === 'Bill'),
            `${expense}'s bill line`
        )
        const billLine = tdLinesOf(again, expense).find(row => row.cells.type === 'Bill')
        if (!billLine) throw new Error(`no bill line under ${expense}`)
        await pressLineLabel(page, billLine)
        await expect(page).toHaveURL(BILL_URL)
        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)
    })

    test('a General Ledger line and a Journal line open the entry that posted them', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = uniqueName('TD7 expense')
        await createAccounts(page, [{ name: expense, kind: EXPENSE }])
        const memo = uniqueName('TD7 entry')
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: JOURNAL_DAY,
            memo,
            lines: [
                { account: expense, debit: '33.00' },
                { account: ACCOUNT_LABELS.checking, credit: '33.00' },
            ],
        })
        const entryId = await entryIdFromUrl(page)
        const entryNumber = await postedEntryNumber(page)

        await openGeneralLedger(page)
        await choosePeriod(page, { from: JOURNAL_DAY, to: JOURNAL_DAY })
        await filterToAccounts(page, [expense])
        const ledger = await snapshotWhen(
            page,
            tdSnapshot,
            s => lineWith(s, expense, memo) !== undefined,
            `the General Ledger line ${memo}`
        )
        const ledgerLine = lineWith(ledger, expense, memo)
        if (!ledgerLine) throw new Error(`no General Ledger line ${memo}`)
        await pressLineLabel(page, ledgerLine)
        await expectRecordUrl(page, 'entries', entryId)
        await expect(page.getByTestId('entry-detail-memo')).toContainText(memo)
        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText('General Ledger')

        // Narrowed to the entry's day, the Journal holds only this test's block, so its
        // heading and lines are mounted with no scroll.
        await openJournal(page)
        await choosePeriod(page, { from: JOURNAL_DAY, to: JOURNAL_DAY })
        const headingText = `${entryNumber} · Journal entry`
        const journal = await snapshotWhen(
            page,
            tdSnapshot,
            s =>
                groupOf(s, headingText) !== undefined &&
                lineWith(s, headingText, memo) !== undefined,
            `the Journal block ${headingText} and its line ${memo}`
        )
        const block = groupOf(journal, headingText)
        if (!block) throw new Error(`no Journal block ${headingText}`)
        const heading = page.getByTestId(`report-row-${block.id}`)
        await expect(heading).toHaveAttribute('aria-expanded', 'true')
        const reportUrl = page.url()
        await pressHeading(page, block.id)
        await expect(heading).toHaveAttribute('aria-expanded', 'false')
        expect(page.url()).toBe(reportUrl)
        await pressHeading(page, block.id)
        await expect(heading).toHaveAttribute('aria-expanded', 'true')

        const journalLine = lineWith(journal, headingText, memo)
        if (!journalLine) throw new Error(`no Journal line ${memo}`)
        await pressLineLabel(page, journalLine)
        await expectRecordUrl(page, 'entries', entryId)
        await expect(page.getByTestId('entry-detail-memo')).toContainText(memo)
    })

    test('the report fits at 1280 and 1024, with Date, No. and Amount whole', async ({ page }) => {
        await startBooks(page)
        const expense = uniqueName('TD9 expense')
        await createAccounts(page, [{ name: expense, kind: EXPENSE }])
        // A 120-character memo: the line's Description.
        const memo = `${uniqueName('TD9 long')} ${'a description that runs on '.repeat(6)}`
            .slice(0, 119)
            .concat('z')
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo,
            lines: [
                { account: expense, debit: '1234.56' },
                { account: ACCOUNT_LABELS.checking, credit: '1234.56' },
            ],
        })

        await openTransactionDetail(page, { accounts: [expense] })
        const snapshot = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdLinesOf(s, expense).length === 1,
            `${expense}'s one line`
        )
        const id = tdLinesOf(snapshot, expense)[0].id
        const wholeTexts = () =>
            page.evaluate(rowId => {
                const isCut = (testId: string) => {
                    const element = document.querySelector(`[data-testid="${testId}"]`)
                    if (!element) return true
                    return [element, ...element.querySelectorAll('*')].some(
                        e => e instanceof HTMLElement && e.scrollWidth > e.clientWidth
                    )
                }
                return {
                    date: !isCut(`report-row-${rowId}`),
                    number: !isCut(`report-cell-number-${rowId}`),
                    amount: !isCut(`report-cell-amount-${rowId}`),
                }
            }, id)

        for (const size of [SCREEN, NARROW]) {
            await page.setViewportSize(size)
            await waitForTableFit(page)
            await expectTableFits(page)
            await expect
                .poll(wholeTexts, { message: `Date, No. and Amount whole at ${size.width}` })
                .toEqual({ date: true, number: true, amount: true })
        }
    })

    test('Refresh shows a post from another session, and the report sorts by Amount', async ({
        page,
        browser,
    }) => {
        await startBooks(page)
        const expense = uniqueName('TD10 expense')
        await createAccounts(page, [{ name: expense, kind: EXPENSE }])
        const today = await browserToday(page)

        await openTransactionDetailFromHub(page)
        await expect(page.getByTestId('report-param-period')).toBeVisible()
        // With no account chosen Accounts is no chip: it is the Add filter entry (D8),
        // which filterToAccounts presses in the menu opened here.
        await expect(page.getByTestId('report-param-accounts')).toHaveCount(0)
        await page.getByTestId('report-add-filter').click()
        await expect(page.getByTestId('report-add-filter-accounts')).toBeVisible()
        await filterToAccounts(page, [expense])
        await expect(page.getByTestId('report-param-accounts')).toContainText(expense)
        await expect(page.getByTestId('report-empty-message')).toHaveText(
            `No rows for ${monthToDateWords(today)}`
        )
        await expect(page.getByTestId('report-empty-action')).toHaveText('Clear filters')

        // Page B is a second browser context signed in as the same user: its own session
        // and its own realtime connection, so the post reaches page A through the server.
        const otherContext = await browser.newContext()
        try {
            const other = await otherContext.newPage()
            await startBooks(other)
            await openEntriesFromSidebar(other)
            await postEntryOn(other, {
                date: today,
                memo: uniqueName('TD10 first'),
                lines: [
                    { account: expense, debit: '21.00' },
                    { account: ACCOUNT_LABELS.checking, credit: '21.00' },
                ],
            })
            // Transaction Detail is not live: a post shows when the reader presses
            // Refresh, here from the empty state.
            await refreshReport(page)
            const first = await snapshotWhen(
                page,
                tdSnapshot,
                s => tdLinesOf(s, expense).length === 1 && tdSubtotalOf(s, expense) !== undefined,
                `${expense}'s first line after Refresh`
            )
            expect(figureDigits(tdLinesOf(first, expense)[0].cells.amount)).toBe('21.00')
            expect(figureDigits(tdSubtotalOf(first, expense)?.cells.amount)).toBe('21.00')

            await postEntryOn(other, {
                date: today,
                memo: uniqueName('TD10 second'),
                lines: [
                    { account: expense, debit: '9.00' },
                    { account: ACCOUNT_LABELS.checking, credit: '9.00' },
                ],
            })
            await refreshReport(page)
            await snapshotWhen(
                page,
                tdSnapshot,
                s => tdLinesOf(s, expense).length === 2,
                `${expense}'s second line after Refresh`
            )
        } finally {
            await otherContext.close()
        }

        const layout = await waitForTableFit(page)
        if (layout === 'one-line') {
            await page.getByTestId('report-sort-amount').click()
        } else {
            await page.getByTestId('report-sort-menu').click()
            await page.getByTestId('report-sort-choice-amount-asc').click()
        }
        const sorted = await snapshotWhen(
            page,
            tdSnapshot,
            s => {
                const amounts = tdLinesOf(s, expense).map(row => figureDigits(row.cells.amount))
                return amounts.length === 2 && amounts[0] === '9.00'
            },
            `${expense}'s lines by Amount ascending`
        )
        expect(tdLinesOf(sorted, expense).map(row => figureDigits(row.cells.amount))).toEqual([
            '9.00',
            '21.00',
        ])
    })

    test('an account figure of the Profit and Loss opens its lines in Transaction Detail', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = accountName('TD1 expense')
        await createAccounts(page, [{ name: expense, kind: EXPENSE }])
        const today = await browserToday(page)
        const memo1 = uniqueName('TD1 first')
        const memo2 = uniqueName('TD1 second')
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: today,
            memo: memo1,
            lines: [
                { account: expense, debit: '120.00' },
                { account: ACCOUNT_LABELS.checking, credit: '120.00' },
            ],
        })
        const number1 = await postedEntryNumber(page)
        await postEntryOn(page, {
            date: today,
            memo: memo2,
            lines: [
                { account: expense, debit: '80.00' },
                { account: ACCOUNT_LABELS.checking, credit: '80.00' },
            ],
        })
        const number2 = await postedEntryNumber(page)

        await openProfitAndLoss(page)
        await openSectionTo(page, EXPENSES, expense)
        const shown = await figureText(page, 'amount', expense)
        expect(figureDigits(shown)).toBe('200.00')
        const total = await cellOf(page, 'amount', expense)
        await expect(total).toHaveRole('link')
        await expect(total).toHaveAccessibleName(`Show transactions: ${expense}, Total, ${shown}`)
        const source = await tdSnapshot(page)
        expect(source.chips.period).toContain('This fiscal year to date')

        await pressFigure(page, 'amount', expense)
        await expectTransactionDetailScreen(page)
        const detail = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdLinesOf(s, expense).length === 2 && tdSubtotalOf(s, expense) !== undefined,
            `${expense}'s two lines and its total`
        )
        expect(detail.chips.period).toBe(source.chips.period)
        expect(detail.chips.accounts).toContain(expense)
        const lines = tdLinesOf(detail, expense).map(row => ({
            date: row.label,
            type: row.cells.type,
            number: row.cells.number,
            description: row.cells.description,
            split: row.cells.split,
            amount: figureDigits(row.cells.amount),
        }))
        const line = { date: shortDay(today), type: 'Journal entry', split: 'Business Checking' }
        expect(lines).toEqual([
            { ...line, number: number1, description: memo1, amount: '120.00' },
            { ...line, number: number2, description: memo2, amount: '80.00' },
        ])
        expect(figureDigits(tdSubtotalOf(detail, expense)?.cells.amount)).toBe('200.00')
    })

    test('a figure opened by Tab and Enter leads back to the statement as it was left', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = accountName('TD2 expense')
        await createAccounts(page, [{ name: expense, kind: EXPENSE }])
        const today = await browserToday(page)
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('TD2 entry'),
            lines: [
                { account: expense, debit: '64.00' },
                { account: ACCOUNT_LABELS.checking, credit: '64.00' },
            ],
        })

        await openProfitAndLoss(page)
        await choosePeriod(page, { from: firstOfMonth(today), to: today })
        await openSectionTo(page, EXPENSES, expense)
        const source = await tdSnapshot(page)
        const shown = await figureText(page, 'amount', expense)
        expect(figureDigits(shown)).toBe('64.00')
        const label = rowOf(page, expense)
        const rowId = ((await label.getAttribute('data-testid')) ?? '').slice('report-row-'.length)
        const figureId = `report-cell-amount-${rowId}`
        await label.focus()
        for (let tabs = 0; tabs < 4 && (await focusedTestId(page)) !== figureId; tabs++) {
            await page.keyboard.press('Tab')
        }
        expect(await focusedTestId(page), `${expense}'s Total focused within 4 Tabs`).toBe(figureId)
        const focused = page.getByTestId(figureId)
        await expect(focused).toHaveRole('link')
        await expect(focused).toHaveAccessibleName(`Show transactions: ${expense}, Total, ${shown}`)
        await page.keyboard.press('Enter')

        await expectTransactionDetailScreen(page)
        expect(urlPeriod(page)).toBe(`${firstOfMonth(today)}..${today}`)
        await expect(page.getByTestId('report-param-period')).toHaveText(source.chips.period ?? '')
        const back = page.getByTestId('report-back')
        await expect(back).toHaveText('Profit and Loss')
        await back.click()
        await expect(page.getByTestId('report-title')).toHaveText('Profit and Loss')
        await expect(page.getByTestId('report-param-period')).toHaveText(source.chips.period ?? '')
        expect(urlPeriod(page)).toBe(`${firstOfMonth(today)}..${today}`)
    })

    test('a section total opens every account of its type, and its Total equals it', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = accountName('TD3 expense')
        const day = sectionDay()
        await createAccounts(page, [{ name: expense, kind: EXPENSE }])
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: day,
            memo: uniqueName('TD3 entry'),
            lines: [
                { account: expense, debit: '57.00' },
                { account: ACCOUNT_LABELS.checking, credit: '57.00' },
            ],
        })

        await openProfitAndLoss(page)
        await choosePeriod(page, { from: day, to: day })
        await collapseAll(page, EXPENSES)
        await expect(rowOf(page, TOTAL_EXPENSES)).toBeVisible()
        const source = await tdSnapshot(page)
        const totalExpenses = await figureText(page, 'amount', TOTAL_EXPENSES)

        await pressFigure(page, 'amount', TOTAL_EXPENSES)
        await expectTransactionDetailScreen(page)
        await expect(page.getByTestId('report-param-accounts')).toContainText(
            'All Expense accounts'
        )
        // Named from accountName, the account's section opens the report; the report Total
        // ends it, under every run's section of this day, so it is read with the list
        // scrolled to its end.
        const detail = await snapshotWhen(
            page,
            tdSnapshot,
            s => groupOf(s, expense) !== undefined,
            `${expense}'s section at the top of the report`
        )
        expect(detail.chips.period).toBe(source.chips.period)
        const end = await snapshotWhen(
            page,
            tdSnapshotAtEnd,
            s => tdTotalOf(s) !== undefined,
            'the report Total at the end of the list'
        )
        expect(figureDigits(tdTotalOf(end)?.cells.amount)).toBe(figureDigits(totalExpenses))
    })

    test('a month cell of the Profit and Loss by Month opens that month of the period', async ({
        page,
    }) => {
        await startBooks(page)
        const expense = accountName('TD4 expense')
        await createAccounts(page, [{ name: expense, kind: EXPENSE }])
        const today = await browserToday(page)
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('TD4 entry'),
            lines: [
                { account: expense, debit: '45.00' },
                { account: ACCOUNT_LABELS.checking, credit: '45.00' },
            ],
        })

        await openProfitAndLossByMonth(page)
        await choosePeriod(page, { from: firstOfLastMonth(today), to: today })
        await openSectionTo(page, EXPENSES, expense)
        // The period's months in order: p0 last month, p1 this month (core assemble.go).
        const thisMonth = 'amount.p1'
        const cell = await figureText(page, thisMonth, expense)
        expect(figureDigits(cell)).toBe('45.00')

        await pressFigure(page, thisMonth, expense)
        await expectTransactionDetailScreen(page)
        expect(urlPeriod(page)).toBe(`${firstOfMonth(today)}..${today}`)
        await expect(page.getByTestId('report-document-period')).toHaveText(monthToDateWords(today))
        await expect(page.getByTestId('report-param-period')).toHaveText(
            customPeriodChip(firstOfMonth(today), today)
        )
        await expect(page.getByTestId('report-param-accounts')).toContainText(expense)
        const detail = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdSubtotalOf(s, expense) !== undefined,
            `${expense}'s total`
        )
        expect(figureDigits(tdSubtotalOf(detail, expense)?.cells.amount)).toBe(figureDigits(cell))
    })

    test('a Balance Sheet figure opens the account up to the day', async ({ page }) => {
        await startBooks(page)
        const bank = accountName('TD5 bank')
        const equity = accountName('TD5 equity')
        await createAccounts(page, [
            { name: bank, kind: BANK },
            { name: equity, kind: EQUITY },
        ])
        const today = await browserToday(page)
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('TD5 capital'),
            lines: [
                { account: bank, debit: '300.00' },
                { account: equity, credit: '300.00' },
            ],
        })
        await postEntryOn(page, {
            date: today,
            memo: uniqueName('TD5 move'),
            lines: [
                { account: bank, debit: '25.00' },
                { account: ACCOUNT_LABELS.checking, credit: '25.00' },
            ],
        })

        await openBalanceSheet(page)
        const current = await figureText(page, 'current', bank)
        expect(figureDigits(current)).toBe('325.00')
        await pressFigure(page, 'current', bank)
        await expectTransactionDetailScreen(page)
        // The account's first line is of today: the period starts on the 1st of this month.
        expect(urlPeriod(page)).toBe(`${firstOfMonth(today)}..${today}`)
        await expect(page.getByTestId('report-document-period')).toHaveText(monthToDateWords(today))
        await expect(page.getByTestId('report-param-period')).toHaveText(
            customPeriodChip(firstOfMonth(today), today)
        )
        await expect(page.getByTestId('report-param-accounts')).toContainText(bank)
        const fromBalance = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdSubtotalOf(s, bank) !== undefined,
            `${bank}'s total from the Balance Sheet`
        )
        expect(figureDigits(tdSubtotalOf(fromBalance, bank)?.cells.amount)).toBe('325.00')
        const back = page.getByTestId('report-back')
        await expect(back).toHaveText('Balance Sheet')
        await back.click()
        await expect(page.getByTestId('report-title')).toHaveText('Balance Sheet')
    })

    // Its own accounts and one entry: the Balance Sheet test's second entry is read only
    // there, so the two reports are two tests and neither runs both.
    test('a Trial Balance figure opens the account up to the day, and Retained earnings is no link', async ({
        page,
    }) => {
        await startBooks(page)
        const bank = accountName('TD5 bank')
        const equity = accountName('TD5 equity')
        await createAccounts(page, [
            { name: bank, kind: BANK },
            { name: equity, kind: EQUITY },
        ])
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo: uniqueName('TD5 capital'),
            lines: [
                { account: bank, debit: '300.00' },
                { account: equity, credit: '300.00' },
            ],
        })

        await openTrialBalance(page)
        await chooseAsOf(page, { preset: 'today' })
        await filterToAccounts(page, [bank, RETAINED_EARNINGS])
        const debit = await figureText(page, 'debit', bank)
        expect(figureDigits(debit)).toBe('300.00')
        // B's Credit draws no figure, so it is no link.
        const blankCredit = await cellOf(page, 'credit', bank)
        await expect(blankCredit).toBeAttached()
        await expect(blankCredit).not.toHaveRole('link')
        await pressFigure(page, 'debit', bank)
        await expectTransactionDetailScreen(page)
        await expect(page.getByTestId('report-param-accounts')).toContainText(bank)
        const fromTrial = await snapshotWhen(
            page,
            tdSnapshot,
            s => tdSubtotalOf(s, bank) !== undefined,
            `${bank}'s total from the Trial Balance`
        )
        expect(figureDigits(tdSubtotalOf(fromTrial, bank)?.cells.amount)).toBe(figureDigits(debit))
        await page.getByTestId('report-back').click()
        await expect(page.getByTestId('report-title')).toHaveText('Trial Balance')

        await chooseRows(page, 'all')
        for (const column of ['debit', 'credit']) {
            const cell = await cellOf(page, column, RETAINED_EARNINGS)
            await expect(cell).toBeVisible()
            await expect(cell).not.toHaveRole('link')
            await expectPressStays(page, cell, 'Trial Balance')
        }
    })
})
