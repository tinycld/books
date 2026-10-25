import { expect, type Locator, type Page } from '@playwright/test'
import { DESKTOP, isPhone, PHONE } from './account-register-helpers'

// Shared by the journal-entries e2e specs. Entries are made by driving the form,
// never by raw PocketBase writes. `createPostedEntry` and `createDraftEntry`
// press `entry-post` / `entry-save-draft` (checkpoint 6); the checkpoint 5 spec
// does not call them.

export { DESKTOP, isPhone, PHONE }

export type LineInput = {
    account?: string
    debit?: string
    credit?: string
    memo?: string
}

export type EntryInput = {
    memo: string
    amount: string
    debitAccount: string
    creditAccount: string
}

// Account labels as the picker shows them: 'number name'.
export const ACCOUNT_LABELS = {
    checking: '1000 Business Checking',
    equity: "3000 Owner's Equity",
} as const

// From the Books landing (desktop sidebar, phone Lists hub) to the entries list.
export async function openEntriesList(page: Page) {
    if (isPhone(page)) {
        // A fresh page may reopen Books at its last route instead of the hub.
        const hubCard = page.getByTestId('books-list-card-entries')
        const entries = page.getByTestId('entries-screen')
        const back = page.getByTestId('entry-back')
        await hubCard.or(entries).or(back).first().waitFor()
        if (await back.isVisible()) {
            await back.click()
            await hubCard.or(entries).first().waitFor()
        }
        if (!(await entries.isVisible())) await hubCard.click()
    } else {
        const item = page.getByTestId('books-nav-entries')
        const toggle = page.getByTestId('books-nav-accounting-toggle')
        await toggle.waitFor({ state: 'attached' })
        if (!(await item.isVisible())) await toggle.click()
        await item.click()
    }
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

// Books must already be open (login + navigateToPackage). Presses New journal
// entry in the list; on a phone the list's button is the same `entries-new`.
export async function openNewEntry(page: Page) {
    await openEntriesList(page)
    await page.getByTestId('entries-new').click()
    await expect(page.getByTestId('entry-title')).toHaveText('New journal entry')
}

// The account picker is core SelectInput: a dropdown whose trigger is the element
// with the `entry-line-account-<i>` test id. It shows the selected "number name"
// label, or 'Choose account'. Menu items are portaled and sub-accounts are indented,
// so items match by trimmed text.
export async function chooseAccount(page: Page, index: number, label: string) {
    await page.getByTestId(`entry-line-account-${index}`).click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
}

async function typeAmount(field: Locator, value: string) {
    await field.fill(value)
    await field.blur()
}

export async function fillLine(page: Page, index: number, line: LineInput) {
    if (line.account) await chooseAccount(page, index, line.account)
    if (line.debit) await typeAmount(page.getByTestId(`entry-line-debit-${index}`), line.debit)
    if (line.credit) await typeAmount(page.getByTestId(`entry-line-credit-${index}`), line.credit)
    if (line.memo) await page.getByTestId(`entry-line-memo-${index}`).fill(line.memo)
}

async function fillEntry(page: Page, entry: EntryInput) {
    await page.getByTestId('entry-memo').fill(entry.memo)
    await fillLine(page, 0, { account: entry.debitAccount, debit: entry.amount })
    await fillLine(page, 1, { account: entry.creditAccount, credit: entry.amount })
}

// Books must already be open. Leaves the page on the posted entry's read-only view.
export async function createPostedEntry(page: Page, entry: EntryInput): Promise<void> {
    await openNewEntry(page)
    await fillEntry(page, entry)
    await page.getByTestId('entry-post').click()
    await expect(page.getByTestId('entry-read-only')).toBeVisible()
}

// Books must already be open. Leaves the page on the saved draft's view.
export async function createDraftEntry(page: Page, entry: EntryInput): Promise<void> {
    await openNewEntry(page)
    await fillEntry(page, entry)
    await page.getByTestId('entry-save-draft').click()
    await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
}
