import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'
import {
    centsOf,
    dashboardScreen,
    failPrefsRead,
    failPrefsWrite,
    hideAmountsSwitch,
    MASK,
    MONEY,
    openDashboard,
    prefsWrite,
    readDueTotals,
    resetDashboardPrefs,
    sumOfBalances,
    widget,
} from './dashboard-helpers'
import { openOtherBooksPage } from './journal-entries-helpers'
import { customerWithInvoices, localDay } from './receive-payment-helpers'
import { holdLoads, openBooks, refusalToast } from './record-form-helpers'

// The dashboard (dashboard checkpoint 2): Books lands on it, the grid follows the page's
// width, the Invoices widget follows the ledger live and through its load states, and the
// one saved preference (Hide amounts here) loads, fails and saves. The preference is one
// row of the one shared test user, so all dashboard tests are in this file (one worker,
// in order) and each ends by restoring the default arrangement through the UI.

function invoicesPart(page: Page, part: string): Locator {
    return widget(page, 'invoices').getByTestId(`dashboard-invoices-${part}`)
}

async function openBooksDashboard(page: Page) {
    await openBooks(page, DESKTOP)
    await openDashboard(page)
}

// The widths of the Invoices card and of the grid, after a resize has settled.
async function cardShare(page: Page): Promise<number> {
    const [card, grid] = await Promise.all([
        widget(page, 'invoices').boundingBox(),
        dashboardScreen(page).getByTestId('dashboard-grid').boundingBox(),
    ])
    if (!card || !grid || grid.width === 0) return Number.NaN
    return card.width / grid.width
}

async function expectNoSidewaysScroll(page: Page) {
    const pageScroll = await page.evaluate(() => {
        const root = document.scrollingElement
        return root ? [root.scrollWidth, root.clientWidth] : [0, 0]
    })
    expect(pageScroll[0]).toBe(pageScroll[1])
    const gridScroll = await dashboardScreen(page)
        .getByTestId('dashboard-grid')
        .evaluate(el => [el.scrollWidth, el.clientWidth])
    expect(gridScroll[0]).toBe(gridScroll[1])
}

// Each step's card share settles into its range: the poll reads the box again until the
// layout of the new width has landed.
async function expectCardShareAt(page: Page, width: number, inRange: (share: number) => boolean) {
    await page.setViewportSize({ width, height: DESKTOP.height })
    await expect(widget(page, 'invoices')).toBeVisible()
    await expect
        .poll(async () => inRange(await cardShare(page)), { message: `at ${width}` })
        .toBe(true)
    await expectNoSidewaysScroll(page)
}

// The columns follow the page's own width (the visible dashboard screen beside the
// sidebar), not the window's: this asserts that width before a step reads the card share.
async function expectPageWidthAt(page: Page, width: number, atLeast: number) {
    await page.setViewportSize({ width, height: DESKTOP.height })
    await expect
        .poll(async () => (await dashboardScreen(page).boundingBox())?.width ?? 0, {
            message: `page width at ${width}`,
        })
        .toBeGreaterThanOrEqual(atLeast)
}

// A future due day with no row in the view yet, so the new invoice makes its own row.
async function freeDueDay(page: Page, taken: ReadonlySet<string>): Promise<string> {
    for (let offset = 400 + Math.floor(Math.random() * 400); ; offset++) {
        const day = await localDay(page, offset)
        if (!taken.has(day)) return day
    }
}

test.describe('dashboard: page and invoices', () => {
    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'ignoreErrors' })
        await resetDashboardPrefs(page)
    })

    test('Books opens on the dashboard, its grid follows the page width, and its links are real', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        await expect(page).toHaveURL(/\/books\/dashboard$/)
        await expect(dashboardScreen(page).getByText('Dashboard', { exact: true })).toBeVisible()
        await expect
            .poll(() =>
                page
                    .getByTestId('package-sidebar-mounted')
                    .locator('[data-testid^="books-nav-"]')
                    .first()
                    .getAttribute('data-testid')
            )
            .toBe('books-nav-dashboard')

        // Each width's range excludes the one before it, so a poll cannot pass on the
        // layout of the previous width before the new one lands.
        await expectCardShareAt(page, 1600, share => share < 0.36)
        await expectCardShareAt(page, 1280, share => share > 0.45 && share < 0.52)
        await expectPageWidthAt(page, 1440, 1100)
        await expectCardShareAt(page, 1440, share => share < 0.36)
        await expectCardShareAt(page, 900, share => share > 0.9)

        await page.setViewportSize(DESKTOP)
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)
        await expect(invoicesPart(page, 'view')).toHaveAttribute('href', /\/books\/invoices$/)
        const aging = invoicesPart(page, 'aging')
        if ((await aging.count()) > 0) await expect(aging).toHaveAttribute('href', /\/reports\//)
        const deposit = invoicesPart(page, 'deposit')
        if ((await deposit.count()) > 0) {
            expect(await deposit.evaluate(el => el.tagName)).toBe('A')
            await expect(deposit).toHaveAttribute('href', /\/books\/deposits\/new$/)
        }
    })

    test('a posted invoice moves Unpaid with no reload', async ({ page }) => {
        await openBooksDashboard(page)
        const unpaid = invoicesPart(page, 'unpaid')
        await expect(unpaid).toHaveText(MONEY)

        const before = await readDueTotals(page)
        const dueDate = await freeDueDay(page, new Set(before.map(row => row.due_date)))
        expect(before.some(row => row.due_date === dueDate)).toBe(false)

        const other = await openOtherBooksPage(page, ['customers'])
        await customerWithInvoices(other, [{ rate: '137.00', dueDate }], 'Dashboard payer')
        await other.close()

        // The view and the widget are read together on each poll: the other worker posts
        // and pays invoices too, so only the relation between the two is asserted.
        await expect
            .poll(async () => {
                const sum = sumOfBalances(await readDueTotals(page))
                return centsOf(await unpaid.innerText()) - sum
            })
            .toBe(0)
        await expect
            .poll(async () => {
                const sum = sumOfBalances(await readDueTotals(page))
                const overdue = centsOf(await invoicesPart(page, 'overdue').innerText())
                const notDue = centsOf(await invoicesPart(page, 'not-due').innerText())
                return overdue + notDue - sum
            })
            .toBe(0)
        const after = await readDueTotals(page)
        expect(after.some(row => row.due_date === dueDate)).toBe(true)
    })

    test('Hide amounts masks the figures and is saved', async ({ page }) => {
        await openBooksDashboard(page)
        const toggle = hideAmountsSwitch(page)
        await expect(toggle).toBeEnabled()
        await expect(toggle).not.toBeChecked()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)

        const saved = prefsWrite(page)
        await toggle.click()
        await saved
        await expect(toggle).toBeChecked()
        for (const part of ['unpaid', 'overdue', 'not-due', 'paid']) {
            await expect(invoicesPart(page, part)).toHaveText(MASK)
        }
        await expect(invoicesPart(page, 'bar')).toHaveCount(1)
        const overdueCount = invoicesPart(page, 'overdue-count')
        if ((await overdueCount.count()) > 0) {
            await expect(overdueCount).toHaveText(/^\d+ overdue invoices?$/)
        }

        await page.reload()
        await openDashboard(page)
        await expect(hideAmountsSwitch(page)).toBeChecked()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MASK)
        await expect(invoicesPart(page, 'paid')).toHaveText(MASK)

        await expect(hideAmountsSwitch(page)).toBeEnabled()
        const shown = prefsWrite(page)
        await hideAmountsSwitch(page).click()
        await shown
        await expect(hideAmountsSwitch(page)).not.toBeChecked()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)
    })

    test('the Invoices widget loads, fails and recovers', async ({ page }) => {
        await page.route('**/api/realtime*', route => route.abort())
        const hold = await holdLoads(page, '**/api/collections/books_invoice_due_totals/records*')
        await openBooksDashboard(page)

        const card = widget(page, 'invoices')
        await expect(card.getByTestId('dashboard-widget-invoices-skeleton')).toBeVisible()
        await expect(card.getByText('Invoices', { exact: true })).toBeVisible()
        await expect(dashboardScreen(page).getByText('Dashboard', { exact: true })).toBeVisible()
        await expect(hideAmountsSwitch(page)).toBeVisible()
        await expect.poll(() => hold.held.length).toBeGreaterThan(0)

        await hold.release({ status: 400 })
        await expect(card.getByTestId('dashboard-widget-invoices-error')).toContainText(
            'This widget could not load.'
        )
        await expect(invoicesPart(page, 'unpaid')).toHaveCount(0)

        await card.getByTestId('dashboard-widget-invoices-retry').click()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)
    })

    test('a preference that loads late, then fails, keeps the controls off until Retry', async ({
        page,
    }) => {
        const prefs = await failPrefsRead(page)
        await openBooksDashboard(page)

        const banner = dashboardScreen(page).getByTestId('dashboard-prefs-banner')
        await expect.poll(() => prefs.held.length).toBeGreaterThan(0)
        await expect(hideAmountsSwitch(page)).toBeDisabled()
        await expect(banner).toHaveCount(0)
        await expect(widget(page, 'invoices')).toBeVisible()
        // The saved Hide amounts is not known yet, so no real amount may show.
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MASK)

        await prefs.fail()
        await expect(banner).toContainText('Your dashboard settings could not load.')
        await expect(hideAmountsSwitch(page)).toBeDisabled()
        await expect(widget(page, 'invoices')).toBeVisible()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MASK)

        await dashboardScreen(page).getByTestId('dashboard-prefs-retry').click()
        await expect(banner).toHaveCount(0)
        await expect(hideAmountsSwitch(page)).toBeEnabled()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)
    })

    test('a failed save shows a toast and returns the switch to the saved value', async ({
        page,
    }) => {
        await openBooksDashboard(page)
        const toggle = hideAmountsSwitch(page)
        await expect(toggle).toBeEnabled()
        await expect(toggle).not.toBeChecked()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)

        await failPrefsWrite(page)
        const refused = prefsWrite(page)
        await toggle.click()
        expect((await refused).status()).toBe(400)
        await expect(refusalToast(page, 'The dashboard change was not saved.')).toBeVisible()
        await expect(toggle).not.toBeChecked()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)
    })
})
