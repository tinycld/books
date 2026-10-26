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
