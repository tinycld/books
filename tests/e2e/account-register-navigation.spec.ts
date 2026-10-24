import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    accountItem,
    chooseViewRegister,
    DESKTOP,
    isPhone,
    openChart,
    openRegister,
    PHONE,
} from './account-register-helpers'

// Navigation and title edge cases of the register. Journal entry creation has
// no UI until `p1-journal-entries`; this spec reads the seeded ledger through
// the UI and writes only the one number-less account it creates and deletes
// through the UI. It does not cover a live post or a read-only user (see
// account-register-states.spec.ts).

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const REGISTER_URL = /\/books\/accounts\/[^/?#]+/

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

for (const [sizeName, size] of SIZES) {
    test.describe(`account-register: navigation (${sizeName})`, () => {
        test('Back pops to the Chart of Accounts instead of stacking history', async ({ page }) => {
            await start(page, size)
            await openRegister(page, 'Business Checking')
            await expect(page.getByTestId('register-title')).toBeVisible()
            await page.getByTestId('register-back').click()
            await expect(page.getByTestId('account-search')).toBeVisible()
            await expect(page).toHaveURL(/\/books\/accounts$/)

            await page.goBack()
            await expect(page.getByTestId('register-title')).toHaveCount(0)
            expect(page.url()).not.toMatch(REGISTER_URL)
        })

        test('Back works after reloading the register page', async ({ page }) => {
            await start(page, size)
            await openRegister(page, 'Business Checking')
            await expect(page.getByTestId('register-title')).toBeVisible()
            await page.reload()
            await expect(page.getByTestId('register-title')).toContainText('Business Checking')
            await page.getByTestId('register-back').click()
            await expect(page.getByTestId('account-search')).toBeVisible()
            await expect(page).toHaveURL(/\/books\/accounts$/)
        })

        test('an account without a number shows just its name in the title', async ({ page }) => {
            await start(page, size)
            const name = `E2E No Number ${Date.now()}`
            await openChart(page)
            await page
                .getByTestId(isPhone(page) ? 'account-new-header' : 'account-new-toolbar')
                .click()
            const panel = page.getByTestId('account-panel')
            await expect(panel).toBeVisible()
            await page.getByLabel('Account name').fill(name)
            await panel.getByTestId('account-type').click()
            await page.getByRole('menuitem', { name: 'Income', exact: true }).click()
            await panel.getByTestId('account-detail-type').click()
            await page.getByRole('menuitem', { name: 'Service income', exact: true }).click()
            await panel.getByRole('button', { name: 'Save', exact: true }).click()
            await expect(accountItem(page, name)).toBeVisible()

            await chooseViewRegister(page, name)
            const title = page.getByTestId('register-title')
            await expect(title).toContainText(name)
            const lines = (await title.innerText()).split('\n').map(line => line.trim())
            expect(lines[0]).toBe(name)
            expect(lines.filter(Boolean)).toHaveLength(2)

            await openChart(page)
            await accountItem(page, name).locator('[data-testid^="account-menu-"]').click()
            await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
            await page.getByRole('button', { name: 'Delete', exact: true }).click()
            await expect(accountItem(page, name)).toHaveCount(0)
        })
    })
}
