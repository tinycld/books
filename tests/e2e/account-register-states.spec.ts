import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    accountItem,
    chooseViewRegister,
    createIncomeAccount,
    DESKTOP,
    openChart,
    openRegister,
} from './account-register-helpers'

// Journal entry creation has no UI until `p1-journal-entries`, so the register
// has nothing it can create through the UI. The entries it reads are posted by
// `seed.ts` through the server's posting hook (dated relative to today, so the
// spec never depends on the calendar). The spec writes nothing except the one
// account it creates and deletes through the UI in the not-found test.
//
// It does not cover a live post appearing in an open register (covered by
// `tests/register-realtime.test.ts`) or a read-only user (the seed has no
// read-only Books member; the New button gating is covered by `newEntryVisible`
// in `tests/register-state.test.ts` and the panel button by
// `account-menu-panel.test.tsx`). All data is read through the UI.

const JOURNAL_LINES = '**/api/collections/books_journal_lines/records*'
const MONEY = /\$[\d,]+\.\d{2}/

async function start(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

test.describe('account-register: header and states', () => {
    test("the header shows the account's number, name, type and detail, and the parent and inactive labels only when they apply", async ({
        page,
    }) => {
        await start(page)
        await openRegister(page, 'Business Checking')

        const title = page.getByTestId('register-title')
        await expect(title).toContainText('1000')
        await expect(title).toContainText('Business Checking')
        await expect(title).toContainText('Bank')
        await expect(title).toContainText('Checking')
        await expect(page.getByTestId('register-range')).toContainText('This month')
        await expect(page.getByTestId('register-new-entry')).toBeVisible()
        await expect(page.getByTestId('register-parent-note')).toHaveCount(0)
        await expect(page.getByTestId('register-inactive')).toHaveCount(0)

        await openRegister(page, 'Software Subscriptions')
        await expect(page.getByTestId('register-parent-note')).toContainText(
            'Own transactions only'
        )
        await openRegister(page, 'Old Petty Cash')
        await expect(page.getByTestId('register-inactive')).toContainText('Inactive')
    })

    test('an empty range keeps the opening balance and offers the fiscal year', async ({
        page,
    }) => {
        await start(page)
        // Every posted line on Software Subscriptions is dated today, which is inside This
        // fiscal year for any start month. books-settings.spec.ts and the setup wizard spec
        // change the start month on the shared DB, and that moves Business Checking's
        // entries at the January fiscal start into Last fiscal year.
        await openRegister(page, 'Software Subscriptions')

        await page.getByTestId('register-range').click()
        await page.getByRole('menuitem', { name: 'Last fiscal year', exact: true }).click()
        await expect(page.getByTestId('register-range')).toContainText('Last fiscal year')

        const empty = page.getByTestId('register-empty-range')
        await expect(empty).toContainText('No transactions in this range')
        const opening = await page.getByTestId('register-opening-balance').innerText()
        await expect(page.getByTestId('register-ending-balance')).toHaveText(opening)
        await page.getByTestId('register-show-fiscal-year').click()
        await expect(page.getByTestId('register-range')).toContainText('This fiscal year')
        await expect(empty).toHaveCount(0)
    })

    test('an account with only a draft entry shows the empty state', async ({ page }) => {
        await start(page)
        await openRegister(page, 'Design Tools')
        await expect(page.getByTestId('register-empty')).toContainText('No transactions yet')
        await expect(page.getByTestId('register-new-entry')).toBeVisible()
    })

    test('shows the loading state while journal lines are held', async ({ page }) => {
        await start(page)
        let release: () => void = () => {}
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await openChart(page)
        await page.route(JOURNAL_LINES, async route => {
            await held
            await route.continue()
        })
        await chooseViewRegister(page, 'Business Checking')
        await expect(page.getByTestId('register-loading')).toBeVisible()
        await expect(page.getByTestId('register-title')).toContainText('Business Checking')
        release()
        await expect(page.getByTestId('register-loading')).toHaveCount(0)
    })

    test('shows an error and recovers on Retry', async ({ page }) => {
        await start(page)
        await openChart(page)
        await page.route(JOURNAL_LINES, route =>
            route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
        )
        await chooseViewRegister(page, 'Business Checking')

        const alert = page.getByRole('alert').filter({ hasText: 'Could not load this register' })
        await expect(alert).toBeVisible()

        await page.unroute(JOURNAL_LINES)
        await page.getByTestId('register-retry').click()
        await expect(alert).toHaveCount(0)
        await expect(page.getByTestId('register-ending-balance')).toHaveText(MONEY)
    })

    test('a number-less account shows just its name, then not found after it is deleted elsewhere', async ({
        page,
        context,
    }) => {
        await start(page)
        const name = `E2E Register Gone ${Date.now()}`
        await openChart(page)
        await createIncomeAccount(page, name)
        await chooseViewRegister(page, name)
        const title = page.getByTestId('register-title')
        await expect(title).toContainText(name)
        const lines = (await title.innerText()).split('\n').map(line => line.trim())
        expect(lines[0]).toBe(name)
        expect(lines.filter(Boolean)).toHaveLength(2)

        const other = await context.newPage()
        await start(other)
        await openChart(other)
        await accountItem(other, name).locator('[data-testid^="account-menu-"]').click()
        await other.getByRole('menuitem', { name: 'Delete', exact: true }).click()
        await other.getByRole('button', { name: 'Delete', exact: true }).click()
        await expect(accountItem(other, name)).toHaveCount(0)

        await expect(page.getByTestId('register-not-found')).toContainText(
            'This account does not exist'
        )
        await expect(page.getByTestId('register-back')).toBeVisible()
        await expect(page.locator('[data-testid^="register-row-"]')).toHaveCount(0)
        await expect(page.locator('[data-testid^="register-card-"]')).toHaveCount(0)
        await page.getByTestId('register-back').click()
        await expect(page.getByTestId('account-search')).toBeVisible()
    })
})
