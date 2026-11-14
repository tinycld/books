import { type Browser, expect, type Locator, type Page } from '@playwright/test'
import { authStorageKey } from '@tinycld/core/e2e-helpers'
import { CUSTOMER_IDS, CUSTOMERS } from '../../tinycld/books/lib/customer-form-fixture'
import { ESTIMATES } from '../../tinycld/books/lib/estimate-form-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { DESKTOP, isPhone } from './account-register-helpers'
import {
    ESTIMATE_URL,
    estimateIdFromUrl,
    estimateNumberOf,
    openNewEstimate,
    pickEstimateCustomer,
    pickEstimateLineProduct,
} from './estimate-helpers'
import { lineCellTestId, uniqueMemo } from './invoice-helpers'

// The customer's link of an estimate (estimate-public-link spec §3.1): the server address,
// /p/books/estimates/ and a 43-character URL-safe token.
export const PUBLIC_LINK_PATTERN = /\/p\/books\/estimates\/[A-Za-z0-9_-]{43}$/

export const LINK_COPIED = 'Customer link copied.'

function seededCustomer() {
    const row = CUSTOMERS.find(c => c.id === CUSTOMER_IDS.harborview)
    if (!row) throw new Error('no Harborview in the fixture')
    return { name: row.display_name, email: row.email }
}

function productName(id: string) {
    const row = PRODUCTS.find(p => p.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

export const HARBORVIEW = seededCustomer()
export const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)

// The token at the end of a customer link.
export function tokenOfLink(link: string): string {
    const token = /\/p\/books\/estimates\/([A-Za-z0-9_-]{43})$/.exec(link)?.[1]
    if (!token) throw new Error(`not a customer link: ${link}`)
    return token
}

// The signed-in user's PocketBase token, from the page's localStorage: PocketBase web auth
// is a bearer token, so a request without it is anonymous.
export async function authToken(page: Page): Promise<string> {
    const key = await authStorageKey(page)
    return page.evaluate(
        k => (JSON.parse(localStorage.getItem(k) ?? '{}') as { token?: string }).token ?? '',
        key
    )
}

// Core SelectInput by pointer: the menu items exist only while the menu is open.
export async function chooseSelect(page: Page, key: string, label: string) {
    const trigger = page.getByTestId(`form-input-${key}`)
    await trigger.click()
    const item = page.getByRole('menuitem', { name: label, exact: true })
    await item.click()
    await expect(item).toHaveCount(0)
    await expect(trigger).toContainText(label)
}

// Copy customer link on the saved estimate on screen: ⌥L on a wide screen, the More row on
// a phone. Waits for the toast and returns the link the clipboard then holds.
export async function copyCustomerLink(page: Page): Promise<string> {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() => navigator.clipboard.writeText(''))
    if (isPhone(page)) {
        await page.getByTestId('estimate-more').click()
        await page.getByTestId('estimate-copy-link').click()
    } else {
        await page.keyboard.press('Alt+l')
    }
    await expect(page.getByText(LINK_COPIED, { exact: true }).first()).toBeVisible()
    await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toMatch(PUBLIC_LINK_PATTERN)
    return page.evaluate(() => navigator.clipboard.readText())
}

export interface LinkedEstimateOptions {
    expirationDate?: string
    status?: 'Accepted' | 'Rejected'
    message?: string
    lineDescription?: string
}

// Books must already be open. A new estimate for Harborview with one Wireless access point
// line and a unique memo, saved with ⌘S, then its customer link copied. Leaves the page on
// the saved estimate's form.
export async function createLinkedEstimate(
    page: Page,
    options: LinkedEstimateOptions = {}
): Promise<{ id: string; number: string; memo: string; link: string }> {
    const memo = uniqueMemo('Estimate link')
    await openNewEstimate(page)
    await pickEstimateCustomer(page, HARBORVIEW.name)
    const line = await pickEstimateLineProduct(page, 0, ACCESS_POINT)
    if (options.lineDescription !== undefined) {
        await page.getByTestId(lineCellTestId(line, 'description')).fill(options.lineDescription)
    }
    if (options.expirationDate !== undefined) {
        await page.getByTestId('form-input-expiration_date').fill(options.expirationDate)
    }
    if (options.message !== undefined) {
        await page.getByTestId('form-input-message').fill(options.message)
    }
    if (options.status) {
        await chooseSelect(page, 'status', options.status)
        if (options.status === 'Accepted') {
            await page.getByTestId('form-input-accepted_by').fill('Dana Whitfield')
        }
    }
    const memoInput = page.getByTestId('form-input-memo')
    await memoInput.fill(memo)
    await memoInput.focus()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page).toHaveURL(ESTIMATE_URL)
    const id = estimateIdFromUrl(page)
    const number = await estimateNumberOf(page)
    const link = await copyCustomerLink(page)
    return { id, number, memo, link }
}

// Opens a customer link in a new context that never signed in: its initial load, as a
// customer pasting the link. The context's base URL is the link's origin, so its request
// fixture reads the same server.
export async function openPublicPage(
    browser: Browser,
    link: string,
    options: { viewport?: { width: number; height: number } } = {}
): Promise<{ page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({
        baseURL: new URL(link).origin,
        viewport: options.viewport ?? DESKTOP,
        reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await page.goto(link)
    return { page, close: () => context.close() }
}

// A seeded estimate's token (estimate-form-fixture ESTIMATES row `fixtureId`), read with a
// read-only signed-in GET: the seed gives each estimate its token through the server's
// create hook, so the fixture's token is not the stored one. The row is found by its
// fixture date and total (the seed numbers estimates through the shared sequence).
export async function seededEstimateToken(page: Page, fixtureId: string): Promise<string> {
    const row = ESTIMATES.find(estimate => estimate.id === fixtureId)
    if (!row) throw new Error(`no estimate ${fixtureId} in the fixture`)
    const response = await page.request.get('/api/collections/books_estimates/records', {
        params: { filter: `date="${row.date}" && total=${row.total}`, fields: 'public_token' },
        headers: { Authorization: await authToken(page) },
    })
    expect(response.ok()).toBe(true)
    const body = (await response.json()) as { items: { public_token: string }[] }
    expect(body.items).toHaveLength(1)
    const token = body.items[0]?.public_token ?? ''
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    return token
}

// The customer link of a token on the same server as the Books page.
export function publicLinkOf(page: Page, token: string): string {
    return `${new URL(page.url()).origin}/p/books/estimates/${token}`
}

// The Books settings row, read-only, for the contact line (shared state: never asserted
// by value).
export async function booksContact(page: Page): Promise<{ email: string; phone: string }> {
    const response = await page.request.get(
        '/api/collections/books_settings/records/bookssettings01',
        { headers: { Authorization: await authToken(page) } }
    )
    expect(response.ok()).toBe(true)
    const row = (await response.json()) as { email?: string; phone?: string }
    return { email: (row.email ?? '').trim(), phone: (row.phone ?? '').trim() }
}

export function publicCard(page: Page): Locator {
    return page.getByTestId('estimate-public')
}
