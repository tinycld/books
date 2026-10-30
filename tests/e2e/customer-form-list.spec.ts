import { expect, type Locator, type Page, test, type ViewportSize } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { NO_MATCH_SEARCH } from '../../tinycld/books/lib/customer-form-fixture'
import {
    customerEntries,
    customerEntry,
    customerIdOf,
    DESKTOP,
    isPhone,
    openCustomersList,
    PHONE,
    searchCustomers,
} from './customer-form-helpers'

// Reads the customers `seed.ts` writes (lib/customer-form-fixture.ts). That is the
// seeded-fixture exception: the interaction under test (the list header, search,
// Show inactive, layout and states) is driven through the UI; only the pre-existing
// customers are seeded. The loading, empty, all-inactive and error states intercept
// the list request with `page.route`, which writes nothing. Each of them runs on a new
// page of the same browser context, so each is that page's first load of the list and
// none relies on rows the collection parks for a while after the list closes.
//
// It does not cover a read-only user (no New customer button): the seed has no
// read-only Books member, so no spec can log in as one. Windowing is not asserted:
// the seed is shorter than one window; tests/use-row-window.test.tsx covers
// useRowWindow.

const CUSTOMERS_RECORDS = '**/api/collections/books_customers/records*'
const REALTIME = '**/api/realtime*'
const EMPTY_LIST = JSON.stringify({ items: [], page: 1, perPage: 30, totalItems: 0, totalPages: 0 })

function inactiveRecord(id: string, displayName: string) {
    return {
        collectionId: 'pbc_books_customers',
        collectionName: 'books_customers',
        id,
        display_name: displayName,
        company: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        mobile: '',
        website: '',
        billing_address: null,
        shipping_address: null,
        notes: '',
        inactive: true,
        form: '',
        fields: null,
        parent: '',
        created: '2026-01-05 10:00:00.000Z',
        updated: '2026-01-05 10:00:00.000Z',
    }
}

// Only inactive customers: the list has customers, but none to show by default.
const QUIET_NAMES = ['Quietwater Feed Store', 'Shuttered Lantern Press'] as const
const ALL_INACTIVE_LIST = JSON.stringify({
    items: [
        inactiveRecord('inactiveonly001', QUIET_NAMES[0]),
        inactiveRecord('inactiveonly002', QUIET_NAMES[1]),
    ],
    page: 1,
    perPage: 30,
    totalItems: 2,
    totalPages: 1,
})
// Still the tablet breakpoint (table, not cards). Its content area is 768 - 64 (rail) - 175
// (tablet sidebar) = 529 px, narrower than the table's 540 px minimum; at 800 it is 561 px.
const TABLET = { width: 768, height: 900 }
const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const HARBORVIEW = 'Harborview Hospitality Group'
const NORTHWIND = 'Northwind Traders'
const ST_JUDE = 'St. Jude Community Hospital Foundation of the Greater Willamette Valley'
const ST_JUDE_EMAIL = 'theodore.okonkwo-lindqvist@stjudecommunityhospitalfoundation.org'

// A new page in this test's browser context, logged in, in Books, at `size`. `intercept`
// runs before the page loads anything, so its routes catch the page's first list request
// even when Books reopens at the Customers list.
async function openBooksPage(
    page: Page,
    size: ViewportSize,
    intercept: (fresh: Page) => Promise<void>
) {
    const fresh = await page.context().newPage()
    await intercept(fresh)
    await login(fresh)
    await navigateToPackage(fresh, 'books')
    await fresh.setViewportSize(size)
    return fresh
}

async function textLeft(entry: Locator, name: string) {
    return (await entry.getByText(name, { exact: true }).boundingBox())?.x ?? 0
}

async function textTop(scope: Locator, text: string) {
    return (await scope.getByText(text, { exact: true }).boundingBox())?.y ?? -1
}

// The opacity the user sees on the element: its own times every ancestor's.
function effectiveOpacity(locator: Locator) {
    return locator.evaluate(el => {
        let opacity = 1
        for (let node: Element | null = el; node; node = node.parentElement) {
            opacity *= Number(getComputedStyle(node).opacity)
        }
        return opacity
    })
}

const CLASSIC_SCROLLBARS = '::-webkit-scrollbar { width: 15px; height: 15px; }'

// The horizontal scroller of the table: the test id's element, or the first one inside it.
function tableScroll(page: Page) {
    return page.getByTestId('customers-table').evaluate(el => {
        const scrolls = (node: Element) =>
            ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)
        const scroller = scrolls(el) ? el : Array.from(el.querySelectorAll('*')).find(scrolls)
        return { scrollWidth: scroller?.scrollWidth ?? 0, clientWidth: scroller?.clientWidth ?? 0 }
    })
}

// True when a click at the element's center reaches the element itself, not a layer above it.
function takesClickAtCenter(locator: Locator) {
    return locator.evaluate(el => {
        const box = el.getBoundingClientRect()
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return hit !== null && (hit === el || el.contains(hit))
    })
}

// The table's header row (it has no test id): the first child of the vertical scroller's
// content, measured only when it holds the column titles.
function headerRowWidth(page: Page) {
    return page.getByTestId('customers-table').evaluate(el => {
        const scrolls = (node: Element) =>
            ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
        const scroller = Array.from(el.querySelectorAll('*')).find(scrolls)
        const row = scroller?.firstElementChild?.firstElementChild
        if (!row || !/Name.*Email.*Phone/is.test(row.textContent ?? '')) return 0
        return row.getBoundingClientRect().width
    })
}

async function expectTextInsideCell(cell: Locator, text: string) {
    const label = cell.getByText(text, { exact: true })
    await expect(label).toBeVisible()
    await expect
        .poll(async () => {
            const [cellBox, labelBox] = await Promise.all([cell.boundingBox(), label.boundingBox()])
            if (!cellBox || !labelBox) return false
            return (
                labelBox.width > 40 &&
                labelBox.x + labelBox.width <= cellBox.x + cellBox.width + 0.5
            )
        })
        .toBe(true)
}

async function expectEntriesInOrder(page: Page, names: readonly string[]) {
    const entries = customerEntries(page)
    await expect(entries).toHaveCount(names.length)
    for (const [index, name] of names.entries()) {
        await expect(entries.nth(index).getByText(name, { exact: true })).toBeVisible()
    }
}

test.describe('customer-form: customers list', () => {
    for (const [sizeName, size] of SIZES) {
        test(`finds, filters and shows every list state (${sizeName})`, async ({ page: first }) => {
            await login(first)
            await navigateToPackage(first, 'books')
            await first.setViewportSize(size)

            // (0) Loading: the first list request is held until the test lets it answer empty.
            // Other specs may create customers meanwhile; realtime would file them under the
            // faked empty answer, so it is shut off for the empty steps only.
            let answerEmpty = () => {}
            const held = new Promise<void>(resolve => {
                answerEmpty = resolve
            })
            await first.route(REALTIME, route => route.abort())
            await first.route(CUSTOMERS_RECORDS, async route => {
                await held
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: EMPTY_LIST,
                })
            })
            await openCustomersList(first)
            await expect(first.getByTestId('customers-loading')).toBeVisible()
            answerEmpty()

            // (1) No customers at all.
            const empty = first.getByTestId('customers-empty')
            await expect(empty).toContainText('No customers yet')
            await expect(first.getByTestId('customers-empty-new')).toHaveText('New customer')
            await expect(first.getByTestId('customers-loading')).toHaveCount(0)
            await expect(first.getByTestId('customers-no-match')).toHaveCount(0)

            await first.close()

            // (1b) Every customer inactive, no search, Show inactive off.
            const quiet = await openBooksPage(first, size, async fresh => {
                await fresh.route(REALTIME, route => route.abort())
                await fresh.route(CUSTOMERS_RECORDS, route =>
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: ALL_INACTIVE_LIST,
                    })
                )
            })
            await openCustomersList(quiet)
            await expect(quiet.getByText('No active customers', { exact: true })).toBeVisible()
            await expect(quiet.getByTestId('customers-empty')).toHaveCount(0)
            await expect(quiet.getByTestId('customers-no-match')).toHaveCount(0)
            await expect(quiet.getByTestId('customers-search')).toBeVisible()
            const quietChip = quiet.getByTestId('customers-show-inactive')
            await expect(quietChip).toBeVisible()
            await expect(quietChip).toHaveAttribute('aria-checked', 'false')
            const showInactiveButton = quiet
                .getByTestId('customers-list')
                .getByRole('button', { name: 'Show inactive', exact: true })
                .and(quiet.locator(':not([data-testid="customers-show-inactive"])'))
            await expect(showInactiveButton).toBeVisible()
            await showInactiveButton.click()
            for (const name of QUIET_NAMES) {
                const entry = customerEntry(quiet, name)
                await expect(entry).toBeVisible()
                await expect(entry.getByText('Inactive', { exact: true })).toBeVisible()
            }
            await expect(quiet.getByText('No active customers', { exact: true })).toHaveCount(0)
            await expect(quietChip).toHaveAttribute('aria-checked', 'true')
            await quiet.close()

            // (2) A failed load shows the banner; Retry rebuilds the failed query.
            const page = await openBooksPage(first, size, async fresh => {
                await fresh.route(CUSTOMERS_RECORDS, route =>
                    route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
                )
            })
            const phone = isPhone(page)
            await openCustomersList(page)
            const banner = page.getByTestId('customers-banner')
            await expect(banner).toContainText('Could not load customers')
            await expect(page.getByTestId('customers-retry')).toHaveText('Retry')
            await page.unroute(CUSTOMERS_RECORDS)
            await page.getByTestId('customers-retry').click()
            await expect(banner).toHaveCount(0)
            await searchCustomers(page, 'Aspen Ridge Dental')
            await expect(customerEntry(page, 'Aspen Ridge Dental')).toBeVisible()

            // (3) Header.
            await expect(page.getByTestId('customers-back')).toContainText('All lists')
            await expect(page.getByTestId('customers-title')).toHaveText('Customers')
            await expect(page.getByTestId('customer-new-header')).toHaveText('New customer')
            await expect(page.getByTestId('customers-search')).toHaveAttribute(
                'placeholder',
                'Search customers'
            )
            if (phone) {
                await expect(page.getByLabel('New', { exact: true })).toBeVisible()
            }

            // (4) A parent and its two sub-customers, indented, in name order.
            await searchCustomers(page, 'Harborview')
            await expectEntriesInOrder(page, [
                HARBORVIEW,
                'Harborview Events',
                'Harborview Kitchen',
            ])
            const parent = customerEntry(page, HARBORVIEW)
            const events = customerEntry(page, 'Harborview Events')
            const kitchen = customerEntry(page, 'Harborview Kitchen')
            await expect
                .poll(
                    async () =>
                        (await textLeft(events, 'Harborview Events')) -
                        (await textLeft(parent, HARBORVIEW))
                )
                .toBeGreaterThan(8)
            await expect
                .poll(
                    async () =>
                        (await textLeft(kitchen, 'Harborview Kitchen')) -
                        (await textLeft(parent, HARBORVIEW))
                )
                .toBeGreaterThan(8)
            if (phone) {
                const lines = [
                    HARBORVIEW,
                    'Harborview Hospitality Group LLC',
                    'accounts.payable@harborviewhospitality.com',
                    '(206) 555-0142',
                ]
                for (const line of lines)
                    await expect(parent.getByText(line, { exact: true })).toBeVisible()
                await expect
                    .poll(async () => {
                        const tops = await Promise.all(lines.map(line => textTop(parent, line)))
                        return tops.every((top, i) => i === 0 || top > tops[i - 1])
                    })
                    .toBe(true)
            } else {
                const id = await customerIdOf(page, HARBORVIEW)
                const nameCell = page.getByTestId(`customer-cell-name-${id}`)
                const companyCell = page.getByTestId(`customer-cell-company-${id}`)
                await expect(nameCell).toContainText(HARBORVIEW)
                await expect(companyCell).toHaveText('Harborview Hospitality Group LLC')
                await expect
                    .poll(async () => {
                        const company = (await companyCell.boundingBox())?.y ?? -1
                        return company > (await textTop(nameCell, HARBORVIEW))
                    })
                    .toBe(true)
                await expect(page.getByTestId(`customer-cell-email-${id}`)).toHaveText(
                    'accounts.payable@harborviewhospitality.com'
                )
                await expect(page.getByTestId(`customer-cell-phone-${id}`)).toHaveText(
                    '(206) 555-0142'
                )
            }

            // (5) Search is case-insensitive over email, phone and company.
            for (const [query, name] of [
                ['BILLING@NORTHWIND', NORTHWIND],
                ['(503) 555-0110', NORTHWIND],
                ['cedar and pine', 'Cedar & Pine Landscaping'],
            ] as const) {
                await searchCustomers(page, query)
                await expectEntriesInOrder(page, [name])
            }

            // (6) A matching sub-customer keeps its parent; its other sub-customers drop out.
            await searchCustomers(page, 'Seattle warehouse')
            await expectEntriesInOrder(page, [NORTHWIND, 'Northwind Seattle warehouse'])
            await expect(customerEntry(page, 'Northwind Portland store')).toHaveCount(0)

            // (7) Inactive customers show, dimmed and labelled, only with Show inactive on.
            await searchCustomers(page, 'Old Mill')
            const noMatch = page.getByTestId('customers-no-match')
            await expect(noMatch).toContainText('No customers match')
            const showInactive = page.getByTestId('customers-show-inactive')
            await expect(showInactive).toHaveAttribute('aria-checked', 'false')
            await showInactive.click()
            await expect(showInactive).toHaveAttribute('aria-checked', 'true')
            const oldMill = customerEntry(page, 'Old Mill Bakery')
            await expect(oldMill).toBeVisible()
            await expect(oldMill.getByText('Inactive', { exact: true })).toBeVisible()
            await expect(noMatch).toHaveCount(0)
            await expect
                .poll(() => effectiveOpacity(oldMill.getByText('Old Mill Bakery', { exact: true })))
                .toBeLessThan(1)
            await showInactive.click()
            await expect(showInactive).toHaveAttribute('aria-checked', 'false')
            await expect(oldMill).toHaveCount(0)
            await expect(noMatch).toContainText('No customers match')

            // (8) Clear search empties the field and brings the rows back.
            await searchCustomers(page, NO_MATCH_SEARCH)
            await expect(noMatch).toContainText('No customers match')
            await page.getByTestId('customers-clear-search').click()
            await expect(page.getByTestId('customers-search')).toHaveValue('')
            await expect(noMatch).toHaveCount(0)
            await expect(customerEntry(page, 'Aspen Ridge Dental')).toBeVisible()

            // (9) Layout.
            if (phone) {
                await expect(page.getByTestId('customers-cards')).toBeVisible()
                await expect(page.getByTestId('customers-table')).not.toBeVisible()
            } else {
                const table = page.getByTestId('customers-table')
                await expect
                    .poll(async () => (await table.boundingBox())?.width ?? 0)
                    .toBeGreaterThanOrEqual(540)

                // Classic scrollbars, as Windows and Linux (CI) draw them: the rows' stable
                // gutter takes width from them. macOS draws overlay scrollbars, which take none.
                await page.addStyleTag({ content: CLASSIC_SCROLLBARS })
                await page.setViewportSize(TABLET)
                await expect(table).toBeVisible()
                await expect
                    .poll(
                        async () =>
                            (await page.getByTestId('customers-list').boundingBox())?.width ?? 0
                    )
                    .toBeLessThan(540)
                await expect
                    .poll(async () => {
                        const { scrollWidth, clientWidth } = await tableScroll(page)
                        return scrollWidth >= 540 && scrollWidth > clientWidth
                    })
                    .toBe(true)
                await expect.poll(() => headerRowWidth(page)).toBeGreaterThanOrEqual(540)
                await page.setViewportSize(DESKTOP)

                await searchCustomers(page, 'St. Jude Community')
                const stJudeId = await customerIdOf(page, ST_JUDE)
                await expectTextInsideCell(
                    page.getByTestId(`customer-cell-name-${stJudeId}`),
                    ST_JUDE
                )
                await expectTextInsideCell(
                    page.getByTestId(`customer-cell-email-${stJudeId}`),
                    ST_JUDE_EMAIL
                )

                const header = (label: string) =>
                    table.getByText(new RegExp(`^${label}$`, 'i')).first()
                await expect(header('Name')).toBeVisible()
                await expect
                    .poll(async () => {
                        const [name, email, phoneHeader] = await Promise.all(
                            ['Name', 'Email', 'Phone'].map(
                                async label => (await header(label).boundingBox())?.x ?? -1
                            )
                        )
                        return name >= 0 && name < email && email < phoneHeader
                    })
                    .toBe(true)
            }

            // (10) The transparent child stack over the list takes no clicks: the search field,
            // the Show inactive toggle and a row are each what a click at their center reaches.
            await expect
                .poll(() => takesClickAtCenter(page.getByTestId('customers-search')))
                .toBe(true)
            await expect.poll(() => takesClickAtCenter(showInactive)).toBe(true)
            await searchCustomers(page, 'Fox Hollow')
            await expect
                .poll(() => takesClickAtCenter(customerEntry(page, 'Fox Hollow Vineyards')))
                .toBe(true)

            // (11) Back to the Lists hub.
            await page.getByTestId('customers-back').click()
            await expect(page.getByTestId('books-list-card-customers')).toBeVisible()
            await expect(page.getByTestId('customers-list')).not.toBeVisible()
        })
    }
})
