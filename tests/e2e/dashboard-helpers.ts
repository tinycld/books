import { expect, type Locator, type Page, type Response } from '@playwright/test'
import type { BooksInvoiceDueTotals } from '../../tinycld/books/types'
import { isPhone } from './account-register-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import { swipeFromLeftEdge } from './books-report-helpers'
import { authToken } from './estimate-public-link-helpers'
import { holdLoads } from './record-form-helpers'
import { EMPTY_LIST } from './vendor-1099-helpers'

// The dashboard e2e helpers (dashboard checkpoint 2, Do step 11). The stack keeps a
// covered screen mounted and hidden, so every locator starts from the visible
// `dashboard-screen` (plan D17).

export const MONEY = /\d\.\d{2}/
export const MASK = '•••••'

const PREFS_URL = '/api/collections/user_preferences/records'

export function dashboardScreen(page: Page): Locator {
    return page.getByTestId('dashboard-screen').filter({ visible: true })
}

export function widget(page: Page, id: string): Locator {
    return dashboardScreen(page).getByTestId(`dashboard-widget-${id}`)
}

export function hideAmountsSwitch(page: Page): Locator {
    return dashboardScreen(page).getByTestId('dashboard-hide-amounts')
}

// Books must be open. Opens the dashboard unless it is the visible screen: the sidebar's
// Dashboard entry on a wide screen, the same entry in the Books menu (the drawer) on a
// phone.
export async function openDashboard(page: Page): Promise<void> {
    // The bare /a/books redirects to its landing first; a press before that lands would
    // stack a second screen.
    await expect(page).toHaveURL(/\/books\/[^/?]+/)
    if (/\/books\/dashboard\/?$/.test(new URL(page.url()).pathname)) {
        await expect(dashboardScreen(page)).toBeVisible()
        return
    }
    if (isPhone(page)) {
        const panel = page.getByTestId('mobile-drawer-panel')
        await panel.waitFor({ state: 'attached' })
        await swipeFromLeftEdge(page)
        await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
        await panel.getByTestId('books-nav-dashboard').click()
    } else {
        await page.getByTestId('books-nav-dashboard').click()
    }
    await expect(page).toHaveURL(/\/books\/dashboard\/?$/)
    await expect(dashboardScreen(page)).toBeVisible()
}

// Starts waiting for the next write of a preference row (an insert or an update). Start
// it before the action and await it after.
export function prefsWrite(page: Page): Promise<Response> {
    return page.waitForResponse(
        response => response.url().includes(PREFS_URL) && response.request().method() !== 'GET'
    )
}

// The labels of the period pickers (lib/dashboard-prefs.ts PERIOD_LABELS and
// SALES_PERIOD_LABELS), written out: that module imports core's form library, which an e2e
// helper must not load.
export const PERIOD_TEXT = {
    this_month: 'This month',
    last_month: 'Last month',
    this_quarter: 'This quarter',
    this_fiscal_year: 'This fiscal year',
    last_fiscal_year: 'Last fiscal year',
    last_6_months: 'Last 6 months',
    last_12_months: 'Last 12 months',
} as const

export type PeriodWidget = 'expenses' | 'profitAndLoss' | 'sales'
export type PeriodChoice = keyof typeof PERIOD_TEXT

const DEFAULT_PERIODS: Record<PeriodWidget, PeriodChoice> = {
    expenses: 'this_fiscal_year',
    profitAndLoss: 'this_fiscal_year',
    sales: 'last_6_months',
}

export function periodTrigger(page: Page, widgetId: PeriodWidget): Locator {
    return dashboardScreen(page).getByTestId(`dashboard-period-${widgetId}`)
}

// The two presses of a period pick: the widget's trigger, then the item in its open menu
// (core Menu draws its items only while open, outside the screen).
export async function pressPeriod(
    page: Page,
    widgetId: PeriodWidget,
    periodId: PeriodChoice
): Promise<void> {
    await periodTrigger(page, widgetId).click()
    const item = page.getByTestId(`dashboard-period-${widgetId}-${periodId}`)
    await item.click()
    await expect(item).toHaveCount(0)
}

// Picks a widget's period and waits for the trigger to read it and for the saved write.
export async function pickPeriod(
    page: Page,
    widgetId: PeriodWidget,
    periodId: PeriodChoice
): Promise<void> {
    const trigger = periodTrigger(page, widgetId)
    await expect(trigger).toBeEnabled()
    const saved = prefsWrite(page)
    await pressPeriod(page, widgetId, periodId)
    await expect(trigger).toContainText(PERIOD_TEXT[periodId])
    expect((await saved).ok()).toBe(true)
}

// The widget ids in the order lib/dashboard-prefs.ts DEFAULT_DASHBOARD_PREFS holds them,
// written out (an e2e helper must not load that module).
export const DEFAULT_ORDER = [
    'invoices',
    'expenses',
    'bankAccounts',
    'profitAndLoss',
    'sales',
] as const

export type DashboardWidgetId = (typeof DEFAULT_ORDER)[number]

export function customizeButton(page: Page): Locator {
    return dashboardScreen(page).getByTestId('dashboard-customize')
}

export function editList(page: Page): Locator {
    return dashboardScreen(page).getByTestId('dashboard-edit-list')
}

export function editRow(page: Page, id: DashboardWidgetId): Locator {
    return dashboardScreen(page).getByTestId(`dashboard-edit-row-${id}`)
}

export function showSwitch(page: Page, id: DashboardWidgetId): Locator {
    return dashboardScreen(page).getByTestId(`dashboard-edit-show-${id}`)
}

const CARD_ID = /^dashboard-widget-([A-Za-z]+)$/
const ROW_ID = /^dashboard-edit-row-([A-Za-z]+)$/

// The widget ids of the cards in the grid, in DOM order (a card's own parts, such as
// `dashboard-widget-sales-empty`, are not cards).
export async function gridOrder(page: Page): Promise<string[]> {
    const ids = await dashboardScreen(page)
        .locator('[data-testid^="dashboard-widget-"]')
        .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid') ?? ''))
    return ids.flatMap(id => CARD_ID.exec(id)?.[1] ?? [])
}

// The widget ids of the edit-mode rows, in DOM order.
export async function editOrder(page: Page): Promise<string[]> {
    const ids = await editList(page)
        .locator('[data-testid^="dashboard-edit-row-"]')
        .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid') ?? ''))
    return ids.flatMap(id => ROW_ID.exec(id)?.[1] ?? [])
}

// Opens edit mode from the header's Customize button, or from the all-hidden page's own
// Customize button, and waits for the edit list.
export async function openCustomize(
    page: Page,
    from: 'header' | 'all-hidden' = 'header'
): Promise<void> {
    const button =
        from === 'header'
            ? customizeButton(page)
            : dashboardScreen(page).getByTestId('dashboard-all-hidden-customize')
    await expect(button).toBeEnabled()
    await button.click()
    await expect(editList(page)).toBeVisible()
}

// Leaves edit mode with the header's Done button and waits for the edit list to go.
export async function closeCustomize(page: Page): Promise<void> {
    const button = customizeButton(page)
    await expect(button).toHaveAccessibleName('Done')
    await button.click()
    await expect(editList(page)).toHaveCount(0)
}

// Turns a row's Show switch to `isShown` and waits for the saved write.
export async function setShown(page: Page, id: DashboardWidgetId, isShown: boolean): Promise<void> {
    const toggle = showSwitch(page, id)
    await expect(toggle).toBeEnabled()
    if ((await toggle.getAttribute('aria-checked')) === String(isShown)) return
    const saved = prefsWrite(page)
    await toggle.click()
    expect((await saved).ok()).toBe(true)
    if (isShown) await expect(toggle).toBeChecked()
    else await expect(toggle).not.toBeChecked()
}

const DRAG_STEPS = 12

async function liveBox(locator: Locator) {
    const box = await locator.boundingBox()
    if (!box) throw new Error('drag handle or target row is not laid out')
    return box
}

// Drags a row by its handle above the row of `beforeId` (a real pointer drag in 12 steps,
// as core tests/e2e/forms-builder.spec.ts drags) and waits for the saved write. Content
// above the list (the setup card, which another test's setup change shows or hides through
// realtime) can move the rows during the drag, so every step aims at the target row's box
// as it is laid out at that step, not where it was at the start.
export async function dragRow(
    page: Page,
    id: DashboardWidgetId,
    beforeId: DashboardWidgetId
): Promise<void> {
    const handle = dashboardScreen(page).getByTestId(`dashboard-edit-handle-${id}`)
    const target = editRow(page, beforeId)
    await expect(handle).toBeVisible()
    await expect(target).toBeVisible()
    const saved = prefsWrite(page)
    const from = await liveBox(handle)
    const x = from.x + from.width / 2
    const startY = from.y + from.height / 2
    await page.mouse.move(x, startY)
    await page.mouse.down()
    for (let step = 1; step <= DRAG_STEPS; step++) {
        const to = await liveBox(target)
        await page.mouse.move(x, startY + ((to.y + 2 - startY) * step) / DRAG_STEPS)
    }
    await page.mouse.up()
    expect((await saved).ok()).toBe(true)
}

// Puts the default order back with every widget shown, through edit mode's Reset to
// default. The grid is read first, so a default arrangement costs no write.
async function resetArrangementThroughUi(page: Page): Promise<void> {
    if (await editList(page).isVisible()) await closeCustomize(page)
    await expect(
        dashboardScreen(page)
            .getByTestId('dashboard-grid')
            .or(dashboardScreen(page).getByTestId('dashboard-all-hidden'))
            .first()
    ).toBeVisible()
    if ((await gridOrder(page)).join() === DEFAULT_ORDER.join()) return
    await openCustomize(page)
    const saved = prefsWrite(page)
    await dashboardScreen(page).getByTestId('dashboard-reset').click()
    expect((await saved).ok()).toBe(true)
    await expect.poll(() => editOrder(page)).toEqual([...DEFAULT_ORDER])
    await closeCustomize(page)
    await expect.poll(() => gridOrder(page)).toEqual([...DEFAULT_ORDER])
}

// Restores the default arrangement through the UI: the default order with every widget
// shown, Hide amounts off and each widget's default period. The preference is one row of
// the one shared test user, so every test of dashboard.spec.ts ends here.
export async function resetDashboardPrefs(page: Page): Promise<void> {
    await openDashboard(page)
    const toggle = hideAmountsSwitch(page)
    await expect(toggle).toBeEnabled()
    await resetArrangementThroughUi(page)
    if ((await toggle.getAttribute('aria-checked')) === 'true') {
        const saved = prefsWrite(page)
        await toggle.click()
        await saved
    }
    await expect(toggle).not.toBeChecked()
    for (const [widgetId, periodId] of Object.entries(DEFAULT_PERIODS) as [
        PeriodWidget,
        PeriodChoice,
    ][]) {
        const trigger = periodTrigger(page, widgetId)
        await expect(trigger).toBeEnabled()
        if (!(await trigger.innerText()).includes(PERIOD_TEXT[periodId])) {
            await pickPeriod(page, widgetId, periodId)
        }
        await expect(trigger).toContainText(PERIOD_TEXT[periodId])
    }
}

const EMPTY_READS = [
    'books_invoice_due_totals',
    'books_payment_day_totals',
    'books_account_balances',
    'books_bank_connections',
]

// Install before login. The book reads as empty: no due invoice, no payment, no balance,
// no bank connection, and a chart with no Bank or Credit card account. Only reads are
// answered; realtime is cut so no event refills the store.
export async function fakeEmptyBook(page: Page): Promise<void> {
    await page.route('**/api/realtime*', route => route.abort())
    for (const collection of EMPTY_READS) {
        await page.route(`**/api/collections/${collection}/records*`, async route => {
            if (route.request().method() !== 'GET') {
                await route.fallback()
                return
            }
            await route.fulfill({ json: EMPTY_LIST })
        })
    }
    await page.route('**/api/collections/books_accounts/records*', async route => {
        if (route.request().method() !== 'GET') {
            await route.fallback()
            return
        }
        const response = await route.fetch()
        const body = await response.json()
        const items = (body.items ?? []).filter(
            (item: { type?: string }) => item.type !== 'bank' && item.type !== 'credit_card'
        )
        await route.fulfill({ response, json: { ...body, items, totalItems: items.length } })
    })
}

// Install before login: a read-only Books user (banking-helpers fakeReadOnlyAccess) in an
// empty book (fakeEmptyBook).
export async function fakeReadOnlyEmptyBook(page: Page): Promise<void> {
    await fakeEmptyBook(page)
    await fakeReadOnlyAccess(page)
}

// A money text ("$8,940.00", "−$12.00") as integer cents. Throws on the mask, so a test
// never reads a hidden figure as a number.
export function centsOf(text: string): number {
    const trimmed = text.trim()
    if (trimmed.includes('•')) throw new Error(`a masked amount has no value: ${trimmed}`)
    if (!MONEY.test(trimmed)) throw new Error(`not a money text: ${trimmed}`)
    const digits = trimmed.replace(/\D/g, '')
    const cents = Number.parseInt(digits, 10)
    return /^[−-]/.test(trimmed) ? -cents : cents
}

export type DueTotal = Pick<BooksInvoiceDueTotals, 'due_date' | 'balance' | 'count'>

// Every row of the books_invoice_due_totals view, read-only, with the page's own sign-in.
export async function readDueTotals(page: Page): Promise<DueTotal[]> {
    const token = await authToken(page)
    const rows: DueTotal[] = []
    for (let pageNo = 1; ; pageNo++) {
        const response = await page.request.get(
            '/api/collections/books_invoice_due_totals/records',
            {
                params: { page: pageNo, perPage: 500, fields: 'due_date,balance,count' },
                headers: { Authorization: token },
            }
        )
        expect(response.ok()).toBe(true)
        const body = (await response.json()) as { items: DueTotal[]; totalPages: number }
        rows.push(...body.items)
        if (pageNo >= body.totalPages) return rows
    }
}

export function sumOfBalances(rows: readonly DueTotal[]): number {
    return rows.reduce((total, row) => total + row.balance, 0)
}

// Install before login. Holds the dashboard preference read (the user_preferences read
// whose filter names `dashboard`; every other preference read continues) and cuts
// realtime, so no event answers the read in its place. `fail()` answers the held read with
// a 400 and removes the routes.
export async function failPrefsRead(page: Page) {
    await page.route('**/api/realtime*', route => route.abort())
    const hold = await holdLoads(page, `**${PREFS_URL}**dashboard**`)
    return {
        held: hold.held,
        fail: () => hold.release({ status: 400 }),
    }
}

// Every write of a preference row (any request but a GET) answers 400; reads continue.
export async function failPrefsWrite(page: Page): Promise<void> {
    await page.route(`**${PREFS_URL}**`, async route => {
        if (route.request().method() === 'GET') {
            await route.continue()
            return
        }
        await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
    })
}
