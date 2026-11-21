import { expect, type Locator, type Page } from '@playwright/test'
import { signInWide, visibleRow, visibleTestId } from './bank-match-helpers'
import { importReviewStatement, type ReviewEntry, type ReviewImport } from './for-review-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'
import { visibleScreen } from './screen-helpers'
import { pickFromSearchPicker } from './search-picker-helpers'

// Shared by the bank-categorize e2e specs. Each test connects its own number-less Bank
// account and imports its own OFX file, with the test's stamp in every description and
// per-run cents in every amount, dated today (after the close date books-settings.spec.ts
// holds). The posting accounts are the seeded 6100 Rent and 2100 Company Card, of which no
// spec asserts a total for the current month.

const ENTRY_ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'

// Signs in, opens Banking at the wide size, connects a new account and imports an OFX file
// of `rows`; returns on that account's For review tab.
export async function startCategorizeAccount(
    page: Page,
    rows: (stamp: string) => ReviewEntry[]
): Promise<ReviewImport> {
    await signInWide(page)
    return importReviewStatement(page, rows)
}

// The drawer's description value, when it shows `description`.
export function drawerShows(page: Page, description: string): Locator {
    return page.getByTestId('bank-txn-field-description').getByText(description, { exact: true })
}

// Presses the For review row that shows `description`; waits for the drawer to show it.
export async function openCategorizeDrawer(page: Page, description: string): Promise<void> {
    const row = await visibleRow(page, description)
    await row.getByText(description, { exact: true }).click()
    await expect(visibleTestId(page, 'bank-txn-drawer')).toBeVisible()
    await expect(drawerShows(page, description)).toBeVisible()
}

// Picks `name` (an account label, "6100 Rent") in the account picker `triggerId`
// (`bank-cat-account-<n>` or `bank-transfer-account`).
export async function pickAccount(page: Page, triggerId: string, name: string): Promise<void> {
    await pickFromSearchPicker(page, triggerId, name)
}

// Picks the customer or vendor `name` in the Categorize way's Payee picker.
export async function pickPayee(page: Page, name: string): Promise<void> {
    await pickFromSearchPicker(page, 'bank-cat-payee', name)
}

// Books must be open. Opens the posted journal entry or transfer whose memo is `memo` from
// the Journal Entries list (the list is windowed, so it is found through the search box);
// waits for its read view.
export async function openEntryByMemo(page: Page, memo: string): Promise<void> {
    await openEntriesList(page)
    await searchEntries(page, memo)
    const row = page
        .locator(ENTRY_ROWS)
        .filter({ hasText: memo })
        .filter({ hasNotText: /reversal/i })
    await expect(row).toHaveCount(1)
    await row.click()
    await expect(
        page
            .getByTestId('entry-read-only')
            .or(page.getByTestId('transfer-read-only'))
            .filter({ visible: true })
    ).toBeVisible()
}

// Of `names`, the ones the visible Banking list shows, in its order, read in one snapshot.
export async function shownOrder(page: Page, names: readonly string[]): Promise<string[]> {
    const screen = await visibleScreen(page, 'banking-screen')
    const texts = await screen
        .locator('[data-testid^="bank-review-row-"]')
        .filter({ visible: true })
        .allInnerTexts()
    return texts.flatMap(text => {
        const lines = text.split('\n').map(line => line.trim())
        return names.filter(name => lines.includes(name))
    })
}

// The row the drawer goes to after `name` leaves the list `order` (shownOrder): the row
// under it, or the row above it when it was the last; null when it was the only row.
export function nextAfter(order: readonly string[], name: string): string | null {
    const index = order.indexOf(name)
    if (index < 0 || order.length < 2) return null
    return order[index + 1] ?? order[index - 1] ?? null
}

// After `left` leaves the list `order` by the drawer's Match or Exclude, the drawer stays
// open and shows the next row.
export async function expectNextRowShown(
    page: Page,
    order: readonly string[],
    left: string
): Promise<void> {
    const next = nextAfter(order, left)
    if (next === null) throw new Error(`no row after ${left} in ${order.join(', ')}`)
    await expect(visibleTestId(page, 'bank-txn-drawer')).toBeVisible()
    await expect(drawerShows(page, next)).toBeVisible()
}
