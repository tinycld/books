import { expect, type Locator, type Page } from '@playwright/test'
import { DESKTOP, isPhone, PHONE } from './account-register-helpers'

// Shared by the customer-form e2e specs. Customers are created by driving the
// form, never by raw PocketBase writes. The database is shared by every spec
// file on two workers, so a spec never edits a seeded customer, names its own
// rows with `uniqueName`, and finds rows through `customers-search` (the list
// renders a window of rows, so a row may be out of view without a search).

export { DESKTOP, isPhone, PHONE }

// Wide enough for the panel surface (DETAIL_PANEL_MIN_WINDOW is 1360).
export const WIDE = { width: 1600, height: 1000 }

function viewportName(page: Page) {
    const width = page.viewportSize()?.width ?? DESKTOP.width
    if (width >= WIDE.width) return 'wide'
    return isPhone(page) ? 'phone' : 'desktop'
}

// A name no other spec, viewport or earlier run can have.
export function uniqueName(page: Page, label: string) {
    return `${label} ${viewportName(page)} ${Date.now()}`
}

function entryPrefix(page: Page) {
    return isPhone(page) ? 'customer-card-' : 'customer-row-'
}

// Every customer row (desktop) or card (phone) in the list, in screen order.
export function customerEntries(page: Page): Locator {
    return page.getByTestId('customers-list').locator(`[data-testid^="${entryPrefix(page)}"]`)
}

// The row (desktop) or card (phone) whose name is exactly `name`. Sub-customers
// carry their parent's company line, so a substring match would find them too.
export function customerEntry(page: Page, name: string): Locator {
    return customerEntries(page).filter({ has: page.getByText(name, { exact: true }) })
}

// `customer-page` or `customer-panel`, whichever is shown.
export function customerSurface(page: Page): Locator {
    return page
        .getByTestId('customer-page')
        .or(page.getByTestId('customer-panel'))
        .filter({ visible: true })
}

// From anywhere in Books to the Customers list, with no customer open.
export async function openCustomersList(page: Page) {
    const list = page.getByTestId('customers-list')
    const pageBack = page.getByTestId('customer-back')
    const panelClose = page.getByTestId('customer-close')
    const notFoundBack = page.getByTestId('customer-not-found-back')
    const listCard = page.getByTestId('books-list-card-customers')
    // A fresh page may reopen Books at its last route (the list, or a customer), and pressing
    // the nav item over either would stack a second screen.
    await expect(
        list.or(pageBack).or(panelClose).or(notFoundBack).or(listCard).first()
    ).toBeAttached()

    for (const leave of [pageBack, panelClose, notFoundBack]) {
        if (await leave.isVisible()) {
            await leave.click()
            await expect(leave).toBeHidden()
        }
    }
    if (await list.isVisible()) return

    if (!isPhone(page) && !(await listCard.isVisible())) {
        await page.getByTestId('books-nav-lists').click()
    }
    await listCard.click()
    await expect(list).toBeVisible()
}

// Clicks the field first, so a layer over the list that takes the pointer fails here.
export async function searchCustomers(page: Page, text: string) {
    const search = page.getByTestId('customers-search')
    await search.click()
    await search.fill(text)
    await expect(search).toHaveValue(text)
}

export async function customerIdOf(page: Page, name: string): Promise<string> {
    const entry = customerEntry(page, name)
    await expect(entry).toHaveCount(1)
    const testId = await entry.getAttribute('data-testid')
    const prefix = entryPrefix(page)
    if (!testId?.startsWith(prefix)) throw new Error(`no ${prefix}<id> test id for ${name}`)
    return testId.slice(prefix.length)
}

// The Customers list must be reachable (Books open). Searches for the customer
// and opens it from its row or card.
export async function openCustomer(page: Page, name: string) {
    await openCustomersList(page)
    await searchCustomers(page, name)
    await customerEntry(page, name).click()
    await expect(customerSurface(page)).toBeVisible()
}
