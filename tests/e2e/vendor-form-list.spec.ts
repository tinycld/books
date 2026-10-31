import { expect, type Page, test, type ViewportSize } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    ALL_INACTIVE_VENDORS,
    NO_MATCH_SEARCH,
    type VendorFixtureRecord,
} from '../../tinycld/books/lib/vendor-form-fixture'
import {
    CLASSIC_SCROLLBARS,
    DESKTOP,
    effectiveOpacity,
    expectEntriesInOrder,
    expectTextInsideCell,
    headerRowWidth,
    isPhone,
    openBooksPage,
    openVendorsList,
    PHONE,
    searchVendors,
    TABLET,
    tableScroll,
    takesClickAtCenter,
    textLeft,
    textTop,
    vendorEntry,
    vendorIdOf,
} from './vendor-form-helpers'

// Reads the vendors `seed.ts` writes (lib/vendor-form-fixture.ts). That is the
// seeded-fixture exception: the interaction under test (the list header, search, Show
// inactive, layout, windowing and states) is driven through the UI; only the
// pre-existing vendors are seeded. The loading, empty, all-inactive and error states
// intercept the list request with `page.route`, which writes nothing. Each of them runs
// on a fresh page of the same browser context (`openBooksPage`), so each is that page's
// first load of the list and none relies on rows the collection parks for a while after
// the list closes.
//
// It does not cover a read-only user (no New vendor button, the reader's empty hint):
// the seed has no read-only Books member, so no spec can log in as one.
// tests/vendor-display.test.ts covers `vendorsEmptyHint` and tests/party-list.test.ts
// covers `listWriteControls`.

const VENDORS_RECORDS = '**/api/collections/books_vendors/records*'
const REALTIME = '**/api/realtime*'
const EMPTY_LIST = JSON.stringify({ items: [], page: 1, perPage: 30, totalItems: 0, totalPages: 0 })

// A fixture row as the server sends it: the relation id in place of the seed's account
// number (no account, so the row needs no seeded account id).
function asRecord({ expense_account_number: _number, ...row }: VendorFixtureRecord) {
    return {
        collectionId: 'pbc_books_vendors',
        collectionName: 'books_vendors',
        ...row,
        expense_account: '',
        // The guard's key (server/sort_keys.go).
        sort_key: row.display_name.toLowerCase(),
    }
}

// Only inactive vendors: the list has vendors, but none to show by default.
const ALL_INACTIVE_LIST = JSON.stringify({
    items: ALL_INACTIVE_VENDORS.map(asRecord),
    page: 1,
    perPage: 30,
    totalItems: 2,
    totalPages: 1,
})

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const CASCADE = 'Cascade Fuel & Fleet'
const CASCADE_COMPANY = 'Cascade Fuel and Fleet Card Services Inc.'
const CASCADE_EMAIL = 'billing@cascadefleet.example'
const CASCADE_PHONE = '(800) 555-0144'
const BLUE_RIDGE = 'Blue Ridge Insurance Agency'
const OFFICE_SUPPLY = 'Office Supply World'
const WILLAMETTE = 'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative'
const WILLAMETTE_EMAIL = 'accounts.receivable.department@willamettevalleycommercialcleaning.example'
// The seed alone has this many active vendors, and no spec deletes or deactivates one,
// so the full list never holds fewer rows.
const SEEDED_ACTIVE_VENDORS = 20

// The text of each cell of the table's header row, found as `headerRowWidth` finds it.
// A sticky header may sit in a one-child wrapper, so the walk steps through those.
function headerCellTexts(page: Page) {
    return page.getByTestId('vendors-table').evaluate(el => {
        const scrolls = (node: Element) =>
            ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
        const scroller = Array.from(el.querySelectorAll('*')).find(scrolls)
        let row = scroller?.firstElementChild?.firstElementChild ?? null
        while (row && row.children.length === 1) row = row.children[0]
        if (!row) return []
        return Array.from(row.children).map(cell => cell.textContent?.trim() ?? '')
    })
}

// Scrolls the table's vertical scroller to its end.
function scrollTableToEnd(page: Page) {
    return page.getByTestId('vendors-table').evaluate(el => {
        const scrolls = (node: Element) =>
            ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
        const scroller = Array.from(el.querySelectorAll('*')).find(scrolls)
        if (!scroller) throw new Error('no vertical scroller in vendors-table')
        scroller.scrollTop = scroller.scrollHeight
    })
}

// The test ids of the table rows mounted now, in list order.
function mountedRowIds(page: Page) {
    return page
        .locator('[data-testid="vendors-list"] [data-testid^="vendor-row-"]')
        .evaluateAll(rows => rows.map(row => row.getAttribute('data-testid') ?? ''))
}

// Steps (0) to (2): the loading, empty, all-inactive and error states. Returns the page
// whose failed load was retried, with the list loaded.
async function showListStates(first: Page, size: ViewportSize) {
    // (0) Loading: the first list request is held until the test lets it answer empty.
    // Other specs may create vendors meanwhile; realtime would file them under the
    // faked empty answer, so it is shut off on this page.
    let answerEmpty = () => {}
    const held = new Promise<void>(resolve => {
        answerEmpty = resolve
    })
    await first.route(REALTIME, route => route.abort())
    await first.route(VENDORS_RECORDS, async route => {
        await held
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: EMPTY_LIST,
        })
    })
    await openVendorsList(first)
    await expect(first.getByTestId('vendors-loading')).toBeVisible()
    answerEmpty()

    // (1) No vendors at all: no toolbar before a vendor exists.
    const empty = first.getByTestId('vendors-empty')
    await expect(empty).toContainText('No vendors yet')
    await expect(empty).toContainText('Add the people and companies you buy from.')
    await expect(first.getByTestId('vendors-empty-new')).toHaveText('New vendor')
    await expect(first.getByTestId('vendors-loading')).toHaveCount(0)
    await expect(first.getByTestId('vendors-no-match')).toHaveCount(0)
    await expect(first.getByTestId('vendors-search')).toHaveCount(0)
    await first.close()

    // (1b) Every vendor inactive, no search, Show inactive off.
    const quiet = await openBooksPage(first, size, async fresh => {
        await fresh.route(REALTIME, route => route.abort())
        await fresh.route(VENDORS_RECORDS, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: ALL_INACTIVE_LIST,
            })
        )
    })
    await openVendorsList(quiet)
    const allInactive = quiet.getByTestId('vendors-all-inactive')
    await expect(allInactive).toContainText('No active vendors')
    await expect(quiet.getByTestId('vendors-empty')).toHaveCount(0)
    await expect(quiet.getByTestId('vendors-no-match')).toHaveCount(0)
    await expect(quiet.getByTestId('vendors-search')).toBeVisible()
    const quietChip = quiet.getByTestId('vendors-show-inactive')
    await expect(quietChip).toHaveAttribute('aria-checked', 'false')
    await quiet.getByTestId('vendors-all-inactive-show').click()
    for (const name of ['Coastal Coffee Roasters', 'Old Town Print Shop']) {
        const entry = vendorEntry(quiet, name)
        await expect(entry).toBeVisible()
        await expect(entry.getByText('Inactive', { exact: true })).toBeVisible()
    }
    await expect(allInactive).toHaveCount(0)
    await expect(quietChip).toHaveAttribute('aria-checked', 'true')
    await quiet.close()

    // (2) A failed load shows the banner; Retry rebuilds the failed query.
    const page = await openBooksPage(first, size, fresh =>
        fresh.route(VENDORS_RECORDS, route =>
            route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
        )
    )
    await openVendorsList(page)
    const banner = page.getByTestId('vendors-banner')
    await expect(banner).toContainText('Could not load vendors')
    await expect(page.getByTestId('vendors-retry')).toHaveText('Retry')
    await page.unroute(VENDORS_RECORDS)
    await page.getByTestId('vendors-retry').click()
    await expect(banner).toHaveCount(0)
    await searchVendors(page, OFFICE_SUPPLY)
    await expect(vendorEntry(page, OFFICE_SUPPLY)).toBeVisible()
    return page
}

// Steps (5) and (6): search over every field, and one flat list in name order.
async function searchesOneFlatList(page: Page) {
    // (5) Search ignores case over email, phone and company.
    for (const [query, name] of [
        ['BILLING@CASCADEFLEET', CASCADE],
        ['(503) 555-0187', BLUE_RIDGE],
        ['pacificorp', 'Pacific Power'],
    ] as const) {
        await searchVendors(page, query)
        await expectEntriesInOrder(page, [name])
    }

    // (6) One flat list in name order: no vendor is indented under another.
    await searchVendors(page, 'Harbor')
    await expectEntriesInOrder(page, ['First Harbor Bank', 'Harbor Freight Logistics'])
    const bank = vendorEntry(page, 'First Harbor Bank')
    const freight = vendorEntry(page, 'Harbor Freight Logistics')
    await expect
        .poll(async () =>
            Math.abs(
                (await textLeft(freight, 'Harbor Freight Logistics')) -
                    (await textLeft(bank, 'First Harbor Bank'))
            )
        )
        .toBeLessThan(1)
}

// Step (9) on desktop: the table's width, columns and windowing.
async function tableLayout(page: Page) {
    const table = page.getByTestId('vendors-table')
    await expect
        .poll(async () => (await table.boundingBox())?.width ?? 0)
        .toBeGreaterThanOrEqual(540)

    // Classic scrollbars, as Windows and Linux (CI) draw them: the rows' stable
    // gutter takes width from them. macOS draws overlay scrollbars, which take none.
    await page.addStyleTag({ content: CLASSIC_SCROLLBARS })
    await page.setViewportSize(TABLET)
    await expect(table).toBeVisible()
    await expect
        .poll(async () => (await page.getByTestId('vendors-list').boundingBox())?.width ?? 0)
        .toBeLessThan(540)
    await expect
        .poll(async () => {
            const { scrollWidth, clientWidth } = await tableScroll(page)
            return scrollWidth >= 540 && scrollWidth > clientWidth
        })
        .toBe(true)
    await expect.poll(() => headerRowWidth(page)).toBeGreaterThanOrEqual(540)
    await page.setViewportSize(DESKTOP)

    await searchVendors(page, 'Willamette Valley')
    const willametteId = await vendorIdOf(page, WILLAMETTE)
    await expectTextInsideCell(page.getByTestId(`vendor-cell-name-${willametteId}`), WILLAMETTE)
    await expectTextInsideCell(
        page.getByTestId(`vendor-cell-email-${willametteId}`),
        WILLAMETTE_EMAIL
    )

    const header = (label: string) => table.getByText(new RegExp(`^${label}$`, 'i')).first()
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
    // Exactly these columns: no balance or other column; the last is the menu cell.
    await expect.poll(() => headerCellTexts(page)).toEqual(['Name', 'Email', 'Phone', ''])

    // No column sorts: pressing a header keeps the name order.
    await searchVendors(page, 'Harbor')
    await header('Name').click()
    await expectEntriesInOrder(page, ['First Harbor Bank', 'Harbor Freight Logistics'])

    // Windowing (the card list runs the same useRowWindow): a short window mounts only
    // the rows near the scroll position. Other specs add vendors to the same list, so
    // the step names no row; it compares the rows mounted before and after the scroll.
    await searchVendors(page, '')
    await page.setViewportSize({ width: 1280, height: 300 })
    await expect.poll(async () => (await mountedRowIds(page)).length).toBeGreaterThan(0)
    await expect
        .poll(async () => (await mountedRowIds(page)).length)
        .toBeLessThan(SEEDED_ACTIVE_VENDORS)
    const atTop = await mountedRowIds(page)
    await scrollTableToEnd(page)
    // At the end, the window holds rows it did not mount at the top and lets go of the
    // first row, while it still mounts fewer rows than the list holds.
    await expect
        .poll(async () => {
            const atEnd = await mountedRowIds(page)
            return {
                mountsNewRows: atEnd.some(id => !atTop.includes(id)),
                dropsFirstRow: !atEnd.includes(atTop[0]),
                staysWindowed: atEnd.length > 0 && atEnd.length < SEEDED_ACTIVE_VENDORS,
            }
        })
        .toEqual({ mountsNewRows: true, dropsFirstRow: true, staysWindowed: true })
    await page.setViewportSize(DESKTOP)
}

// Step (10): the transparent child stack over the list takes no clicks: the search
// field, the Show inactive toggle and a row are each what a click at their center reaches.
async function listTakesClicks(page: Page) {
    await expect.poll(() => takesClickAtCenter(page.getByTestId('vendors-search'))).toBe(true)
    await expect
        .poll(() => takesClickAtCenter(page.getByTestId('vendors-show-inactive')))
        .toBe(true)
    await searchVendors(page, 'Office Supply')
    await expect.poll(() => takesClickAtCenter(vendorEntry(page, OFFICE_SUPPLY))).toBe(true)
}

// Step (11): back to the Lists hub, which shows the Vendors card.
async function backToListsHub(page: Page) {
    await page.getByTestId('vendors-back').click()
    const card = page.getByTestId('books-list-card-vendors')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Vendors')
    await expect(card).toContainText('People and companies you buy from')
    await expect(page.getByTestId('vendors-list')).not.toBeVisible()
}

test.describe('vendor-form: vendors list', () => {
    for (const [sizeName, size] of SIZES) {
        test(`finds, filters and shows every list state (${sizeName})`, async ({ page: first }) => {
            await login(first)
            await navigateToPackage(first, 'books')
            await first.setViewportSize(size)
            // Steps (0) to (2), (5), (6), (10) and (11) run the same code at both sizes
            // (ListBanner, ListEmptyState, the loading body, search, the child stack, the
            // hub), so only the desktop run takes them. The phone run takes the steps whose
            // phone path runs other code: PartyCard, the Books New FAB and the narrow
            // ListToolbar.
            const phone = isPhone(first)
            const page = phone ? first : await showListStates(first, size)
            if (phone) await openVendorsList(page)

            // (3) Header.
            await expect(page.getByTestId('vendors-back')).toContainText('All lists')
            await expect(page.getByTestId('vendors-title')).toHaveText('Vendors')
            await expect(page.getByTestId('vendor-new-header')).toHaveText('New vendor')
            await expect(page.getByTestId('vendors-search')).toHaveAttribute(
                'placeholder',
                'Search vendors'
            )
            if (phone) {
                // Core's FAB has no button role.
                await expect(page.getByLabel('New', { exact: true })).toBeVisible()
            }

            // (4) A vendor's lines: name, then company (only when it differs), email, phone.
            await searchVendors(page, 'Cascade')
            await expectEntriesInOrder(page, [CASCADE])
            if (phone) {
                const card = vendorEntry(page, CASCADE)
                const lines = [CASCADE, CASCADE_COMPANY, CASCADE_EMAIL, CASCADE_PHONE]
                for (const line of lines)
                    await expect(card.getByText(line, { exact: true })).toBeVisible()
                await expect
                    .poll(async () => {
                        const tops = await Promise.all(lines.map(line => textTop(card, line)))
                        return tops.every((top, i) => i === 0 || top > tops[i - 1])
                    })
                    .toBe(true)
            } else {
                const id = await vendorIdOf(page, CASCADE)
                const nameCell = page.getByTestId(`vendor-cell-name-${id}`)
                const companyCell = page.getByTestId(`vendor-cell-company-${id}`)
                await expect(nameCell).toContainText(CASCADE)
                await expect(companyCell).toHaveText(CASCADE_COMPANY)
                await expect
                    .poll(async () => {
                        const company = (await companyCell.boundingBox())?.y ?? -1
                        return company > (await textTop(nameCell, CASCADE))
                    })
                    .toBe(true)
                await expect(page.getByTestId(`vendor-cell-email-${id}`)).toHaveText(CASCADE_EMAIL)
                await expect(page.getByTestId(`vendor-cell-phone-${id}`)).toHaveText(CASCADE_PHONE)
            }
            await searchVendors(page, 'Blue Ridge')
            await expectEntriesInOrder(page, [BLUE_RIDGE])
            if (phone) {
                await expect(
                    vendorEntry(page, BLUE_RIDGE).getByText(BLUE_RIDGE, { exact: true })
                ).toHaveCount(1)
            } else {
                const blueRidgeId = await vendorIdOf(page, BLUE_RIDGE)
                await expect(page.getByTestId(`vendor-cell-company-${blueRidgeId}`)).toHaveCount(0)
            }

            if (!phone) await searchesOneFlatList(page)

            // (7) Inactive vendors show, dimmed and labelled, only with Show inactive on.
            await searchVendors(page, 'Coastal')
            const noMatch = page.getByTestId('vendors-no-match')
            await expect(noMatch).toContainText('No vendors match')
            const showInactive = page.getByTestId('vendors-show-inactive')
            await expect(showInactive).toHaveAttribute('aria-checked', 'false')
            await showInactive.click()
            await expect(showInactive).toHaveAttribute('aria-checked', 'true')
            const coastal = vendorEntry(page, 'Coastal Coffee Roasters')
            await expect(coastal).toBeVisible()
            await expect(coastal.getByText('Inactive', { exact: true })).toBeVisible()
            await expect(noMatch).toHaveCount(0)
            await expect
                .poll(() =>
                    effectiveOpacity(coastal.getByText('Coastal Coffee Roasters', { exact: true }))
                )
                .toBeLessThan(1)
            await showInactive.click()
            await expect(showInactive).toHaveAttribute('aria-checked', 'false')
            await expect(coastal).toHaveCount(0)
            await expect(noMatch).toContainText('No vendors match')

            // (8) Clear search empties the field and brings the rows back.
            await searchVendors(page, NO_MATCH_SEARCH)
            await expect(noMatch).toContainText('No vendors match')
            await page.getByTestId('vendors-clear-search').click()
            await expect(page.getByTestId('vendors-search')).toHaveValue('')
            await expect(noMatch).toHaveCount(0)
            await expect(vendorEntry(page, OFFICE_SUPPLY)).toBeVisible()

            // (9) Layout.
            if (phone) {
                await expect(page.getByTestId('vendors-cards')).toBeVisible()
                await expect(page.getByTestId('vendors-table')).not.toBeVisible()
                return
            }
            await tableLayout(page)
            await listTakesClicks(page)
            await backToListsHub(page)
        })
    }
})
