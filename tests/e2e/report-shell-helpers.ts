import { expect, type Page } from '@playwright/test'

// Shared by the report-shell e2e specs.
//
// The report shell writes nothing, and these specs write nothing. The Trial Balance
// reads the ledger that `seed.ts` already posts (and whatever other specs post on the
// shared database), so no assertion names an amount, a total or a business name. A
// forced failure answers 400 through `page.route` (`route.fulfill({ status: 400 })`):
// pbtsdb reports no error for a network failure, so `route.abort()` never shows one.

export { DESKTOP, PHONE } from './account-register-helpers'

export const TABLET = { width: 900, height: 800 }

export const BALANCES_ROUTE = '**/api/collections/books_account_balances/records*'
export const ACCESS_ROUTE = '**/api/collections/books_access/records*'

// Books is already open (login and navigateToPackage(page, 'books') at the desktop
// viewport). Reports is a top-group sidebar item, visible on every Books route on desktop.
export async function openReportsHub(page: Page): Promise<void> {
    await page.getByTestId('books-nav-reports').click()
    await expect(page.getByTestId('report-hub')).toBeVisible()
}

export async function openTrialBalance(page: Page): Promise<void> {
    await openReportsHub(page)
    await page.getByTestId('report-hub-row-trial-balance').click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page.getByTestId('report-title')).toHaveText('Trial Balance')
}

export async function hasNoPageScrollX(page: Page): Promise<boolean> {
    return page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
}

// Opens the period control, presses one preset pill and waits until the popover (or the
// phone sheet) is gone: picking a preset applies at once and closes it.
export async function choosePreset(page: Page, presetId: string): Promise<void> {
    const popover = page.getByTestId('report-period-popover')
    await page.getByTestId('report-period').click()
    await expect(popover).toBeVisible()
    await page.getByTestId(`report-period-preset-${presetId}`).click()
    await expect(popover).toHaveCount(0)
}

// Types into the "As of" field, opening the period control first when it is closed. Editing a
// date keeps the popover open, so the inline error stays in view.
export async function setAsOfDate(page: Page, value: string): Promise<void> {
    const popover = page.getByTestId('report-period-popover')
    if ((await popover.count()) === 0) {
        await page.getByTestId('report-period').click()
        await expect(popover).toBeVisible()
    }
    await page.getByTestId('report-period-as-of').fill(value)
}
