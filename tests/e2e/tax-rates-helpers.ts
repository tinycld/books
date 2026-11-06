import { expect, type Locator, type Page, type Route } from '@playwright/test'
import { DESKTOP, exactText, openBooks } from './record-form-helpers'

// Shared by the tax-rates e2e specs. The database is shared by every spec file on two
// workers: a spec never edits a seeded agency, rate or group (the default is the one
// exception, named in the spec that moves it), names its own rows with `uniqueName`,
// and never assumes which agency card comes first or last. A forced load failure
// answers 400 (`route.fulfill({ status: 400 })`): pbtsdb reports no error for a network
// failure, so `route.abort()` never shows one.

export {
    DESKTOP,
    isDisabled,
    openBooks,
    openBooksPage,
    PHONE,
    uniqueName,
} from './record-form-helpers'

const ACCESS_RECORDS = '**/api/collections/books_access/records*'
const AGENCIES_RECORDS = '**/api/collections/books_tax_agencies/records*'
const RATES_RECORDS = '**/api/collections/books_tax_rates/records*'

// Books open at the desktop viewport, then the Sales tax page through its sidebar entry.
export async function openTaxes(page: Page): Promise<void> {
    await openBooks(page, DESKTOP)
    await page.getByTestId('books-nav-taxes').click()
    await expect(page.getByTestId('taxes-screen')).toBeVisible()
}

// Every agency card on the page, in screen order.
export function agencyCards(page: Page): Locator {
    return page.locator('[data-testid^="tax-agency-card-"]')
}

// The agency card whose title is exactly `name`.
export function agencyCardByName(page: Page, name: string): Locator {
    return agencyCards(page).filter({
        has: page.locator('[data-testid^="tax-agency-title-"]', { hasText: exactText(name) }),
    })
}

// The rate or group row inside `scope` (an agency card, the groups card) whose name is
// exactly `name`. A group's second line names its rates, so a substring match on the row
// would find the group too.
export function rowByName(scope: Locator, name: string): Locator {
    return scope.locator('[data-testid^="tax-row-"]').filter({
        has: scope.page().locator('[data-testid^="tax-name-"]', { hasText: exactText(name) }),
    })
}

// The PocketBase auth token is a JWT whose payload carries the user's `id`.
function authIdOf(authorization: string | undefined): string {
    const payload = authorization?.replace(/^Bearer\s+/i, '').split('.')[1]
    if (!payload) return ''
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    return (JSON.parse(json) as { id?: string }).id ?? ''
}

// Answers the caller's books_access read with a read-only level, because the seed has
// no read-only Books member. It covers the client only; the Go tests cover the server.
// Realtime is shut off, so no update replaces the faked row.
export async function fakeReadOnlyAccess(page: Page): Promise<void> {
    await page.route('**/api/realtime*', route => route.abort())
    await page.route(ACCESS_RECORDS, route => {
        const authId = authIdOf(route.request().headers().authorization)
        const item = {
            id: authId,
            user: authId,
            level: 'read_only',
            can_read: true,
            can_write: false,
            is_admin: false,
        }
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                page: 1,
                perPage: 30,
                totalItems: 1,
                totalPages: 1,
                items: [item],
            }),
        })
    })
}

// An edit dialog by its title: the dialog role on wide; on a phone core Dialog is a
// Sheet with no dialog role, so it is the sheet surface (the parent of its drag
// handle) that holds the title text.
export function dialogByTitle(page: Page, title: string): Locator {
    const sheets = page.getByTestId('sheet-handle').locator('xpath=..')
    return page
        .getByRole('dialog')
        .or(sheets)
        .filter({ has: page.getByText(title, { exact: true }) })
}

// The id at the end of a test id such as `tax-agency-card-<id>`.
async function idAfter(locator: Locator, prefix: string): Promise<string> {
    const testId = (await locator.getAttribute('data-testid')) ?? ''
    expect(testId.startsWith(prefix)).toBe(true)
    return testId.slice(prefix.length)
}

// Adds an agency through Add agency, keeping the preselected liability account, and
// returns the new card's id.
export async function createAgency(page: Page, name: string): Promise<string> {
    await page.getByTestId('taxes-add-agency').click()
    const dialog = dialogByTitle(page, 'Add agency')
    await expect(dialog).toBeVisible()
    const nameInput = page.getByTestId('tax-agency-form-name')
    await expect(nameInput).toBeFocused()
    await nameInput.fill(name)
    await page.getByTestId('tax-agency-form-save').click()
    await expect(dialog).toBeHidden()
    const card = agencyCardByName(page, name)
    await expect(card).toBeVisible()
    return idAfter(card, 'tax-agency-card-')
}

// Adds a rate through the agency card's Add rate and returns the new row's id.
export async function createRate(
    page: Page,
    agencyId: string,
    name: string,
    percent: string
): Promise<string> {
    await page.getByTestId(`tax-agency-add-rate-${agencyId}`).click()
    const dialog = dialogByTitle(page, 'Add rate')
    await expect(dialog).toBeVisible()
    const nameInput = page.getByTestId('tax-rate-form-name')
    await expect(nameInput).toBeFocused()
    await nameInput.fill(name)
    await page.getByTestId('tax-rate-form-percent').fill(percent)
    await page.getByTestId('tax-rate-form-save').click()
    await expect(dialog).toBeHidden()
    const row = rowByName(page.getByTestId(`tax-agency-card-${agencyId}`), name)
    await expect(row).toBeVisible()
    return idAfter(row, 'tax-row-')
}

// A list GET answered with no items; every other request (a create's POST) goes on to
// the server.
function emptyList(route: Route) {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ page: 1, perPage: 30, totalItems: 0, totalPages: 0, items: [] }),
    })
}

// Answers the agencies and rates list reads with no rows, so the page shows its empty
// state on the shared database. Realtime is shut off, so no event fills the lists.
export async function fakeEmptyAgencies(page: Page): Promise<void> {
    await page.route('**/api/realtime*', route => route.abort())
    await page.route(AGENCIES_RECORDS, emptyList)
    await page.route(RATES_RECORDS, emptyList)
}

// Holds every load of the agencies, so the page shows its loading state. `fail()`
// answers the held loads and every later one with a 400. Remove the route with
// `page.unrouteAll({ behavior: 'wait' })` before a Retry that should load.
export async function holdAgenciesLoad(page: Page): Promise<{ fail(): void }> {
    let fail = () => {}
    const failed = new Promise<void>(resolve => {
        fail = resolve
    })
    const handler = async (route: Route) => {
        if (route.request().method() !== 'GET') return route.continue()
        await failed
        return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ status: 400, message: 'Something went wrong.', data: {} }),
        })
    }
    await page.route(AGENCIES_RECORDS, handler)
    return { fail }
}
