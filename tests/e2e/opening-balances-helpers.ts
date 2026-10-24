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
