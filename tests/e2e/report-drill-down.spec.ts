import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, waitForTableFit } from '@tinycld/core/e2e-helpers'
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
    choosePeriod,
    dayWords,
    expectedHeading,
    expectTableFits,
    filterToAccounts,
    filterToAccountsAndWait,
    openEntriesFromSidebar,
    openGeneralLedger,
    openJournal,
    openTransactionDetail,
    openTransactionDetailFromHub,
    postEntryOn,
    snapshotWhen,
    type TdSnapshot,
    tdSnapshot,
} from './books-report-helpers'
import { ACCOUNT_LABELS, postedEntryNumber } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'
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

// The entry open in its read view: its id from the URL (`/books/entries/<id>`).
function entryIdFromUrl(page: Page): string {
    const id = /\/books\/entries\/([^/?#]+)$/.exec(new URL(page.url()).pathname)?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved entry: ${page.url()}`)
    return id
}

function entryUrl(id: string): RegExp {
    return new RegExp(`/books/entries/${id}$`)
}

// This month to date in the words core's document header and empty state print
// (core/reports/lib/params.ts rangeWords): one day alone, else "<Month> 1 – <today>".
function monthToDateWords(today: string): string {
    const first = `${today.slice(0, 8)}01`
    if (first === today) return dayWords(today)
    return `${dayWords(first).replace(/, \d{4}$/, '')} – ${dayWords(today)}`
}

// A figure's digits, sign and point, without a currency sign or grouping.
function figure(text: string | undefined): string {
    return (text ?? '').replace(/[^0-9.\-−]/g, '')
}

type TdRow = TdSnapshot['rows'][number]

function groupOf(snapshot: TdSnapshot, label: string): TdRow | undefined {
    return snapshot.rows.find(row => row.kind === 'group' && row.label === label)
}

// The lines of the section headed `label`: the detail rows after its heading, up to the
// next row that is not a line.
function linesOf(snapshot: TdSnapshot, label: string): TdRow[] {
    const start = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === label)
    if (start < 0) return []
    const after = snapshot.rows.slice(start + 1)
    const end = after.findIndex(row => row.kind !== 'detail')
    return end < 0 ? after : after.slice(0, end)
}

function subtotalOf(snapshot: TdSnapshot, label: string): TdRow | undefined {
    return snapshot.rows.find(row => row.kind === 'subtotal' && row.label === `Total ${label}`)
}

// The line of the section headed `section` whose Description is `memo`. An entry memo is
// the Description of each of the entry's lines, so the line is found in its section.
function lineWith(snapshot: TdSnapshot, section: string, memo: string): TdRow | undefined {
    return linesOf(snapshot, section).find(row => row.cells.description === memo)
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

test.describe('report-drill-down: screen', () => {
    test('a line opens the transaction that posted it, and Back returns to the report', async ({
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
        const today = await browserToday(page)
        const memo = uniqueName('TD6 entry')
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: today,
            memo,
            lines: [
                { account: expense, debit: '75.00' },
                { account: ACCOUNT_LABELS.checking, credit: '75.00' },
            ],
        })
        const entryId = entryIdFromUrl(page)
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
            s => linesOf(s, expense).length === 2 && linesOf(s, toBank).length === 1,
            `${expense}'s entry and bill lines and ${toBank}'s transfer line`
        )

        const entryLine = lineWith(before, expense, memo)
        if (!entryLine) throw new Error(`no line whose Description is ${memo}`)
        await pressLineLabel(page, entryLine)
        await expect(page).toHaveURL(entryUrl(entryId))
        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)
        const back = await snapshotWhen(
            page,
            tdSnapshot,
            s => linesOf(s, toBank).length === 1,
            'the report again after Back'
        )
        expect(back.chips.period).toBe(before.chips.period)
        expect(back.chips.accounts).toBe(before.chips.accounts)

        // A press anywhere on the row opens it: here its Amount, not its label.
        const transferLine = linesOf(back, toBank)[0]
        expect(transferLine.cells.type).toBe('Transfer')
        await page.getByTestId(`report-cell-amount-${transferLine.id}`).click()
        await expect(page).toHaveURL(TRANSFER_URL)
        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)

        const again = await snapshotWhen(
            page,
            tdSnapshot,
            s => linesOf(s, expense).some(row => row.cells.type === 'Bill'),
            `${expense}'s bill line`
        )
        const billLine = linesOf(again, expense).find(row => row.cells.type === 'Bill')
        if (!billLine) throw new Error(`no bill line under ${expense}`)
        await pressLineLabel(page, billLine)
        await expect(page).toHaveURL(BILL_URL)
        await page.goBack()
        await expect(page.getByTestId('report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)

        const sections = await snapshotWhen(
            page,
            tdSnapshot,
            s => groupOf(s, expense) !== undefined && subtotalOf(s, expense) !== undefined,
            `${expense}'s heading and total`
        )
        const total = subtotalOf(sections, expense)
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
        const entryId = entryIdFromUrl(page)
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
        await expect(page).toHaveURL(entryUrl(entryId))
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
        await expect(page).toHaveURL(entryUrl(entryId))
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
            s => linesOf(s, expense).length === 1,
            `${expense}'s one line`
        )
        const id = linesOf(snapshot, expense)[0].id
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

    test('the report runs again on a post from another session, and sorts by Amount', async ({
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
        await filterToAccountsAndWait(page, [expense])
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
            const first = await snapshotWhen(
                page,
                tdSnapshot,
                s => linesOf(s, expense).length === 1 && subtotalOf(s, expense) !== undefined,
                `${expense}'s first line without a reload`
            )
            expect(figure(linesOf(first, expense)[0].cells.amount)).toBe('21.00')
            expect(figure(subtotalOf(first, expense)?.cells.amount)).toBe('21.00')

            await postEntryOn(other, {
                date: today,
                memo: uniqueName('TD10 second'),
                lines: [
                    { account: expense, debit: '9.00' },
                    { account: ACCOUNT_LABELS.checking, credit: '9.00' },
                ],
            })
            await snapshotWhen(
                page,
                tdSnapshot,
                s => linesOf(s, expense).length === 2,
                `${expense}'s second line without a reload`
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
                const amounts = linesOf(s, expense).map(row => figure(row.cells.amount))
                return amounts.length === 2 && amounts[0] === '9.00'
            },
            `${expense}'s lines by Amount ascending`
        )
        expect(linesOf(sorted, expense).map(row => figure(row.cells.amount))).toEqual([
            '9.00',
            '21.00',
        ])
    })
})
