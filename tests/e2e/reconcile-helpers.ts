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

// The account id of a row, from its test id `reconcile-account-<id>`.
export async function accountIdOf(page: Page, name: string): Promise<string> {
    const row = accountRow(page, name)
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

// The difference of the visible summary band holds `text` ("$600.00").
export async function expectDifference(page: Page, text: string): Promise<void> {
    await expect(page.getByTestId('reconcile-difference').filter({ visible: true })).toContainText(
        text
    )
}

// Presses J until the row of `accountId` has the keyboard focus, or K when it is above the
// focused row, at most once for each row on the screen (the shared database's account count
// grows). The focused row carries data-focused="true" on the web (rowFocusStyle).
export async function focusAccountRow(page: Page, accountId: string): Promise<void> {
    const row = page.getByTestId(`reconcile-account-${accountId}`).filter({ visible: true })
    await expect(row).toBeVisible()
    const rowCount = await page
        .locator('[data-testid^="reconcile-account-"]')
        .filter({ visible: true })
        .count()
    const isRowFocused = async () => (await row.getAttribute('data-focused')) === 'true'
    for (const key of ['j', 'k']) {
        for (let presses = 0; presses < rowCount && !(await isRowFocused()); presses++) {
            await page.keyboard.press(key)
        }
    }
    await expect(row).toHaveAttribute('data-focused', 'true')
}
