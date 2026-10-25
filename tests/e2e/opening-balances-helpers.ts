import { expect, type Page } from '@playwright/test'
import { openChart } from './account-register-helpers'

export { DESKTOP, isPhone, PHONE } from './account-register-helpers'

// Opens the Opening balances screen from the Chart of Accounts toolbar link
// (never page.goto). Works at desktop and phone size; the caller sets the
// viewport after navigateToPackage.
export async function openOpeningBalances(page: Page) {
    await openChart(page)
    await page.getByTestId('account-opening-balances-link').click()
    await expect(page.getByTestId('opening-balances-screen')).toBeVisible()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Dec 31, 2025" for an ISO day, as the screen's helper text formats it.
export function dayText(iso: string) {
    const [year, month, day] = iso.split('-').map(Number)
    return `${MONTHS[month - 1]} ${day}, ${year}`
}

export function pad(n: number) {
    return String(n).padStart(2, '0')
}

// Last day of the previous fiscal year (seed fiscal_year_start_month is 1).
export function lastFiscalYearEnd(now = new Date()) {
    return `${now.getFullYear() - 1}-12-31`
}

// Last day of the previous calendar month.
export function lastMonthEnd(now = new Date()) {
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`
}

export const GRID_NAMES = [
    'Business Checking',
    'Accounts receivable',
    'Office Equipment',
    'Company Card',
    "Owner's Equity",
] as const

// Account ids come from the Chart of Accounts, whose rows and cards carry the
// id in their test id (`account-row-<id>` / `account-card-<id>`); the seed has
// no fixed ids, so the ids are read from the page, never from PocketBase.
// Opens the chart, reads the ids by account name, then opens Opening balances
// from the toolbar link. Every name in `names` and in `excluded` (accounts the
// grid must not list, but the chart does) must have a chart row: a missing one
// throws, so an absence assertion on a grid id cannot pass vacuously.
export async function openWithIds(
    page: Page,
    names: readonly string[] = GRID_NAMES,
    excluded: readonly string[] = []
) {
    await openChart(page)
    const prefix = isPhoneSize(page) ? 'account-card-' : 'account-row-'
    const ids: Record<string, string> = {}
    for (const name of [...names, ...excluded]) {
        const item = page.locator(`[data-testid^="${prefix}"]`).filter({ hasText: name })
        if ((await item.count()) === 0) {
            throw new Error(`Chart of Accounts has no row for "${name}"`)
        }
        const testId = await item.first().getAttribute('data-testid')
        ids[name] = (testId ?? '').slice(prefix.length)
    }
    await page.getByTestId('account-opening-balances-link').click()
    await expect(page.getByTestId('opening-balances-screen')).toBeVisible()
    return ids
}

function isPhoneSize(page: Page) {
    return (page.viewportSize()?.width ?? 1280) < 700
}

// Checkpoint 5 helpers. The draft actions (see OpeningActionBar): wide shows the
// `opening-discard` button; a phone shows the `opening-more` menu, which exists
// only for a saved draft and holds a "Discard draft" item. Both open the same
// confirm dialog, whose confirm button reads "Discard draft".
export function discardTrigger(page: Page) {
    return page.getByTestId(isPhoneSize(page) ? 'opening-more' : 'opening-discard')
}

export async function openDiscardDialog(page: Page) {
    if (isPhoneSize(page)) {
        await page.getByTestId('opening-more').click()
        await page.getByRole('menuitem', { name: 'Discard draft', exact: true }).click()
    } else {
        await page.getByTestId('opening-discard').click()
    }
    await expect(discardDraftTitle(page)).toBeVisible()
}

// Confirm dialogs are located by their visible title, which exists on both the
// wide dialog and the phone sheet (only the wide one carries a dialog role).
export function discardDraftTitle(page: Page) {
    return page.getByText('Discard this draft?', { exact: true })
}

export function discardChangesTitle(page: Page) {
    return page.getByText('Discard changes?', { exact: true })
}

// The screen's own Cancel button stays mounted behind the dialog, so the
// dialog's Cancel is the one that is not the screen's.
export function dialogCancelButton(page: Page) {
    return page
        .getByRole('button', { name: 'Cancel', exact: true })
        .and(page.locator(':not([data-testid="opening-cancel"])'))
}

export async function confirmDiscard(page: Page) {
    await page
        .getByRole('button', { name: 'Discard draft', exact: true })
        .and(page.locator(':not([data-testid="opening-discard"])'))
        .click()
    await expect(discardDraftTitle(page)).toHaveCount(0)
}

// Leaves the Opening balances screen for the Chart of Accounts through the
// header back link (no unsaved-changes prompt) unless the screen is already gone.
export async function leaveToChart(page: Page) {
    const screen = page.getByTestId('opening-balances-screen')
    if (await screen.isVisible()) await page.getByTestId('opening-back').click()
    await expect(screen).toBeHidden()
    await expect(page.getByTestId('account-search')).toBeVisible()
}

// Account ids by name from the Chart of Accounts, which must be open. A missing
// name throws, so an absence assertion on an id cannot pass vacuously.
export async function idsFromChart(page: Page, names: readonly string[] = GRID_NAMES) {
    const prefix = isPhoneSize(page) ? 'account-card-' : 'account-row-'
    const ids: Record<string, string> = {}
    for (const name of names) {
        const item = page.locator(`[data-testid^="${prefix}"]`).filter({ hasText: name })
        if ((await item.count()) === 0) {
            throw new Error(`Chart of Accounts has no row for "${name}"`)
        }
        const testId = await item.first().getAttribute('data-testid')
        ids[name] = (testId ?? '').slice(prefix.length)
    }
    return ids
}

export async function openFromChart(page: Page) {
    await page.getByTestId('account-opening-balances-link').click()
    await expect(page.getByTestId('opening-balances-screen')).toBeVisible()
}

// Brings the draft state to "none" and leaves the Chart of Accounts open: opens
// the screen if it is not open, discards a saved draft through the dialog, and
// goes back to the chart. The opening entry is permanent once posted, so the
// tests of this checkpoint all run before any post and end through this helper.
export async function discardExistingDraft(page: Page) {
    const screen = page.getByTestId('opening-balances-screen')
    if (!(await screen.isVisible())) {
        if (await page.getByTestId('account-search').isVisible()) await openFromChart(page)
        else await openOpeningBalances(page)
    }
    await expect(page.getByTestId('opening-body')).toBeVisible()
    const trigger = discardTrigger(page)
    if (await trigger.isVisible()) {
        await openDiscardDialog(page)
        await confirmDiscard(page)
        await expect(trigger).toHaveCount(0)
    }
    await leaveToChart(page)
}
