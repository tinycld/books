import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { openChart } from './account-register-helpers'
import {
    DESKTOP,
    dayText,
    lastFiscalYearEnd,
    lastMonthEnd,
    openOpeningBalances,
    PHONE,
} from './opening-balances-helpers'

// All opening-balances e2e live in this one file: the feature has one entry per
// database and tests in one file run in file order in one worker.
//
// Checkpoint 2 (states, header and date). The read-only test fulfils the real
// books_access response with level read_only, because the seed has no read-only
// Books member. It covers the client layout only; server enforcement stays
// covered by the Go tests. The loading, empty-chart and error tests hold or
// replace the books_accounts read. They reload the page on the opened screen so
// the accounts query is not already served from rows the Chart of Accounts
// loaded; the reload keeps the route, so nothing is navigated with page.goto.
// Nothing is written.

const ACCOUNTS = '**/api/collections/books_accounts/records*'
const ACCESS = '**/api/collections/books_access/records*'
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

async function choosePreset(page: Page, label: string) {
    await page.getByTestId('opening-preset').click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
}

async function helperText(page: Page) {
    const helper = page.getByTestId('opening-date-helper')
    return (await helper.count()) ? helper.innerText() : ''
}

for (const [sizeName, size] of SIZES) {
    test.describe(`opening-balances: states, header and date (${sizeName})`, () => {
        test('the header shows the back link, title, explanation and help icon', async ({
            page,
        }) => {
            await start(page, size)
            await openOpeningBalances(page)

            const screen = page.getByTestId('opening-balances-screen')
            await expect(page.getByTestId('opening-back')).toContainText('Chart of Accounts')
            await expect(screen.getByText('Opening balances', { exact: true })).toBeVisible()
            await expect(
                screen.getByText(
                    'Enter what each account held at the end of your starting date. Books posts one journal entry and balances it with Opening Balance Equity.'
                )
            ).toBeVisible()
            await expect(page.getByTestId('opening-help')).toBeVisible()

            await page.getByTestId('opening-back').click()
            await expect(page.getByTestId('account-search')).toBeVisible()
        })

        test('the date block defaults, follows presets and keeps a typed memo', async ({
            page,
        }) => {
            await start(page, size)
            await openOpeningBalances(page)

            const yearEnd = lastFiscalYearEnd()
            await expect(page.getByTestId('opening-preset')).toContainText(
                'End of last fiscal year'
            )
            await expect(page.getByTestId('opening-date')).toHaveValue(yearEnd)
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                `Balances at end of day ${dayText(yearEnd)}`
            )
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                `Opening balances as of ${dayText(yearEnd)}`
            )

            const monthEnd = lastMonthEnd()
            await choosePreset(page, 'End of last month')
            await expect(page.getByTestId('opening-preset')).toContainText('End of last month')
            await expect(page.getByTestId('opening-date')).toHaveValue(monthEnd)
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                `Balances at end of day ${dayText(monthEnd)}`
            )
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                `Opening balances as of ${dayText(monthEnd)}`
            )

            await page.getByTestId('opening-date').fill('2025-6-1')
            await expect.poll(() => helperText(page)).toBe('')
            await expect(page.getByText('Invalid Date')).toHaveCount(0)

            await page.getByTestId('opening-date').fill('2025-06-01')
            await expect(page.getByTestId('opening-preset')).toContainText('Custom date')
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                'Balances at end of day Jun 1, 2025'
            )

            await page.getByTestId('opening-memo').fill('Converted from the old books')
            await page.getByTestId('opening-date').fill('2025-07-01')
            await expect(page.getByTestId('opening-date-helper')).toHaveText(
                'Balances at end of day Jul 1, 2025'
            )
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                'Converted from the old books'
            )

            await page.getByTestId('opening-memo').fill('')
            await expect(page.getByTestId('opening-memo')).toHaveValue(
                'Opening balances as of Jul 1, 2025'
            )
        })

        test('shows the loading state with the header while accounts are held', async ({
            page,
        }) => {
            await start(page, size)
            await openOpeningBalances(page)
            let release: () => void = () => {}
            const held = new Promise<void>(resolve => {
                release = resolve
            })
            await page.route(ACCOUNTS, async route => {
                await held
                await route.continue()
            })
            await page.reload()

            await expect(page.getByTestId('opening-loading')).toBeVisible()
            await expect(page.getByTestId('opening-back')).toBeVisible()
            await expect(page.getByTestId('opening-date')).toHaveCount(0)
            release()
            await expect(page.getByTestId('opening-date')).toBeVisible()
            await expect(page.getByTestId('opening-loading')).toHaveCount(0)
            await page.unrouteAll({ behavior: 'ignoreErrors' })
        })

        test('an empty chart shows the empty state and a link to the chart', async ({ page }) => {
            await start(page, size)
            await openOpeningBalances(page)
            await page.route(ACCOUNTS, route =>
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        page: 1,
                        perPage: 500,
                        totalItems: 0,
                        totalPages: 0,
                        items: [],
                    }),
                })
            )
            await page.reload()

            const empty = page.getByTestId('opening-empty')
            await expect(empty).toContainText('No accounts to enter balances for')
            await empty.getByText('Go to Chart of Accounts').click()
            // The empty-accounts route is still active, so the Chart of Accounts
            // screen shows its own empty state instead of the toolbar.
            await expect(page.getByTestId('accounts-empty')).toBeVisible()
            await expect(page.getByTestId('opening-empty')).toBeHidden()
            await page.unrouteAll({ behavior: 'ignoreErrors' })
        })

        test('shows an error and recovers on Retry', async ({ page }) => {
            await start(page, size)
            await openOpeningBalances(page)
            await page.route(ACCOUNTS, route =>
                route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
            )
            await page.reload()

            const alert = page
                .getByRole('alert')
                .filter({ hasText: 'Could not load opening balances' })
            await expect(alert).toBeVisible()
            await expect(page.getByTestId('opening-error')).toBeVisible()
            await expect(page.getByTestId('opening-retry')).toBeVisible()

            await page.unroute(ACCOUNTS)
            await page.getByTestId('opening-retry').click()
            await expect(page.getByTestId('opening-date')).toBeVisible()
            await expect(page.getByTestId('opening-error')).toHaveCount(0)
            await page.unrouteAll({ behavior: 'ignoreErrors' })
        })

        test('a read-only user sees the no-entry message and no date block or actions', async ({
            page,
        }) => {
            await start(page, size)
            await openChart(page)
            await page.route(ACCESS, async route => {
                const response = await route.fetch()
                const body = await response.json()
                const items = (body.items ?? []).map((item: Record<string, unknown>) => ({
                    ...item,
                    level: 'read_only',
                    can_read: true,
                    can_write: false,
                }))
                await route.fulfill({ response, json: { ...body, items } })
            })
            await page.reload()

            const link = page.getByTestId('account-opening-balances-link')
            await expect(link).toBeVisible()
            await link.click()
            await expect(page.getByTestId('opening-balances-screen')).toBeVisible()
            await expect(page.getByTestId('opening-no-entry')).toContainText(
                'No opening balances have been entered.'
            )
            await expect(page.getByTestId('opening-date')).toHaveCount(0)
            await expect(page.getByTestId('opening-preset')).toHaveCount(0)
            // Vacuous until checkpoint 5 builds these ids; re-asserted there.
            await expect(page.getByTestId('opening-save')).toHaveCount(0)
            await expect(page.getByTestId('opening-post')).toHaveCount(0)
            await page.unrouteAll({ behavior: 'ignoreErrors' })
        })

        test('the Chart of Accounts link is visible to a writer', async ({ page }) => {
            await start(page, size)
            await openChart(page)
            await expect(page.getByTestId('account-opening-balances-link')).toBeVisible()
        })
    })
}
