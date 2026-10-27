import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { accountItem, chooseViewRegister, DESKTOP, openChart } from './account-register-helpers'

// Entry points into the register from the Chart of Accounts, and Back out of it.
// The entries the register reads are posted by `seed.ts` through the server's
// posting hook (dated relative to today, so no spec depends on the calendar).
// That is the seeded-fixture exception: the interaction under test (opening a
// register from the menu and the panel, going back) is driven through the UI;
// only the pre-existing ledger state is seeded. The spec writes nothing.

const REGISTER_URL = /\/books\/accounts\/[^/?#]+$/
const CHART_URL = /\/books\/accounts$/

async function accountId(page: Page, name: string) {
    const testId = await accountItem(page, name).first().getAttribute('data-testid')
    return (testId ?? '').replace(/^account-(row|card)-/, '')
}

async function expectChart(page: Page, name: string) {
    await expect(page.getByTestId('account-search')).toBeVisible()
    await expect(accountItem(page, name).first()).toBeVisible()
}

test.describe('account-register: navigation', () => {
    test('the register opens from the row menu and the panel, and Back returns to the chart', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openChart(page)
        const title = page.getByTestId('register-title')

        const id = await accountId(page, 'Business Checking')
        expect(id).not.toBe('')
        await chooseViewRegister(page, 'Business Checking')
        await expect(title).toContainText('Business Checking')
        expect(new URL(page.url()).pathname.endsWith(`/accounts/${id}`)).toBe(true)

        // Back pops to the chart instead of stacking a second copy on history.
        await page.getByTestId('register-back').click()
        await expectChart(page, 'Business Checking')
        await expect(page).toHaveURL(CHART_URL)
        await expect(page.getByTestId('account-panel')).toHaveCount(0)
        await page.goBack()
        await expect(title).toHaveCount(0)
        expect(new URL(page.url()).pathname).not.toMatch(REGISTER_URL)

        // After a reload there is no chart to pop to, so Back must still reach it.
        await openChart(page)
        await chooseViewRegister(page, 'Business Checking')
        await expect(title).toBeVisible()
        await page.reload()
        await expect(title).toContainText('Business Checking')
        await page.getByTestId('register-back').click()
        await expectChart(page, 'Business Checking')
        await expect(page).toHaveURL(CHART_URL)

        await accountItem(page, 'Business Checking').first().click()
        await expect(page.getByTestId('account-panel')).toBeVisible()
        await page.getByTestId('account-panel-view-register').click()
        await expect(title).toContainText('Business Checking')
        expect(new URL(page.url()).pathname).toMatch(REGISTER_URL)
        await page.getByTestId('register-back').click()
        await expectChart(page, 'Business Checking')
    })
})
