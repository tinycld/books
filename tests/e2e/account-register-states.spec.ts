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
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

async function fontSize(page: Page, testId: string) {
    return page.getByTestId(testId).evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))
}

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(page: Page, testId: string): Promise<Box> {
    const box = await page.getByTestId(testId).boundingBox()
    if (!box) throw new Error(`${testId} has no layout box`)
    return box
}

function overlapX(a: Box, b: Box) {
    return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
}

async function hasScrollingAncestor(page: Page, testId: string) {
    return page.getByTestId(testId).evaluate(el => {
        for (let node = el.parentElement; node; node = node.parentElement) {
            const overflowY = getComputedStyle(node).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') return true
        }
        return false
    })
}

async function createAccount(page: Page, name: string) {
    await page.getByTestId(isPhone(page) ? 'account-new-header' : 'account-new-toolbar').click()
    const panel = page.getByTestId('account-panel')
    await expect(panel).toBeVisible()
    await page.getByLabel('Account name').fill(name)
    await panel.getByTestId('account-type').click()
    await page.getByRole('menuitem', { name: 'Income', exact: true }).click()
    await panel.getByTestId('account-detail-type').click()
    await page.getByRole('menuitem', { name: 'Service income', exact: true }).click()
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(accountItem(page, name)).toBeVisible()
}

for (const [sizeName, size] of SIZES) {
    test.describe(`account-register: header and states (${sizeName})`, () => {
        test('header shows the title, balances and range, and no New button', async ({ page }) => {
            await start(page, size)
            await openRegister(page, 'Business Checking')

            const title = page.getByTestId('register-title')
            await expect(title).toContainText('1000')
            await expect(title).toContainText('Business Checking')
            await expect(title).toContainText('Bank')
            await expect(title).toContainText('Checking')
            await expect(page.getByTestId('register-range')).toContainText('This month')
            await expect(page.getByTestId('register-balance-through')).toHaveText(
                /through [A-Z][a-z]{2} \d{1,2}, \d{4}/
            )
            await expect(page.getByTestId('register-opening-balance')).toHaveText(MONEY)
            await expect(page.getByTestId('register-ending-balance')).toHaveText(MONEY)
            expect(await fontSize(page, 'register-ending-balance')).toBeGreaterThan(
                await fontSize(page, 'register-opening-balance')
            )

            const opening = await boxOf(page, 'register-opening-balance')
            const ending = await boxOf(page, 'register-ending-balance')
            const through = await boxOf(page, 'register-balance-through')
            expect(through.y).toBeGreaterThanOrEqual(ending.y + ending.height)
            expect(overlapX(through, ending)).toBeGreaterThan(overlapX(through, opening))
            expect(overlapX(through, opening)).toBe(0)

            await expect(page.getByTestId('register-back')).toBeVisible()
            const back = await page.getByTestId('register-back').boundingBox()
            expect(back?.height ?? 0).toBeGreaterThanOrEqual(44)
            await expect(page.getByTestId('register-new-entry')).toHaveCount(0)
            await expect(page.getByTestId('register-parent-note')).toHaveCount(0)
            await expect(page.getByTestId('register-inactive')).toHaveCount(0)
            expect(await hasScrollingAncestor(page, 'register-title')).toBe(false)
        })

        test('a parent account says own transactions only and an inactive one is labelled', async ({
            page,
        }) => {
            await start(page, size)
            await openRegister(page, 'Software Subscriptions')
            await expect(page.getByTestId('register-parent-note')).toContainText(
                'Own transactions only'
            )
            await openRegister(page, 'Old Petty Cash')
            await expect(page.getByTestId('register-inactive')).toContainText('Inactive')
        })

        test('range select offers five presets and Last fiscal year is empty', async ({ page }) => {
            await start(page, size)
            await openRegister(page, 'Business Checking')

            const presets = [
                'This month',
                'Last month',
                'This quarter',
                'This fiscal year',
                'Last fiscal year',
            ]
            for (const label of presets) {
                await page.getByTestId('register-range').click()
                await page.getByRole('menuitem', { name: label, exact: true }).click()
                await expect(page.getByTestId('register-range')).toContainText(label)
                await expect(page.getByTestId('register-balance-through')).toBeVisible()
            }

            const empty = page.getByTestId('register-empty-range')
            await expect(empty).toContainText('No transactions in this range')
            const opening = await page.getByTestId('register-opening-balance').innerText()
            await expect(page.getByTestId('register-ending-balance')).toHaveText(opening)
            await expect(page.getByTestId('register-show-fiscal-year')).toBeVisible()
            await page.getByTestId('register-show-fiscal-year').click()
            await expect(page.getByTestId('register-range')).toContainText('This fiscal year')
            await expect(empty).toHaveCount(0)
        })

        test('an account with only a draft entry shows the empty state', async ({ page }) => {
            await start(page, size)
            await openRegister(page, 'Design Tools')
            const empty = page.getByTestId('register-empty')
            await expect(empty).toContainText('No transactions yet')
            await expect(empty).toContainText('Transactions appear here once journal entries')
            await expect(page.getByTestId('register-new-entry')).toHaveCount(0)
        })

        test('shows the loading state while journal lines are held', async ({ page }) => {
            await start(page, size)
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
            await start(page, size)
            await openChart(page)
            await page.route(JOURNAL_LINES, route =>
                route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
            )
            await chooseViewRegister(page, 'Business Checking')

            const alert = page
                .getByRole('alert')
                .filter({ hasText: 'Could not load this register' })
            await expect(alert).toBeVisible()
            const retry = await page.getByTestId('register-retry').boundingBox()
            expect(retry?.height ?? 0).toBeGreaterThanOrEqual(44)

            await page.unroute(JOURNAL_LINES)
            await page.getByTestId('register-retry').click()
            await expect(alert).toHaveCount(0)
            await expect(page.getByTestId('register-ending-balance')).toHaveText(MONEY)
        })

        test('shows not found after the account is deleted elsewhere', async ({
            page,
            context,
        }) => {
            await start(page, size)
            const name = `E2E Register Gone ${Date.now()}`
            await openChart(page)
            await createAccount(page, name)
            await chooseViewRegister(page, name)
            await expect(page.getByTestId('register-title')).toContainText(name)

            const other = await context.newPage()
            await start(other, size)
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
}

test.describe('account-register: header on a phone', () => {
    test('the header stacks and the page does not scroll sideways', async ({ page }) => {
        await start(page, PHONE)
        expect(isPhone(page)).toBe(true)
        await openRegister(page, 'Business Checking')
        await expect(page.getByTestId('register-title')).toBeVisible()

        const tops: number[] = []
        for (const id of [
            'register-back',
            'register-title',
            'register-ending-balance',
            'register-range',
        ]) {
            const box = await page.getByTestId(id).boundingBox()
            tops.push(box?.y ?? Number.NaN)
        }
        for (let i = 1; i < tops.length; i++) {
            expect(tops[i]).toBeGreaterThan(tops[i - 1])
        }
        const noSideScroll = await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
        expect(noSideScroll).toBe(true)
    })
})
