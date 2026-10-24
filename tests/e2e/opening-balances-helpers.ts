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
