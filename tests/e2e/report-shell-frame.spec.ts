import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    ACCESS_ROUTE,
    BALANCES_ROUTE,
    DESKTOP,
    hasNoPageScrollX,
    openReportsHub,
    openTrialBalance,
    PHONE,
} from './report-shell-helpers'

// The reports hub, the report screen's frame (header, period chip, document header) and its
// loading, error and not-found states, read through the Trial Balance.
//
// Nothing here writes data: the Trial Balance reads the ledger seed.ts posts (and whatever
// other specs post), so no assertion names an amount, a total or a business name. Whether
// the Trial Balance has rows depends on the calendar date, so neither its table nor its
// empty state is asserted here. Failures are forced with `route.fulfill({ status: 400 })`.

async function heightOf(locator: Locator) {
    return (await locator.boundingBox())?.height ?? 0
}

async function widthOf(locator: Locator) {
    return (await locator.boundingBox())?.width ?? 0
}

async function topOf(page: Page, testId: string) {
    return (await page.getByTestId(testId).boundingBox())?.y ?? Number.NaN
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

// The control row is a horizontal ScrollView: its element holds one content container, whose
// children are the chips.
async function controlChipTops(page: Page) {
    return page
        .getByTestId('report-controls')
        .evaluate(el =>
            Array.from(el.firstElementChild?.children ?? []).map(chip =>
                Math.round(chip.getBoundingClientRect().top)
            )
        )
}

test.describe('report-shell: hub, frame and states', () => {
    test('hub to report and back, at desktop and phone', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await openReportsHub(page)

        const hub = page.getByTestId('report-hub')
        await expect(hub.getByText('Reports', { exact: true })).toBeVisible()
        await expect(page.locator('[data-testid^="report-hub-section-"]')).toHaveCount(1)
        await expect(page.getByTestId('report-hub-section-accountant')).toContainText(
            'For my accountant'
        )
        const row = page.getByTestId('report-hub-row-trial-balance')
        await expect(row).toContainText('Trial Balance')
        await expect(row).toContainText('Debit and credit balance of every account on a date')
        await expect.poll(() => heightOf(row)).toBeGreaterThanOrEqual(44)
        await expect(page.locator('[data-testid^="report-hub-row-"]')).toHaveCount(1)

        await row.click()
        const screen = page.getByTestId('report-screen')
        await expect(screen).toBeVisible()
        await expect(page.getByTestId('report-title')).toHaveText('Trial Balance')
        // Opening from the hub starts from the defaults, which the URL leaves out.
        expect(page.url()).toContain('/reports/trial-balance')
        expect(page.url()).not.toContain('?')

        const back = page.getByTestId('report-back')
        await expect(back).toHaveText('Reports')
        await expect.poll(() => heightOf(back)).toBeGreaterThanOrEqual(44)
        await expect(page.getByTestId('report-method')).toHaveCount(0)
        await expect(page.getByTestId('report-period')).toHaveText(
            /^End of last month · [A-Z][a-z]{2} \d{1,2}, \d{4}$/
        )
        await expect(page.getByTestId('report-document-title')).toHaveText('Trial Balance')
        await expect(page.getByTestId('report-document-period')).toHaveText(
            /^As of [A-Z][a-z]+ \d{1,2}, \d{4}$/
        )
        await expect(page.getByTestId('report-document-header')).not.toContainText('basis')
        await expect(page.getByTestId('report-thousands-note')).toHaveCount(0)
        // The settings row is shared with specs that set the business name, so the name is
        // checked only when it is drawn: it is never drawn blank.
        const businessName = page.getByTestId('report-business-name')
        if ((await businessName.count()) > 0) {
            expect((await businessName.textContent())?.trim() ?? '').not.toBe('')
        }

        await expect
            .poll(async () => {
                const [backTop, titleTop, controlsTop, documentTop] = await Promise.all([
                    topOf(page, 'report-back'),
                    topOf(page, 'report-title'),
                    topOf(page, 'report-controls'),
                    topOf(page, 'report-document-header'),
                ])
                return backTop < titleTop && titleTop < controlsTop && controlsTop < documentTop
            })
            .toBe(true)
        expect(await hasScrollingAncestor(page, 'report-title')).toBe(false)
        expect(await hasScrollingAncestor(page, 'report-controls')).toBe(false)

        await expect(page.getByTestId('report-loading')).toHaveCount(0)
        await expect(page.getByTestId('report-error')).toHaveCount(0)

        await back.click()
        await expect(hub).toBeVisible()
        await expect(screen).toHaveCount(0)

        await row.click()
        await expect(screen).toBeVisible()
        await page.goBack()
        await expect(hub).toBeVisible()
        await expect(screen).toHaveCount(0)

        await page.setViewportSize(PHONE)
        await expect(row).toBeVisible()
        await expect.poll(() => heightOf(row)).toBeGreaterThanOrEqual(44)
        await expect.poll(() => widthOf(row)).toBeGreaterThanOrEqual(300)
        await row.click()
        await expect(screen).toBeVisible()
        await expect(page.getByTestId('report-title')).toHaveText('Trial Balance')
        await expect(page.getByTestId('report-period')).toBeVisible()
        await expect
            .poll(async () => {
                const tops = await controlChipTops(page)
                return tops.length > 0 && tops.every(top => top === tops[0])
            })
            .toBe(true)
        await expect
            .poll(async () => {
                const controls = await page.getByTestId('report-controls').boundingBox()
                const documentHeader = await page
                    .getByTestId('report-document-header')
                    .boundingBox()
                if (!controls || !documentHeader) return false
                return documentHeader.y >= controls.y + controls.height - 1
            })
            .toBe(true)
        await expect.poll(() => hasNoPageScrollX(page)).toBe(true)
    })

    test('loading, error and retry, at desktop and phone', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)

        let release = () => {}
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await page.route(BALANCES_ROUTE, async route => {
            await held
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: '{"message":"held"}',
            })
        })

        await openTrialBalance(page)
        // The frame stays while the figures load.
        await expect(page.getByTestId('report-loading')).toBeVisible()
        await expect(page.getByTestId('report-title')).toBeVisible()
        await expect(page.getByTestId('report-period')).toBeVisible()
        await expect(page.getByTestId('report-document-header')).toBeVisible()

        release()
        const alert = page.getByRole('alert').filter({ hasText: 'Could not load this report' })
        await expect(alert).toBeVisible()
        const retry = page.getByTestId('report-retry')
        await expect(retry).toBeVisible()
        await expect.poll(() => heightOf(retry)).toBeGreaterThanOrEqual(44)

        await page.setViewportSize(PHONE)
        await expect(alert).toBeVisible()
        await expect(retry).toBeVisible()
        await expect.poll(() => heightOf(retry)).toBeGreaterThanOrEqual(44)

        await page.unroute(BALANCES_ROUTE)
        await retry.click()
        await expect(alert).toHaveCount(0)
        await expect(page.getByTestId('report-loading')).toHaveCount(0)
    })

    test('unknown and unavailable report, and the hub access error, at desktop and phone', async ({
        page,
    }) => {
        await login(page, { startAt: '/a/books/reports/no-such-report' })
        const notFound = page.getByTestId('report-not-found')
        await expect(notFound).toHaveText('This report does not exist')
        await expect(page.getByTestId('report-back')).toBeVisible()
        await expect(page.getByTestId('report-period')).toHaveCount(0)
        await expect(page.getByTestId('report-document-header')).toHaveCount(0)

        // A registry entry that is not available reads as not found too.
        const second = await page.context().newPage()
        await login(second, { startAt: '/a/books/reports/profit-and-loss' })
        await expect(second.getByTestId('report-not-found')).toHaveText(
            'This report does not exist'
        )
        await second.close()

        await page.setViewportSize(PHONE)
        await expect(notFound).toBeVisible()
        await expect(notFound).toHaveText('This report does not exist')
        await expect.poll(() => hasNoPageScrollX(page)).toBe(true)
        await page.getByTestId('report-back').click()
        await expect(page.getByTestId('report-hub')).toBeVisible()

        // Every Books screen reads the same books_access subset, so once a page has loaded it
        // a route added later never reaches it. A fresh page of the same context starts with
        // an empty store, and the context's session keeps it signed in.
        const third = await page.context().newPage()
        await third.setViewportSize(DESKTOP)
        await third.route(ACCESS_ROUTE, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: '{"message":"access"}',
            })
        )
        await login(third, { startAt: '/a/books/reports' })
        const hubAlert = third.getByRole('alert').filter({ hasText: 'Could not load reports' })
        await expect(hubAlert).toBeVisible()
        await expect(third.getByTestId('report-hub-error')).toBeVisible()
        await expect(third.getByTestId('report-hub-empty')).toHaveCount(0)
        await expect(third.locator('[data-testid^="report-hub-section-"]')).toHaveCount(0)
        const hubRetry = third.getByTestId('report-hub-retry')
        await expect.poll(() => heightOf(hubRetry)).toBeGreaterThanOrEqual(44)

        await third.setViewportSize(PHONE)
        await expect(hubAlert).toBeVisible()
        await expect(hubRetry).toBeVisible()
        await expect.poll(() => heightOf(hubRetry)).toBeGreaterThanOrEqual(44)
        await expect.poll(() => hasNoPageScrollX(third)).toBe(true)

        await third.unroute(ACCESS_ROUTE)
        await hubRetry.click()
        await expect(third.getByTestId('report-hub-error')).toHaveCount(0)
        await expect(third.getByTestId('report-hub-section-accountant')).toContainText(
            'For my accountant'
        )
        await third.close()
    })
})
