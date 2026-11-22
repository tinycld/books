import { expect, type Locator, type Page } from '@playwright/test'
import { createAccount, openChart } from './account-register-helpers'
import { fillLine, type LineInput, openNewEntry, postOpenEntry } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'
import { visibleScreen } from './screen-helpers'

// Shared by the reconcile e2e specs (reconcile spec §4 "Tests the plan must carry"). Each
// test makes its own account in the Chart of Accounts and posts its own entries through the
// journal entry form; nothing here writes to PocketBase directly.

export type ReconcileAccountKind = 'bank' | 'cash' | 'card'

// The type and detail type of each kind, as the account panel's menus label them.
const ACCOUNT_KINDS: Record<ReconcileAccountKind, { type: string; detailType: string }> = {
    bank: { type: 'Bank', detailType: 'Checking' },
    cash: { type: 'Bank', detailType: 'Cash on hand' },
    card: { type: 'Credit card', detailType: 'Credit card' },
}

const ACCOUNT_PREFIX: Record<ReconcileAccountKind, string> = {
    bank: 'Reconcile bank',
    cash: 'Reconcile cash',
    card: 'Reconcile card',
}

// A day `n` days before today (a negative `n` is after today), as YYYY-MM-DD in local time:
// the browser of the e2e run uses the same clock and time zone.
export function daysAgo(n: number): string {
    const day = new Date()
    day.setDate(day.getDate() - n)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

// Opens the accounts screen through the desktop sidebar's Accounting item "Reconcile".
export async function openReconcile(page: Page): Promise<Locator> {
    const item = page.getByTestId('books-nav-reconcile')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    await toggle.waitFor({ state: 'attached' })
    if (!(await item.isVisible())) await toggle.click()
    await expect(item).toContainText('Reconcile')
    await item.click()
    return visibleScreen(page, 'reconcile-accounts-screen')
}

// Makes a number-less account of `kind` with a unique name in the Chart of Accounts and
// returns the name. Leaves the page on the Chart.
export async function createReconcileAccount(
    page: Page,
    kind: ReconcileAccountKind
): Promise<string> {
    const name = uniqueName(ACCOUNT_PREFIX[kind])
    await openChart(page)
    await createAccount(page, name, ACCOUNT_KINDS[kind])
    return name
}

export type DatedEntryInput = {
    memo: string
    amount: string
    debitAccount: string
    creditAccount: string
    date: string
}

// Posts a two-line journal entry dated `date` and waits until the server numbered it.
export async function postDatedEntry(page: Page, input: DatedEntryInput): Promise<void> {
    await openNewEntry(page)
    await page.getByTestId('entry-date').fill(input.date)
    await page.getByTestId('entry-memo').fill(input.memo)
    await fillLine(page, 0, { account: input.debitAccount, debit: input.amount })
    await fillLine(page, 1, { account: input.creditAccount, credit: input.amount })
    await postOpenEntry(page)
}

// Posts one journal entry dated `date` with `lines` (two lines come with the form; the
// others are added) and waits until the server numbered it.
export async function postEntryLines(
    page: Page,
    input: { date: string; memo: string; lines: LineInput[] }
): Promise<void> {
    await openNewEntry(page)
    await page.getByTestId('entry-date').fill(input.date)
    await page.getByTestId('entry-memo').fill(input.memo)
    for (const [index, line] of input.lines.entries()) {
        if (index >= 2) await page.getByTestId('entry-add-line').click()
        await fillLine(page, index, line)
    }
    await postOpenEntry(page)
}

// The visible row (wide) or card (phone) of the account named `name` on the accounts screen.
// The name matches exactly: `hasText` is a caseless substring of the whole row.
export function accountRow(page: Page, name: string): Locator {
    return page
        .locator('[data-testid^="reconcile-account-"]')
        .filter({ has: page.getByText(name, { exact: true }), visible: true })
}

const ACCOUNT_ITEMS = '[data-testid^="reconcile-account-"]'

type AccountListMove = { move: 'top' | 'step'; items: string }

function accountListMove(move: AccountListMove['move']): AccountListMove {
    return { move, items: ACCOUNT_ITEMS }
}

// Runs in the page. Finds the accounts list's vertical scroller (table or cards) from its
// last mounted row and moves it, in one synchronous pass, so a re-render cannot detach the
// row it measures. Rows of a hidden, stacked screen are skipped. `offset` is where the first
// mounted row starts in the rows block (the rows' parent, which starts with the top spacer):
// 0 when the list renders from its first row. It is not measured from the scroller's top,
// because the table's scroller holds its sticky header above the rows block. A 'step'
// brings the last mounted row to the scroller's top edge (under the table's sticky header,
// where it stays mounted), so a step never passes a row that has not mounted yet. `atEnd`
// is true when a step could not move the list and the mounted rows already reach its end
// (the spacer after the last one has no height).
function moveAccountList({ move, items }: AccountListMove) {
    const mountedRows = Array.from(document.querySelectorAll(items)).filter(
        node => (node as HTMLElement).offsetParent !== null
    )
    const first = mountedRows[0]
    const last = mountedRows[mountedRows.length - 1]
    const rowsBlock = first?.parentElement ?? null
    let list = last?.parentElement ?? null
    while (list && !/auto|scroll/.test(getComputedStyle(list).overflowY)) {
        list = list.parentElement
    }
    if (!first || !last || !rowsBlock || !list) return { mounted: false, offset: -1, atEnd: false }
    const top = list.getBoundingClientRect().top
    const before = list.scrollTop
    if (move === 'top') list.scrollTop = 0
    if (move === 'step') list.scrollTop += last.getBoundingClientRect().top - top
    const spacerAfterLast = last.nextElementSibling?.getBoundingClientRect().height ?? 0
    return {
        mounted: true,
        offset: Math.round(
            first.getBoundingClientRect().top - rowsBlock.getBoundingClientRect().top
        ),
        atEnd: move === 'step' && list.scrollTop === before && spacerAfterLast === 0,
    }
}

// Waits two animation frames, so a render the last scroll started can land.
async function nextFrames(page: Page): Promise<void> {
    await page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
    )
}

// The accounts list mounts only the rows near its scroll position (useRowWindow), and the
// shared e2e DB holds the accounts of every reconcile spec of the run, so a test's account
// can sort below the mounted rows. Scroll the list from its top, as a user would, until
// `row` mounts, then bring it into view.
export async function revealAccountRow(page: Page, row: Locator): Promise<void> {
    await expect(page.locator(ACCOUNT_ITEMS).filter({ visible: true }).last()).toBeAttached()
    if ((await row.count()) === 0) {
        await expect
            .poll(async () => (await page.evaluate(moveAccountList, accountListMove('top'))).offset)
            .toBe(0)
        while ((await row.count()) === 0) {
            const { atEnd } = await page.evaluate(moveAccountList, accountListMove('step'))
            // A render can land between the count and the step, so count once more first.
            if (atEnd && (await row.count()) === 0) {
                throw new Error(
                    'The accounts list scrolled to its end and the account never mounted: it is not on the accounts screen.'
                )
            }
            await nextFrames(page)
        }
    }
    await row.scrollIntoViewIfNeeded()
}

// The account id of a row, from its test id `reconcile-account-<id>`.
export async function accountIdOf(page: Page, name: string): Promise<string> {
    const row = accountRow(page, name)
    await revealAccountRow(page, row)
    await expect(row).toHaveCount(1)
    const testId = (await row.getAttribute('data-testid')) ?? ''
    return testId.replace('reconcile-account-', '')
}

// The id of the reconciliation the work screen shows, from the URL books/reconcile/<id>.
export function reconciliationIdOf(page: Page): string {
    const match = /\/books\/reconcile\/([a-z0-9]{15})\/?$/.exec(new URL(page.url()).pathname)
    if (!match) throw new Error(`not on a reconciliation: ${page.url()}`)
    return match[1]
}

// Starts a reconciliation of the account named `accountName` from the accounts screen's
// start dialog and waits for its work screen. Returns the reconciliation id.
export async function startReconciliation(
    page: Page,
    accountName: string,
    statement: { balance: string; date: string }
): Promise<string> {
    await openReconcile(page)
    const id = await accountIdOf(page, accountName)
    await page.getByTestId(`reconcile-start-${id}`).filter({ visible: true }).click()
    const dialog = page.getByTestId('reconcile-start-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('reconcile-ending-balance').fill(statement.balance)
    await dialog.getByTestId('reconcile-ending-date').fill(statement.date)
    await dialog.getByTestId('reconcile-start-submit').click()
    // The screen pushes the work screen only after the server stored the reconciliation.
    await expect(page).toHaveURL(/\/books\/reconcile\/[a-z0-9]{15}\/?$/)
    await visibleScreen(page, 'reconcile-screen')
    return reconciliationIdOf(page)
}

// The figure labelled `label` in the summary band: its label and its value are one block.
export function bandFigure(summary: Locator, label: string): Locator {
    return summary.getByText(label, { exact: true }).locator('xpath=..')
}

// From any Books screen with the sidebar: the accounts screen, then the Resume (writer) or
// View (reader) button of the account named `accountName`; waits for the work screen.
export async function openWorkScreen(page: Page, accountName: string): Promise<Locator> {
    await openReconcile(page)
    const id = await accountIdOf(page, accountName)
    await page
        .getByTestId(`reconcile-resume-${id}`)
        .or(page.getByTestId(`reconcile-view-${id}`))
        .filter({ visible: true })
        .click()
    await expect(page).toHaveURL(/\/books\/reconcile\/[a-z0-9]{15}\/?$/)
    return visibleScreen(page, 'reconcile-screen')
}

// The visible row (wide) or card (phone) of the work screen's list that shows `memo`
// exactly. An earlier work screen can stay stacked and hidden (lesson 38).
export function lineRow(page: Page, memo: string): Locator {
    return page
        .locator('[data-testid^="reconcile-row-"]')
        .filter({ has: page.getByText(memo, { exact: true }), visible: true })
}

// A press on the row's memo: on the row, away from its link and its box (wide table).
export async function pressRow(page: Page, memo: string): Promise<void> {
    await lineRow(page, memo).getByText(memo, { exact: true }).click()
}

// Presses the visible Finish (the wide header's, or the phone's bottom bar's) and waits
// for the finished summary, which the route shows after the server has answered.
export async function finishReconciliation(page: Page): Promise<Locator> {
    const finish = page.getByTestId('reconcile-finish').filter({ visible: true })
    await expect(finish).toBeEnabled()
    await finish.click()
    const finished = page.getByTestId('reconcile-finished').filter({ visible: true })
    await expect(finished).toBeVisible()
    return finished
}

// The clear box of the row that shows `memo`.
export function lineBox(page: Page, memo: string): Locator {
    return lineRow(page, memo).locator('[data-testid^="reconcile-check-"]')
}

// The line id of a row, from its test id `reconcile-row-<lineId>`.
export async function lineIdOf(row: Locator): Promise<string> {
    await expect(row).toHaveCount(1)
    const testId = (await row.getAttribute('data-testid')) ?? ''
    if (!testId.startsWith('reconcile-row-')) throw new Error(`no row test id: ${testId}`)
    return testId.slice('reconcile-row-'.length)
}

// The line ids of the visible rows, in screen order, read in one snapshot (lesson 9).
export function shownLineIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid^="reconcile-row-"]'))
            .filter(node => (node as HTMLElement).offsetParent !== null)
            .map(node => (node.getAttribute('data-testid') ?? '').slice('reconcile-row-'.length))
    )
}

export type FinishOneStatementInput = {
    accountName: string
    date: string
    balance: string
    // The memos of the rows to clear, as `pressRow` finds them.
    clears: readonly string[]
}

export type FinishedStatement = { id: string }

// Starts a reconciliation of `accountName` at `date` and `balance`, clears the row of each
// memo in `clears`, finishes it and waits for its finished summary. Returns its id.
export async function finishOneStatement(
    page: Page,
    input: FinishOneStatementInput
): Promise<FinishedStatement> {
    await startReconciliation(page, input.accountName, {
        balance: input.balance,
        date: input.date,
    })
    for (const memo of input.clears) {
        await pressRow(page, memo)
        await expect(lineBox(page, memo)).toHaveAttribute('aria-checked', 'true')
    }
    await finishReconciliation(page)
    return { id: reconciliationIdOf(page) }
}

// From any Books screen with the sidebar: the accounts screen, then the "Reconciled through"
// link of the account named `accountName`; waits for that finished summary.
export async function openFinishedSummary(page: Page, accountName: string): Promise<Locator> {
    await openReconcile(page)
    const id = await accountIdOf(page, accountName)
    await page.getByTestId(`reconcile-through-${id}`).filter({ visible: true }).click()
    await expect(page).toHaveURL(/\/books\/reconcile\/[a-z0-9]{15}\/?$/)
    const finished = page.getByTestId('reconcile-finished').filter({ visible: true })
    await expect(finished).toBeVisible()
    return finished
}

// The difference of the visible summary band holds `text` ("$600.00").
export async function expectDifference(page: Page, text: string): Promise<void> {
    await expect(page.getByTestId('reconcile-difference').filter({ visible: true })).toContainText(
        text
    )
}

// Opens the History tab of Reconcile from any Books screen with the sidebar and waits for
// the history screen.
export async function openHistory(page: Page): Promise<Locator> {
    await openReconcile(page)
    await page.getByTestId('reconcile-tab-history').filter({ visible: true }).click()
    return visibleScreen(page, 'reconcile-history-screen')
}

// The visible row (wide table) or card (phone) of the finished reconciliation `id`. An
// earlier history screen can stay stacked and hidden (lesson 38).
export function historyRow(page: Page, id: string): Locator {
    return page.getByTestId(`reconcile-history-row-${id}`).filter({ visible: true })
}

// The history's Account filter chip on the shown screen.
export function historyFilter(page: Page): Locator {
    return page.getByTestId('reconcile-history-account').filter({ visible: true })
}

// Picks the account `accountId` in the history's Account filter and waits until the menu
// has closed, so the list keys are offered again.
export async function pickHistoryAccount(page: Page, accountId: string): Promise<void> {
    await historyFilter(page).click()
    const item = page.getByTestId(`reconcile-history-account-${accountId}`).filter({
        visible: true,
    })
    await item.click()
    await expect(item).toHaveCount(0)
}

const HISTORY_ITEMS = '[data-testid^="reconcile-history-row-"]'

// The reconciliation ids of the history's mounted, visible rows, in screen order, read in
// one snapshot (lesson 9).
export function shownHistoryIds(page: Page): Promise<string[]> {
    return page.evaluate(
        items =>
            Array.from(document.querySelectorAll(items))
                .filter(node => (node as HTMLElement).offsetParent !== null)
                .map(node =>
                    (node.getAttribute('data-testid') ?? '').slice('reconcile-history-row-'.length)
                ),
        HISTORY_ITEMS
    )
}

// Runs in the page. Moves the history list's vertical scroller (found from its last mounted
// row) to its top, or one step down, in one synchronous pass. `atEnd` is true when the
// scroller cannot move further down.
function moveHistoryList({ move, items }: { move: 'top' | 'step'; items: string }) {
    const mountedRows = Array.from(document.querySelectorAll(items)).filter(
        node => (node as HTMLElement).offsetParent !== null
    )
    const last = mountedRows[mountedRows.length - 1]
    let list = last?.parentElement ?? null
    while (list && !/auto|scroll/.test(getComputedStyle(list).overflowY)) {
        list = list.parentElement
    }
    if (!last || !list) return { mounted: false, atEnd: true }
    if (move === 'top') list.scrollTop = 0
    if (move === 'step') {
        list.scrollTop += Math.max(
            last.getBoundingClientRect().top - list.getBoundingClientRect().top,
            1
        )
    }
    return {
        mounted: true,
        atEnd: list.scrollTop + list.clientHeight >= list.scrollHeight - 1,
    }
}

// Every reconciliation id of the history, in screen order. The list mounts only the rows
// near its scroll position and the shared e2e DB holds the reconciliations of every spec,
// so the list is read from its top, step by step, until it reaches its end; ids are kept in
// the order they first show (lesson 9).
export async function historyOrder(page: Page): Promise<string[]> {
    await expect(page.locator(HISTORY_ITEMS).filter({ visible: true }).first()).toBeVisible()
    const order: string[] = []
    const take = async () => {
        for (const id of await shownHistoryIds(page)) {
            if (!order.includes(id)) order.push(id)
        }
    }
    await page.evaluate(moveHistoryList, { move: 'top' as const, items: HISTORY_ITEMS })
    await nextFrames(page)
    for (;;) {
        await take()
        const { atEnd } = await page.evaluate(moveHistoryList, {
            move: 'step' as const,
            items: HISTORY_ITEMS,
        })
        await nextFrames(page)
        if (atEnd) break
    }
    await take()
    return order
}

// The test id of the visible row that has the keyboard focus, or '' when none has it. The
// focused row carries data-focused="true" on the web (rowFocusStyle).
function focusedAccountTestId(page: Page): Promise<string> {
    return page.evaluate(items => {
        const focused = Array.from(document.querySelectorAll(items)).find(
            node =>
                (node as HTMLElement).offsetParent !== null &&
                node.getAttribute('data-focused') === 'true'
        )
        return focused?.getAttribute('data-testid') ?? ''
    }, ACCOUNT_ITEMS)
}

// Presses J until the row of `accountId` has the keyboard focus, then K when it is above
// the focused row. Each key stops at the list's end, when a press no longer moves the focus:
// the row count of the shared database grows, and the list mounts only part of its rows.
export async function focusAccountRow(page: Page, accountId: string): Promise<void> {
    const testId = `reconcile-account-${accountId}`
    const row = page.getByTestId(testId).filter({ visible: true })
    await revealAccountRow(page, row)
    await expect(row).toBeVisible()
    for (const key of ['j', 'k']) {
        let focused = await focusedAccountTestId(page)
        while (focused !== testId) {
            await page.keyboard.press(key)
            await nextFrames(page)
            const next = await focusedAccountTestId(page)
            if (next === focused) break
            focused = next
        }
    }
    await expect(row).toHaveAttribute('data-focused', 'true')
}
