import { expect, type Locator, type Page, type Response } from '@playwright/test'
import type { BooksInvoiceDueTotals } from '../../tinycld/books/types'
import { isPhone } from './account-register-helpers'
import { swipeFromLeftEdge } from './books-report-helpers'
import { authToken } from './estimate-public-link-helpers'
import { holdLoads } from './record-form-helpers'

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

// Restores the default arrangement through the UI: Hide amounts off. The preference is one
// row of the one shared test user, so every test of dashboard.spec.ts ends here.
export async function resetDashboardPrefs(page: Page): Promise<void> {
    await openDashboard(page)
    const toggle = hideAmountsSwitch(page)
    await expect(toggle).toBeEnabled()
    if ((await toggle.getAttribute('aria-checked')) === 'true') {
        const saved = prefsWrite(page)
        await toggle.click()
        await saved
    }
    await expect(toggle).not.toBeChecked()
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
