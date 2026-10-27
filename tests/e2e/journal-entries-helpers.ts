import { expect, type Locator, type Page, type Request } from '@playwright/test'
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
    // A fresh page may reopen Books at its last route (the list, or an entry),
    // and pressing the nav item over either would stack a second screen.
    const entries = page.getByTestId('entries-screen')
    const back = page.getByTestId('entry-back')
    const listCard = page.getByTestId('books-list-card-entries')
    const navItem = isPhone(page) ? listCard : page.getByTestId('books-nav-entries')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    // Wait on a screen, never on the desktop sidebar toggle: it shows on every Books route,
    // so it cannot say which screen a lazy route is about to mount. The Lists hub keeps its
    // cards mounted but hidden on desktop, so there its attached card is the landing signal.
    await expect(entries.or(back).or(listCard).first()).toBeAttached()
    if (!(await listCard.count())) await expect(entries.or(back).first()).toBeVisible()
    if (await entries.isVisible()) return
    if (await back.isVisible()) {
        await back.click()
        await expect(entries).toBeVisible()
        return
    }
    if (!isPhone(page)) {
        await expect(toggle).toBeVisible()
        if (!(await navItem.isVisible())) await toggle.click()
    }
    await navItem.click()
    await expect(entries).toBeVisible()
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
    await postOpenEntry(page)
}

// Posts the entry open on the page and waits for the server to commit it. The read-only view
// shows the optimistic state first; the number comes only from the server's answer.
export async function postOpenEntry(page: Page) {
    await page.getByTestId('entry-post').click()
    await expect(page.getByTestId('entry-read-only')).toBeVisible()
    await expect(page.getByTestId('entry-title')).toHaveText(/^Journal entry JE-\d+$/)
}

// Books must already be open. Leaves the page on the saved draft's view.
export async function createDraftEntry(page: Page, entry: EntryInput): Promise<void> {
    await openNewEntry(page)
    await fillEntry(page, entry)
    await page.getByTestId('entry-save-draft').click()
    // The new-entry form shows the same Draft badge, so only the saved draft's own title (the
    // new screen is replaced by `entries/<id>`) says the save finished and the form remounted.
    await expect(page.getByTestId('entry-title')).toHaveText('Journal entry')
    await expect(page.getByTestId('entry-badge')).toHaveText('Draft')
}

export type HeldRequests = {
    // Resolves once the first matching request is held.
    firstHeld: Promise<void>
    // Matching requests that reached the route, held or released.
    count(): number
    release(): void
}

// Holds every request that matches `matches` until `release()`, then lets it through
// to the real server. Used to look at the screen while a write is still in flight.
export async function holdRequests(
    page: Page,
    url: string,
    matches: (request: Request) => boolean
): Promise<HeldRequests> {
    let release = () => {}
    const gate = new Promise<void>(resolve => {
        release = resolve
    })
    let arrived = () => {}
    const firstHeld = new Promise<void>(resolve => {
        arrived = resolve
    })
    let count = 0
    await page.route(url, async route => {
        if (!matches(route.request())) return route.continue()
        count += 1
        arrived()
        await gate
        return route.continue()
    })
    return { firstHeld, count: () => count, release }
}

// Two frames let a navigation queued in a request continuation run before a negative check.
export function settleFrames(page: Page) {
    return page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
    )
}
