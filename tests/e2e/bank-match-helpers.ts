import { expect, type Locator, type Page } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { BANKING_DESKTOP, bankCard, openBanking } from './banking-helpers'
import {
    importReviewStatement,
    openReviewTab,
    type ReviewEntry,
    type ReviewImport,
    reviewRow,
} from './for-review-helpers'
import { createPostedTransfer, TRANSFER_LABELS } from './transfer-helpers'

// Shared by the bank-match e2e specs. A spec's serial group connects its own number-less
// Bank account and imports one OFX file that holds the bank rows of every test of the
// group; each test then posts its own transfers from that account to 1010 Business
// Savings, dated today, so one test's transfer never becomes another test's suggestion.
// The seeded 1000 Business Checking is only read.

function todayIso(): string {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
}

// Today as an OFX day, 'YYYYMMDD': the day the transfer form posts by default.
export function todayDigits(): string {
    return todayIso().replaceAll('-', '')
}

// Today as the screens write a day ("Nov 19, 2026").
export function todayText(): string {
    return formatDay(todayIso())
}

// Signs in, opens Banking at the wide size, connects a new account and imports an OFX
// file of `rows`; returns on that account's For review tab.
export async function startMatchAccount(
    page: Page,
    rows: (stamp: string) => ReviewEntry[]
): Promise<ReviewImport> {
    await signInWide(page)
    return importReviewStatement(page, rows)
}

// Signs in and opens Books at the wide size.
export async function signInWide(page: Page): Promise<void> {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(BANKING_DESKTOP)
}

// A trip away from Banking and back (Journal Entries for a transfer) leaves the earlier
// Banking screen stacked and hidden, with the same cards and rows: every list lookup
// takes the visible one only (lesson 5). The drawer sits outside the screen, and only the
// visible screen's drawer opens.
export function visibleRow(page: Page, description: string): Locator {
    return reviewRow(page, description).filter({ visible: true })
}

export function visibleTestId(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

// Opens `account`'s For review tab from anywhere in Books.
export async function openMatchAccount(page: Page, account: string): Promise<void> {
    await navigateToPackage(page, 'books')
    await openBanking(page)
    await chooseMatchAccount(page, account)
}

// Banking must be on top. Selects `account`'s card and opens its For review tab.
async function chooseMatchAccount(page: Page, account: string): Promise<void> {
    const card = bankCard(page, account).filter({ visible: true })
    await card.click()
    await expect(card).toHaveAttribute('aria-selected', 'true')
    await openReviewTab(page, 'review')
}

const ENTRY_SCREENS_URL = /\/books\/(entries|transfers)(?:[/?#]|$)/
const MAX_BACK_STEPS = 4

// Pops the Journal Entries list and the transfer screens off the history, so the next
// openEntriesList pushes the one Entries screen (a sidebar push would stack a second one,
// hidden, and strict mode then finds two). Back is a same-document popstate, no reload.
async function leaveEntryScreens(page: Page): Promise<void> {
    for (let step = 0; step < MAX_BACK_STEPS && ENTRY_SCREENS_URL.test(page.url()); step++) {
        await page.goBack()
    }
    await expect(page).not.toHaveURL(ENTRY_SCREENS_URL)
    await expect(page.getByTestId('entries-screen')).toHaveCount(0)
}

// Books must be open. Posts a transfer of `amount` (e.g. '151.10') from `account` to
// 1010 Business Savings, dated today, then returns to the account's For review tab: back
// to the screen the transfer started from, and to Banking through its nav item only when
// that screen is not Banking.
export async function postMatchTransfer(
    page: Page,
    account: string,
    amount: string,
    memo: string
): Promise<{ id: string; number: string }> {
    const transfer = await createPostedTransfer(page, {
        from: account,
        to: TRANSFER_LABELS.savings,
        amount,
        memo,
    })
    await leaveEntryScreens(page)
    const bankingShown = await page
        .getByTestId('bank-strip')
        .filter({ visible: true })
        .first()
        .isVisible()
    if (!bankingShown) await openBanking(page)
    await chooseMatchAccount(page, account)
    return transfer
}

// Opens the drawer of the For review row that shows `description`; waits for the drawer
// to show that transaction.
export async function openMatchDrawer(page: Page, description: string): Promise<void> {
    await visibleRow(page, description).getByText(description, { exact: true }).click()
    await expect(page.getByTestId('bank-txn-drawer')).toBeVisible()
    await expect(
        page.getByTestId('bank-txn-field-description').getByText(description, { exact: true })
    ).toBeVisible()
}

// One option row of the drawer's Match section.
export function matchOption(page: Page, lineId: string): Locator {
    return page.getByTestId(`bank-match-option-${lineId}`)
}

const OPTION_PREFIX = 'bank-match-option-'

// The line ids of the Match section's option rows, in screen order, once `count` show.
export async function matchOptionIds(page: Page, count: number): Promise<string[]> {
    const options = page.locator(`[data-testid^="${OPTION_PREFIX}"]`)
    await expect(options).toHaveCount(count)
    const testIds = await options.evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('data-testid') ?? '')
    )
    return testIds.map(testId => testId.slice(OPTION_PREFIX.length))
}

// The transaction id that a review row carries in its test id.
export async function reviewRowId(row: Locator): Promise<string> {
    await expect(row).toHaveCount(1)
    const testId = (await row.getAttribute('data-testid')) ?? ''
    if (!testId.startsWith('bank-review-row-')) throw new Error(`no row test id: ${testId}`)
    return testId.slice('bank-review-row-'.length)
}
