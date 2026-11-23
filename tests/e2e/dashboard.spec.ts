import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'
import { browserToday, endOfLastMonth } from './books-report-helpers'
import {
    centsOf,
    dashboardScreen,
    failPrefsRead,
    failPrefsWrite,
    fakeEmptyBook,
    fakeReadOnlyEmptyBook,
    hideAmountsSwitch,
    MASK,
    MONEY,
    openDashboard,
    PERIOD_TEXT,
    type PeriodWidget,
    periodTrigger,
    pickPeriod,
    prefsWrite,
    pressPeriod,
    readDueTotals,
    resetDashboardPrefs,
    sumOfBalances,
    widget,
} from './dashboard-helpers'
import { openOtherBooksPage } from './journal-entries-helpers'
import { customerWithInvoices, localDay } from './receive-payment-helpers'
import { holdLoads, openBooks, openBooksPage, refusalToast } from './record-form-helpers'

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

const DEFAULT_PERIOD_TEXT: [PeriodWidget, string][] = [
    ['expenses', PERIOD_TEXT.this_fiscal_year],
    ['profitAndLoss', PERIOD_TEXT.this_fiscal_year],
    ['sales', PERIOD_TEXT.last_6_months],
]

const SHORT_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
]

// The first day of the month `back` months before `day`'s month.
function monthStart(day: string, back = 0): string {
    const index = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 - back
    const year = Math.floor(index / 12)
    return `${year}-${String((index % 12) + 1).padStart(2, '0')}-01`
}

// "Sep 2026" for a month's first day.
function longMonth(month: string): string {
    return `${SHORT_MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function bankRows(page: Page): Locator {
    return widget(page, 'bankAccounts').locator('[data-testid^="dashboard-bank-row-"]')
}

// The Expenses widget has drawn its figure or its empty text: it is not loading.
function expensesShown(page: Page): Locator {
    const card = widget(page, 'expenses')
    return card
        .getByTestId('dashboard-expenses-total')
        .or(card.getByTestId('dashboard-widget-expenses-empty'))
        .first()
}

// The Sales total in cents, 0 when the widget is empty.
async function salesTotal(page: Page): Promise<number> {
    const card = widget(page, 'sales')
    const total = card.getByTestId('dashboard-sales-total')
    await expect(total.or(card.getByTestId('dashboard-widget-sales-empty')).first()).toBeVisible()
    if ((await total.count()) === 0) return 0
    return centsOf(await total.innerText())
}

// At 1600 the page has three columns: the first row's cards share their top and height,
// and Profit and loss starts the second row.
async function expectFirstRowAligned(page: Page) {
    const firstRow = ['invoices', 'expenses', 'bankAccounts'].map(id => widget(page, id))
    for (const card of firstRow) await expect(card).toBeVisible()
    await expect
        .poll(async () => {
            const boxes = await Promise.all(firstRow.map(card => card.boundingBox()))
            if (boxes.some(box => !box)) return false
            const tops = boxes.map(box => box?.y ?? 0)
            const heights = boxes.map(box => box?.height ?? 0)
            return (
                Math.max(...tops) - Math.min(...tops) <= 1 &&
                Math.max(...heights) - Math.min(...heights) <= 1
            )
        })
        .toBe(true)
    await expect
        .poll(async () => {
            const [first, pnl] = await Promise.all([
                widget(page, 'invoices').boundingBox(),
                widget(page, 'profitAndLoss').boundingBox(),
            ])
            if (!first || !pnl) return false
            return pnl.y >= first.y + first.height
        })
        .toBe(true)
}

// The widgets' links are real links with the targets of spec §3.
async function expectWidgetLinks(page: Page) {
    const bank = widget(page, 'bankAccounts')
    await expect(bank.getByTestId('dashboard-bank-banking')).toHaveAttribute(
        'href',
        /\/books\/banking$/
    )
    await expect(bankRows(page).first()).toBeVisible()
    const rowIds = await bankRows(page).evaluateAll(rows =>
        rows.map(row => row.getAttribute('data-testid') ?? '')
    )
    for (const testId of rowIds) {
        const id = testId.slice('dashboard-bank-row-'.length)
        await expect(bank.getByTestId(testId)).toHaveAttribute(
            'href',
            new RegExp(`/books/accounts/${escapeRegExp(id)}$`)
        )
    }
    const reviews = bank.locator('[data-testid^="dashboard-bank-review-"]')
    for (const review of await reviews.all()) {
        await expect(review).toHaveAttribute('href', /\/books\/banking\?account=/)
    }
    for (const [id, testId] of [
        ['expenses', 'dashboard-expenses-report'],
        ['sales', 'dashboard-sales-report'],
    ]) {
        const link = widget(page, id).getByTestId(testId)
        if ((await link.count()) > 0) await expect(link).toHaveAttribute('href', /\/reports\//)
    }
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
        await expectFirstRowAligned(page)
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
        await expectWidgetLinks(page)
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
        await page.route('**/api/collections/books_bank_connections/records*', async route => {
            if (route.request().method() !== 'GET') {
                await route.fallback()
                return
            }
            await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
        })
        const hold = await holdLoads(page, '**/api/collections/books_invoice_due_totals/records*')
        await openBooksDashboard(page)

        const card = widget(page, 'invoices')
        const bank = widget(page, 'bankAccounts')
        await expect(card.getByTestId('dashboard-widget-invoices-skeleton')).toBeVisible()
        await expect(card.getByText('Invoices', { exact: true })).toBeVisible()
        await expect(dashboardScreen(page).getByText('Dashboard', { exact: true })).toBeVisible()
        await expect(hideAmountsSwitch(page)).toBeVisible()
        await expect.poll(() => hold.held.length).toBeGreaterThan(0)
        // One widget's read does not block or break another.
        await expect(expensesShown(page)).toBeVisible()
        await expect(bank.getByTestId('dashboard-widget-bankAccounts-error')).toContainText(
            'This widget could not load.'
        )
        await expect(card.getByTestId('dashboard-widget-invoices-skeleton')).toBeVisible()

        // The release removes every route, the bank connections fake too.
        await hold.release({ status: 400 })
        await expect(card.getByTestId('dashboard-widget-invoices-error')).toContainText(
            'This widget could not load.'
        )
        await expect(invoicesPart(page, 'unpaid')).toHaveCount(0)
        await expect(expensesShown(page)).toBeVisible()
        await expect(bank.getByTestId('dashboard-widget-bankAccounts-error')).toContainText(
            'This widget could not load.'
        )

        await bank.getByTestId('dashboard-widget-bankAccounts-retry').click()
        await expect(bankRows(page).first()).toBeVisible()
        await expect(bank.getByTestId('dashboard-widget-bankAccounts-error')).toHaveCount(0)
        await expect(card.getByTestId('dashboard-widget-invoices-error')).toBeVisible()

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
        for (const [widgetId, label] of DEFAULT_PERIOD_TEXT) {
            await expect(periodTrigger(page, widgetId)).toBeDisabled()
            await expect(periodTrigger(page, widgetId)).toContainText(label)
        }

        await prefs.fail()
        await expect(banner).toContainText('Your dashboard settings could not load.')
        await expect(hideAmountsSwitch(page)).toBeDisabled()
        await expect(widget(page, 'invoices')).toBeVisible()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MASK)

        await dashboardScreen(page).getByTestId('dashboard-prefs-retry').click()
        await expect(banner).toHaveCount(0)
        await expect(hideAmountsSwitch(page)).toBeEnabled()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)
        for (const [widgetId] of DEFAULT_PERIOD_TEXT) {
            await expect(periodTrigger(page, widgetId)).toBeEnabled()
        }
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
        const toast = refusalToast(page, 'The dashboard change was not saved.')
        await expect(toast).toBeVisible()
        await expect(toggle).not.toBeChecked()
        await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)

        // The user dismisses the first toast, so the next one is the period's own.
        await toast.getByRole('button', { name: 'Dismiss notification' }).click()
        await expect(toast).toHaveCount(0)
        const sales = periodTrigger(page, 'sales')
        await expect(sales).toBeEnabled()
        await expect(sales).toContainText(PERIOD_TEXT.last_6_months)
        const refusedPeriod = prefsWrite(page)
        await pressPeriod(page, 'sales', 'last_12_months')
        expect((await refusedPeriod).status()).toBe(400)
        await expect(toast).toBeVisible()
        await expect(sales).toContainText(PERIOD_TEXT.last_6_months)
        await expect(sales).not.toContainText(PERIOD_TEXT.last_12_months)
    })
})

const EMPTY_TEXTS = [
    ['invoices', 'No unpaid invoices.'],
    ['expenses', 'No expenses in this fiscal year.'],
    ['bankAccounts', 'No bank accounts.'],
    ['profitAndLoss', 'Nothing posted in this fiscal year.'],
    ['sales', 'No sales in last 6 months.'],
] as const

test.describe('dashboard: widgets', () => {
    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'ignoreErrors' })
        await resetDashboardPrefs(page)
    })

    test('a period is saved and the report opens on it', async ({ page }) => {
        await openBooksDashboard(page)
        await pickPeriod(page, 'profitAndLoss', 'last_month')
        await expect(periodTrigger(page, 'profitAndLoss')).toContainText(PERIOD_TEXT.last_month)
        await expect(periodTrigger(page, 'expenses')).toContainText(PERIOD_TEXT.this_fiscal_year)

        await page.reload()
        await openDashboard(page)
        await expect(periodTrigger(page, 'profitAndLoss')).toContainText(PERIOD_TEXT.last_month)
        await expect(periodTrigger(page, 'profitAndLoss')).toBeEnabled()

        const today = await browserToday(page)
        const lastDay = endOfLastMonth(today)
        const firstDay = `${lastDay.slice(0, 8)}01`
        await widget(page, 'profitAndLoss').getByTestId('dashboard-pnl-report').click()
        await expect(page).toHaveURL(/\/reports\/[^/?]+\?/)
        expect(new URL(page.url()).searchParams.get('p-period')).toBe(`${firstDay}..${lastDay}`)
        await expect(page.getByTestId('report-title').filter({ visible: true })).toBeVisible()

        // Back to the dashboard, where afterEach sets the period back.
        await page.goBack()
        await expect(dashboardScreen(page)).toBeVisible()
    })

    test('Sales follows a new invoice, and a column shows its month', async ({ page }) => {
        await openBooksDashboard(page)
        const sales = widget(page, 'sales')
        const before = await salesTotal(page)

        const today = await localDay(page, 0)
        const other = await openOtherBooksPage(page, ['customers'])
        await customerWithInvoices(other, [{ rate: '213.00', dueDate: today }], 'Dashboard sales')
        await other.close()

        await expect
            .poll(() => salesTotal(page), { message: 'the Sales total takes the new invoice' })
            .toBeGreaterThanOrEqual(before + 21300)
        await expect(widget(page, 'profitAndLoss').getByTestId('dashboard-pnl-net')).toHaveText(
            MONEY
        )

        const thisMonth = monthStart(today)
        const lastMonth = monthStart(today, 1)
        const picked = sales.getByTestId('dashboard-sales-picked')
        await expect(picked).toHaveText(new RegExp(`^${longMonth(thisMonth)}: `))

        const earlier = sales.getByTestId(`dashboard-sales-column-${lastMonth}`)
        await earlier.click()
        await expect(picked).toHaveText(new RegExp(`^${longMonth(lastMonth)}: `))
        await expect(earlier).toBeFocused()

        // A period change drops the pick: back on "Last 6 months" the line shows the latest
        // month again, not the month picked before.
        await pickPeriod(page, 'sales', 'last_12_months')
        await pickPeriod(page, 'sales', 'last_6_months')
        await expect(picked).toHaveText(new RegExp(`^${longMonth(thisMonth)}: `))

        await earlier.click()
        await expect(picked).toHaveText(new RegExp(`^${longMonth(lastMonth)}: `))
        await expect(earlier).toBeFocused()
        await page.keyboard.press('Tab')
        const current = sales.getByTestId(`dashboard-sales-column-${thisMonth}`)
        await expect(current).toBeFocused()
        await expect(picked).toHaveText(new RegExp(`^${longMonth(thisMonth)}: .*\\d\\.\\d{2}`))

        const months = [5, 4, 3, 2, 1, 0].map(back => monthStart(today, back))
        const columns = sales.locator('[data-testid^="dashboard-sales-column-"]')
        await expect(columns).toHaveCount(6)
        const columnIds = await columns.evaluateAll(nodes =>
            nodes.map(node => node.getAttribute('data-testid'))
        )
        expect(columnIds).toEqual(months.map(month => `dashboard-sales-column-${month}`))
        for (const month of months) {
            const column = sales.getByTestId(`dashboard-sales-column-${month}`)
            await expect(column).toHaveAccessibleName(new RegExp(`^${longMonth(month)}: `))
            await expect(column).toContainText(SHORT_MONTHS[Number(month.slice(5, 7)) - 1])
        }
        // The month with the largest positive Sales: a zero or negative month draws only a
        // baseline mark, and another spec can move any one month's figure.
        const columnAmounts = await Promise.all(
            months.map(async month => {
                const name = await sales
                    .getByTestId(`dashboard-sales-column-${month}`)
                    .getAttribute('aria-label')
                return { month, cents: centsOf((name ?? '').replace(/^[^:]*:\s*/, '')) }
            })
        )
        const tallest = columnAmounts.reduce((best, next) =>
            next.cents > best.cents ? next : best
        )
        expect(
            tallest.cents,
            `a month with positive sales to measure: ${JSON.stringify(columnAmounts)}`
        ).toBeGreaterThan(0)

        const firstBank = bankRows(page).first()
        await expect(firstBank).toHaveText(MONEY)
        const bankName = (await firstBank.innerText()).split('\n')[0].trim()
        const toggle = hideAmountsSwitch(page)
        await expect(toggle).toBeEnabled()
        const saved = prefsWrite(page)
        await toggle.click()
        await saved
        await expect(toggle).toBeChecked()

        await expect(sales.getByTestId('dashboard-sales-total')).toHaveText(MASK)
        await expect(widget(page, 'expenses').getByTestId('dashboard-expenses-total')).toHaveText(
            MASK
        )
        const pnl = widget(page, 'profitAndLoss')
        await expect(pnl.getByTestId('dashboard-pnl-net')).toHaveText(MASK)
        await expect(pnl.getByTestId('dashboard-pnl-income')).toHaveText(MASK)
        await expect(firstBank).toContainText(MASK)
        await expect(firstBank).not.toHaveText(MONEY)
        await expect(firstBank).toContainText(bankName)
        await expect(picked).toHaveText(new RegExp(`^${longMonth(thisMonth)}: ${MASK}$`))
        await expect(current).toHaveAccessibleName(new RegExp(`${MASK}$`))
        // The column's fill, not its pressable area (a fixed height plus the label).
        const tallestBar = sales.getByTestId(`dashboard-sales-bar-${tallest.month}`)
        await expect
            .poll(async () => (await tallestBar.boundingBox())?.height ?? 0, {
                message: `${longMonth(tallest.month)}'s bar stays drawn with Hide amounts on`,
            })
            .toBeGreaterThan(2)
        const change = pnl.getByTestId('dashboard-pnl-change')
        if ((await change.count()) > 0) await expect(change).toContainText('••%')
        for (const review of await widget(page, 'bankAccounts')
            .locator('[data-testid^="dashboard-bank-review-"]')
            .all()) {
            await expect(review).toHaveText(/^\d+ to review$/)
        }
    })

    test('a read-only user in an empty book sees no create buttons', async ({ page }) => {
        await fakeReadOnlyEmptyBook(page)
        await openBooksDashboard(page)

        for (const [id, text] of EMPTY_TEXTS) {
            await expect(
                widget(page, id).getByTestId(`dashboard-widget-${id}-empty`)
            ).toContainText(text)
        }
        await expect(
            dashboardScreen(page).locator(
                '[data-testid$="-action"][data-testid^="dashboard-widget-"]'
            )
        ).toHaveCount(0)
        await expect(
            widget(page, 'invoices').getByTestId('dashboard-invoices-deposit')
        ).toHaveCount(0)

        // A read-only user saves their own arrangement.
        const toggle = hideAmountsSwitch(page)
        await expect(toggle).toBeEnabled()
        const saved = prefsWrite(page)
        await toggle.click()
        expect((await saved).ok()).toBe(true)
        await expect(toggle).toBeChecked()

        // A writer in the same empty book is offered each widget's create button.
        const writer = await openBooksPage(page, DESKTOP, fakeEmptyBook)
        await openDashboard(writer)
        const actions = [
            ['invoices', 'Create invoice'],
            ['expenses', 'Record expense'],
            ['bankAccounts', 'Chart of Accounts'],
            ['sales', 'Create invoice'],
        ] as const
        for (const [id, label] of actions) {
            await expect(
                widget(writer, id).getByTestId(`dashboard-widget-${id}-empty`)
            ).toBeVisible()
            await expect(
                widget(writer, id).getByTestId(`dashboard-widget-${id}-action`)
            ).toHaveText(label)
        }
        await expect(
            widget(writer, 'profitAndLoss').getByTestId('dashboard-widget-profitAndLoss-empty')
        ).toContainText('Nothing posted in this fiscal year.')
        await expect(
            widget(writer, 'profitAndLoss').getByTestId('dashboard-widget-profitAndLoss-action')
        ).toHaveCount(0)
        await widget(writer, 'expenses').getByTestId('dashboard-widget-expenses-action').click()
        await expect(writer).toHaveURL(/\/books\/expenses\/new$/)
        await writer.close()
    })
})
