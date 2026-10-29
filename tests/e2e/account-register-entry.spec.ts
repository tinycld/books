import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    accountItem,
    chooseViewRegister,
    DESKTOP,
    isPhone,
    openChart,
    PHONE,
} from './account-register-helpers'

// Entry points into the register from the Chart of Accounts. Journal entry
// creation has no UI until `p1-journal-entries`, so the register has nothing
// it can create through the UI. The entries it reads are posted by `seed.ts`
// through the same draft, lines, update-to-posted sequence the app uses, via a
// superuser pb (dated relative to today, so no spec depends on the calendar). That is the seeded-fixture exception: the
// interaction under test (opening a register from the menu and the panel,
// going back) is driven through the UI; only the pre-existing ledger state is
// seeded. The spec writes nothing. It does not cover a read-only user: the
// seed has no read-only e2e user (unit tests cover newEntryVisible), so the
// New button is checked for the default writer only. All data is read through the UI.

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const REGISTER_URL = /\/accounts\/[^/?#]+$/
const ITEMS = '[data-testid^="register-row-"], [data-testid^="register-card-"]'

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
    await openChart(page)
}

async function accountId(page: Page, name: string) {
    const testId = await accountItem(page, name).first().getAttribute('data-testid')
    return (testId ?? '').replace(/^account-(row|card)-/, '')
}

async function expectRegisterOpen(page: Page, name: string) {
    await expect(page.getByTestId('register-title')).toContainText(name)
}

async function expectChart(page: Page, name: string) {
    await expect(page.getByTestId('account-search')).toBeVisible()
    await expect(accountItem(page, name).first()).toBeVisible()
}

for (const [sizeName, size] of SIZES) {
    test.describe(`account-register: entry points (${sizeName})`, () => {
        test('View register in the menu opens the register without the panel', async ({ page }) => {
            await start(page, size)
            const id = await accountId(page, 'Business Checking')
            expect(id).not.toBe('')

            await chooseViewRegister(page, 'Business Checking')
            await expectRegisterOpen(page, 'Business Checking')
            expect(new URL(page.url()).pathname).toMatch(REGISTER_URL)
            expect(new URL(page.url()).pathname.endsWith(`/accounts/${id}`)).toBe(true)

            // This month holds the entries seeded today and, unlike a fiscal range, does not
            // reload when another spec changes the fiscal start month on the shared DB.
            await page.getByTestId('register-range').click()
            await page.getByRole('menuitem', { name: 'This month', exact: true }).click()
            await expect(page.getByTestId('register-range')).toContainText('This month')
            await expect(page.locator(ITEMS).first()).toBeVisible()
            await expect(page.getByTestId('register-new-entry')).toBeVisible()
            if (isPhone(page)) {
                await expect(page.locator('[data-testid^="register-card-"]').first()).toBeVisible()
                await expect(page.locator('[data-testid^="register-row-"]')).toHaveCount(0)
            }

            await page.getByTestId('register-back').click()
            await expectChart(page, 'Business Checking')
            await expect(page.getByTestId('account-panel')).toHaveCount(0)
        })

        test('View register in the panel opens the register', async ({ page }) => {
            await start(page, size)
            await accountItem(page, 'Business Checking').first().click()
            await expect(page.getByTestId('account-panel')).toBeVisible()

            const button = page.getByTestId('account-panel-view-register')
            await expect(button).toBeVisible()
            // Layout height, not boundingBox: the drawer slides in, and a box read mid-slide
            // lands on a fractional pixel (43.9999) although the layout height is 44.
            const height = await button.evaluate(node => (node as HTMLElement).offsetHeight)
            expect(height).toBeGreaterThanOrEqual(44)

            await button.click()
            await expectRegisterOpen(page, 'Business Checking')
            expect(new URL(page.url()).pathname).toMatch(REGISTER_URL)

            await page.getByTestId('register-back').click()
            await expectChart(page, 'Business Checking')
        })

        test('a parent account says own transactions only', async ({ page }) => {
            await start(page, size)
            await chooseViewRegister(page, 'Software Subscriptions')
            await expectRegisterOpen(page, 'Software Subscriptions')
            await expect(page.getByTestId('register-parent-note')).toContainText(
                'Own transactions only'
            )
        })
    })
}

test.describe('account-register: entry points (phone drawer)', () => {
    test('a card press opens the bottom drawer and close dismisses it', async ({ page }) => {
        await start(page, PHONE)
        await chooseViewRegister(page, 'Business Checking')
        await expectRegisterOpen(page, 'Business Checking')
        await page.getByTestId('register-range').click()
        await page.getByRole('menuitem', { name: 'This month', exact: true }).click()
        await expect(page.getByTestId('register-range')).toContainText('This month')

        const card = page.locator('[data-testid^="register-card-"]').first()
        await expect(card).toBeVisible()
        await card.click()
        const drawer = page.getByTestId('register-entry-drawer')
        await expect(drawer).toBeVisible()
        await page.getByTestId('register-drawer-close').click()
        await expect(drawer).not.toBeVisible()
    })
})
