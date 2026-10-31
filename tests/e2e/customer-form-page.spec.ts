import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    boxOf,
    customerIdOf,
    customersBase,
    DESKTOP,
    field,
    fieldCellsOutOfOrder,
    inputKinds,
    isDisabled,
    isPhone,
    navigateInApp,
    openCustomer,
    openCustomersList,
    openNewCustomer,
    PHONE,
    searchCustomers,
    sideBySide,
    stacked,
    takesClickAtCenter,
} from './customer-form-helpers'

// The customer page (the surface below 1360 px) and the layout of the form on it. It
// reads the customers `seed.ts` writes (lib/customer-form-fixture.ts) and edits none of
// them: no form here is saved.
//
// Not covered here: a read-only user (the "Customer" title and read-only fields) cannot
// be driven, because the seed has no read-only Books member; tests/customer-display.test.ts
// covers the title rule. The native keyboards (email, phone, URL) and the iOS swipe back
// and Android hardware back are native-only and are not run; the web input types are
// asserted instead. Admin custom fields are covered by tests/customer-host.test.ts
// (`insertCustomBefore`) and by core's forms tests. The panel surface is checkpoint 6.
// That an all-empty billing address leaves the form clean has no visible effect until
// Save and the leave guard exist (checkpoint 5).

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const FIELD_ORDER = [
    'display_name',
    'company',
    'first_name',
    'last_name',
    'email',
    'phone',
    'mobile',
    'website',
    'parent',
    'billing_address',
    'shipping_address',
    'notes',
] as const

const PAIRS = [
    ['first_name', 'last_name'],
    ['email', 'phone'],
    ['mobile', 'website'],
] as const

const CITY_LINE = ['city', 'region', 'postal_code'] as const

const HARBORVIEW = 'Harborview Hospitality Group'
const NORTHWIND = 'Northwind Traders'
const SEATTLE = 'Northwind Seattle warehouse'
const ASPEN = 'Aspen Ridge Dental'

// zod's message for the 200-character limit on each address part (`part` in lib/address.ts,
// `z.string().max(200)` with no message of its own).
const PART_TOO_LONG = 'Too big: expected string to have <=200 characters'

const cellsOutOfOrder = (page: Page) => fieldCellsOutOfOrder(page, FIELD_ORDER)

function parentOptions(page: Page) {
    return page.locator('[data-testid^="customer-parent-option-"]')
}

function parentOption(page: Page, name: string) {
    return parentOptions(page).filter({ hasText: name })
}

async function pickParent(page: Page, name: string) {
    await page.getByTestId('customer-parent').click()
    const search = page.getByTestId('customer-parent-search')
    await search.fill(name)
    const option = parentOption(page, name)
    await expect(option).toHaveCount(1)
    await option.click()
    await expect(search).toBeHidden()
}

async function pickNoParent(page: Page) {
    await page.getByTestId('customer-parent').click()
    const search = page.getByTestId('customer-parent-search')
    await expect(search).toBeVisible()
    await page.getByTestId('customer-parent-none').click()
    await expect(search).toBeHidden()
}

// The space from the bottom of a cell's control to the label of the cell below it.
async function gapBelow(control: Locator, nextLabel: Locator) {
    const [above, below] = await Promise.all([boxOf(control), boxOf(nextLabel)])
    if (!above || !below) return null
    return below.y - (above.y + above.height)
}

// How far the space below the Parent customer picker differs from the space below a
// text field (Website, whose cell sits just above it).
async function parentGapMismatch(page: Page) {
    const [afterWebsite, afterParent] = await Promise.all([
        gapBelow(page.getByTestId('form-input-website'), page.locator('#form-label-parent')),
        gapBelow(page.getByTestId('customer-parent'), page.locator('#form-label-billing_address')),
    ])
    if (afterWebsite === null || afterParent === null) return Number.POSITIVE_INFINITY
    return Math.abs(afterParent - afterWebsite)
}

// True when `text` starts below `input`, starts inside its left and right edges, and
// ends above `next` (the part input below it).
async function sitsUnder(input: Locator, text: Locator, next: Locator) {
    const [inputBox, textBox, nextBox] = await Promise.all([boxOf(input), boxOf(text), boxOf(next)])
    if (!inputBox || !textBox || !nextBox) return false
    return (
        textBox.y >= inputBox.y + inputBox.height - 1 &&
        textBox.x >= inputBox.x - 1 &&
        textBox.x < inputBox.x + inputBox.width &&
        textBox.y + textBox.height <= nextBox.y + 1
    )
}

const CUSTOMER_RECORDS = '**/api/collections/books_customers/records**'

// A page of the customers list: the list's pages, and only they, sort by sort_key.
const isListPage = (url: URL) => url.searchParams.get('sort') === 'sort_key,id'

// Holds every customers load that could answer "has sub-customers": any load filtered on
// `parent` (the check), any load with no filter, and the list's pages, which put the open
// customer's sub-customers in the store too. A load by id (the open record) goes through.
// `filters` lists the held loads' filters; `release` lets them all through.
async function holdSubCustomerLoads(page: Page) {
    let open = () => {}
    const released = new Promise<void>(resolve => {
        open = resolve
    })
    const filters: string[] = []
    const handler = async (route: Route) => {
        const url = new URL(route.request().url())
        const filter = url.searchParams.get('filter') ?? ''
        if (filter === '' || filter.includes('parent') || isListPage(url)) {
            filters.push(filter)
            await released
        }
        await route.continue()
    }
    await page.route(CUSTOMER_RECORDS, handler)
    return {
        filters,
        // Waits for the held handlers: removing a route under a pending handler hands
        // its request on, and the handler's own `continue` then fails.
        release: async () => {
            open()
            await page.unrouteAll({ behavior: 'wait' })
        },
    }
}

// Fails the has-sub-customers check for one customer (the load filtered on
// `parent = customerId`) and holds any load with no filter and the list's pages, which
// could put that customer's sub-customers in the store too, so only the failed check can
// settle the lock. `failed` lists the failed loads' filters; `release` removes the route.
async function failSubCustomerCheck(page: Page, customerId: string) {
    let open = () => {}
    const released = new Promise<void>(resolve => {
        open = resolve
    })
    const failed: string[] = []
    const handler = async (route: Route) => {
        const url = new URL(route.request().url())
        const filter = url.searchParams.get('filter') ?? ''
        if (filter.replace(/\s/g, '').includes(`parent="${customerId}"`)) {
            failed.push(filter)
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: 'Check failed.', data: {} }),
            })
            return
        }
        if (filter === '' || isListPage(url)) await released
        await route.continue()
    }
    await page.route(CUSTOMER_RECORDS, handler)
    return {
        failed,
        release: async () => {
            open()
            await page.unrouteAll({ behavior: 'wait' })
        },
    }
}

async function expectListShown(page: Page) {
    await expect(page.getByTestId('customers-list')).toBeVisible()
    await expect(page.getByTestId('customer-page')).toBeHidden()
}

test.describe('customer-form: customer page and form', () => {
    for (const [sizeName, size] of SIZES) {
        test(`opens customers and lays out the form (${sizeName})`, async ({ page }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            await page.setViewportSize(size)
            const phone = isPhone(page)
            const surface = page.getByTestId('customer-page')
            const title = page.getByTestId('customer-title')
            const back = page.getByTestId('customer-back')
            const parent = page.getByTestId('customer-parent')
            const parentSearch = page.getByTestId('customer-parent-search')
            const fab = page.getByLabel('New', { exact: true })

            // (1) The New menu's Customers column opens a new customer on the page surface.
            await openCustomersList(page)
            if (phone) {
                await fab.click()
            } else {
                await page.getByText('New', { exact: true }).filter({ visible: true }).click()
            }
            const newCustomer = page.getByTestId('books-new-customer')
            await expect(newCustomer).toHaveText('Customer')
            await expect(newCustomer.locator('xpath=..')).toContainText('Customers')
            await newCustomer.click()
            await expect(surface).toBeVisible()
            await expect(title).toHaveText('New customer')
            await expect(page).toHaveURL(/\/books\/customers\/new$/)
            if (phone) await expect(fab).toBeHidden()

            // (2) The page chrome, and the built-in fields top to bottom in the default order.
            await expect(back).toHaveText('‹ Customers')
            await expect(page.getByTestId('customer-form')).toBeVisible()
            await expect.poll(() => cellsOutOfOrder(page)).toEqual([])

            // (3) Pairs side by side on the wide page, one column on a phone.
            const cityLine = CITY_LINE.map(part =>
                page.getByTestId(`form-input-billing_address-${part}`)
            )
            if (phone) {
                for (const [upper, lower] of PAIRS) {
                    await expect
                        .poll(() =>
                            stacked(
                                page.getByTestId(`form-input-${upper}`),
                                page.getByTestId(`form-input-${lower}`)
                            )
                        )
                        .toBe(true)
                }
                await expect.poll(() => stacked(cityLine[0], cityLine[1])).toBe(true)
                await expect.poll(() => stacked(cityLine[1], cityLine[2])).toBe(true)
            } else {
                for (const [left, right] of PAIRS) {
                    await expect
                        .poll(() =>
                            sideBySide(
                                page.getByTestId(`form-input-${left}`),
                                page.getByTestId(`form-input-${right}`)
                            )
                        )
                        .toBe(true)
                }
                await expect.poll(() => sideBySide(cityLine[0], cityLine[1])).toBe(true)
                await expect.poll(() => sideBySide(cityLine[1], cityLine[2])).toBe(true)

                const row = page.getByTestId('form-page-main')
                await expect
                    .poll(async () => {
                        const [rowBox, pageBox] = await Promise.all([boxOf(row), boxOf(surface)])
                        if (!rowBox || !pageBox) return null
                        return {
                            atMost720: rowBox.width <= 720,
                            widerThanPairsNeed: rowBox.width > 640 + 2 * 24,
                            centred:
                                Math.abs(
                                    rowBox.x + rowBox.width / 2 - (pageBox.x + pageBox.width / 2)
                                ) <= 8,
                        }
                    })
                    .toEqual({ atMost720: true, widerThanPairsNeed: true, centred: true })

                // The page covers the list and keeps the shell around it.
                await expect(page.getByTestId('books-nav-lists')).toBeVisible()
                await expect(page.getByTestId('nav-sidebar-toggle')).toBeVisible()
                await expect.poll(() => takesClickAtCenter(surface)).toBe(true)

                // The Parent customer cell (create mode, no help text) leaves the same space
                // below its control as the Website cell above it does.
                await expect.poll(() => parentGapMismatch(page)).toBeLessThanOrEqual(2)
            }

            // (4) Web input types, so a phone browser shows the matching keyboard.
            for (const [key, kind] of [
                ['email', 'email'],
                ['phone', 'tel'],
                ['mobile', 'tel'],
                ['website', 'url'],
            ] as const) {
                await expect
                    .poll(() => inputKinds(page.getByTestId(`form-input-${key}`)))
                    .toContain(kind)
            }

            // (5) Shipping is folded to one checked line while it equals billing.
            // Core's Switch is the element with the test id: role="switch" with aria-checked,
            // which toBeChecked reads. It has no <input>.
            const same = page.getByTestId('form-input-shipping_address-same')
            const shippingBlock = page.getByTestId('address-shipping_address')
            await expect(same).toBeChecked()
            await expect(shippingBlock).toBeHidden()
            await same.click()
            await expect(same).not.toBeChecked()
            const shippingStreet = page.getByTestId('form-input-shipping_address-line1')
            await expect(shippingStreet).toBeVisible()
            await expect(shippingStreet).toHaveValue('')
            const shippingCity = page.getByTestId('form-input-shipping_address-city')
            await shippingStreet.fill('12 Harbor Way')
            await shippingCity.fill('Portland')
            await expect(shippingStreet).toHaveValue('12 Harbor Way')
            await expect(shippingCity).toHaveValue('Portland')
            // Turning the toggle on stores null, and that outside change must reach the
            // inputs: turned off again, they show the empty address, not the typed text.
            await same.click()
            await expect(same).toBeChecked()
            await expect(shippingBlock).toBeHidden()
            await same.click()
            await expect(same).not.toBeChecked()
            await expect(shippingStreet).toHaveValue('')
            await expect(shippingCity).toHaveValue('')
            await same.click()
            await expect(same).toBeChecked()
            await expect(shippingBlock).toBeHidden()

            // (6) The Parent customer picker: None first, active top-level customers only,
            // searched by display name ignoring case; Escape closes only the menu.
            await parent.click()
            await expect(parentSearch).toBeVisible()
            const items = page.locator(
                '[data-testid="customer-parent-none"], [data-testid^="customer-parent-option-"]'
            )
            await expect(items.first()).toHaveAttribute('data-testid', 'customer-parent-none')
            await expect(page.getByTestId('customer-parent-none')).toHaveText('None (top level)')
            await parentSearch.fill('Northwind')
            await expect(parentOption(page, NORTHWIND)).toHaveCount(1)
            await expect(parentOption(page, ASPEN)).toHaveCount(0)
            await expect(parentOption(page, SEATTLE)).toHaveCount(0)
            await parentSearch.fill('northwind')
            await expect(parentOption(page, NORTHWIND)).toHaveCount(1)
            await parentSearch.fill('Old Mill')
            await expect(parentOption(page, NORTHWIND)).toHaveCount(0)
            await expect(parentOptions(page)).toHaveCount(0)
            await expect(parentSearch).toBeVisible()
            await page.keyboard.press('Escape')
            await expect(parentSearch).toBeHidden()
            await expect(surface).toBeVisible()
            await expect(title).toHaveText('New customer')

            // A new customer's title follows the Parent customer field.
            await pickParent(page, NORTHWIND)
            await expect(parent).toContainText(NORTHWIND)
            await expect(title).toHaveText('New sub-customer')
            await pickNoParent(page)
            await expect(parent).toContainText('None (top level)')
            await expect(title).toHaveText('New customer')

            // (7) Escape on a clean form leaves without a question.
            await page.keyboard.press('Escape')
            await expectListShown(page)
            await expect(page).toHaveURL(/\/books\/customers$/)

            // (8) A reload of /new keeps the new customer on the page; ?parent is used only
            // when it names an active top-level customer.
            await openNewCustomer(page)
            await page.reload()
            await expect(surface).toBeVisible()
            await expect(title).toHaveText('New customer')

            // An address part shows its own length error under that part, and keeps it
            // while typing goes on past the limit.
            const city = page.getByTestId('form-input-billing_address-city')
            const cityError = page
                .getByTestId('address-billing_address')
                .getByText(PART_TOO_LONG, { exact: true })
            // The part input below City: Country on the shared line, State or region on a phone.
            const belowCity = page.getByTestId(
                phone ? 'form-input-billing_address-region' : 'form-input-billing_address-country'
            )
            await city.fill('a'.repeat(200))
            await expect(city).toHaveValue('a'.repeat(200))
            await expect(cityError).toBeHidden()
            await city.pressSequentially('b')
            await expect(city).toHaveValue(`${'a'.repeat(200)}b`)
            await expect(cityError).toBeVisible()
            await expect.poll(() => sitsUnder(city, cityError, belowCity)).toBe(true)
            await city.pressSequentially('c')
            await expect(city).toHaveValue(`${'a'.repeat(200)}bc`)
            await expect(cityError).toBeVisible()
            await city.press('Backspace')
            await city.press('Backspace')
            await expect(city).toHaveValue('a'.repeat(200))
            await expect(cityError).toBeHidden()
            await city.fill('')
            await expect(city).toHaveValue('')

            await back.click()
            await expectListShown(page)

            await searchCustomers(page, 'Northwind')
            const northwindId = await customerIdOf(page, NORTHWIND)
            const seattleId = await customerIdOf(page, SEATTLE)
            const cancel = page.getByTestId('customer-cancel')

            await navigateInApp(page, `${customersBase(page)}/new?parent=${northwindId}`)
            await expect(surface).toBeVisible()
            await expect(title).toHaveText('New sub-customer')
            await expect(parent).toContainText(NORTHWIND)
            await expect(cancel).toHaveText('Cancel')
            // The title follows the field here too: no parent makes it a new customer.
            await pickNoParent(page)
            await expect(title).toHaveText('New customer')
            await pickParent(page, NORTHWIND)
            await expect(title).toHaveText('New sub-customer')
            await cancel.click()
            await expectListShown(page)

            await navigateInApp(page, `${customersBase(page)}/new?parent=${seattleId}`)
            await expect(surface).toBeVisible()
            await expect(title).toHaveText('New customer')
            await expect(parent).toContainText('None (top level)')
            await cancel.click()
            await expectListShown(page)

            // (9) Editing a seeded customer: its values, and the picker locked while it has
            // sub-customers. Back keeps the list's search text.
            await searchCustomers(page, HARBORVIEW)
            const harborviewId = await customerIdOf(page, HARBORVIEW)
            await openCustomer(page, HARBORVIEW)
            await expect(page).toHaveURL(new RegExp(`/books/customers/${harborviewId}$`))
            await expect(title).toHaveText('Edit customer')
            await expect(field(page, 'display_name')).toHaveValue(HARBORVIEW)
            await expect(page.getByTestId('form-input-billing_address-line1')).toHaveValue(
                '1450 Waterfront Avenue'
            )
            await expect(same).toBeChecked()
            await expect
                .poll(() =>
                    parent.evaluate(
                        el =>
                            el.getAttribute('aria-disabled') === 'true' ||
                            el.hasAttribute('disabled')
                    )
                )
                .toBe(true)
            await parent.click({ force: true })
            await expect(parentSearch).toBeHidden()
            await expect(page.getByTestId('customer-parent-help')).toHaveText(
                'A customer with sub-customers cannot be a sub-customer.'
            )
            await back.click()
            await expectListShown(page)
            await expect(page.getByTestId('customers-search')).toHaveValue(HARBORVIEW)

            // A top-level customer with no sub-customers: the picker is enabled and leaves
            // the customer itself out.
            await searchCustomers(page, ASPEN)
            const aspenId = await customerIdOf(page, ASPEN)
            await openCustomer(page, ASPEN)
            await expect(title).toHaveText('Edit customer')
            await expect
                .poll(() =>
                    parent.evaluate(
                        el =>
                            el.getAttribute('aria-disabled') === 'true' ||
                            el.hasAttribute('disabled')
                    )
                )
                .toBe(false)
            await parent.click()
            await expect(parentSearch).toBeVisible()
            // Northwind first: once its option shows, the search query is live, so the next
            // term only changes the filter and cannot pass on a list still loading.
            await parentSearch.fill('Northwind')
            await expect(parentOption(page, NORTHWIND)).toHaveCount(1)
            await parentSearch.fill('Aspen')
            await expect(parentOption(page, NORTHWIND)).toHaveCount(0)
            await expect(page.getByTestId(`customer-parent-option-${aspenId}`)).toHaveCount(0)
            await expect(parentOption(page, ASPEN)).toHaveCount(0)
            await page.keyboard.press('Escape')
            await expect(parentSearch).toBeHidden()
            await expect(surface).toBeVisible()
            await back.click()
            await expectListShown(page)

            // (10) A reload of a customer's URL keeps it on the page.
            await openCustomer(page, ASPEN)
            await page.reload()
            await expect(surface).toBeVisible()
            await expect(title).toHaveText('Edit customer')
            await expect(field(page, 'display_name')).toHaveValue(ASPEN)
            await back.click()
            await expectListShown(page)

            // The picker stays locked while the has-sub-customers check loads. The check
            // and the list's pages are held, so the form shows before either answers.
            await openCustomer(page, HARBORVIEW)
            const held = await holdSubCustomerLoads(page)
            await page.reload()
            await expect(field(page, 'display_name')).toHaveValue(HARBORVIEW)
            await expect
                .poll(() =>
                    held.filters.some(f =>
                        f.replace(/\s/g, '').includes(`parent="${harborviewId}"`)
                    )
                )
                .toBe(true)
            await expect(page.getByTestId('customer-parent-help')).toBeHidden()
            await expect.poll(() => isDisabled(parent)).toBe(true)
            await held.release()
            await expect(page.getByTestId('customer-parent-help')).toBeVisible()
            await expect.poll(() => isDisabled(parent)).toBe(true)
            await back.click()
            await expectListShown(page)

            // A failed has-sub-customers check unlocks the picker: the server's parent rule
            // is the guard. Aspen has no sub-customers, so enabled is the only right answer.
            await openCustomer(page, ASPEN)
            const failing = await failSubCustomerCheck(page, aspenId)
            await page.reload()
            await expect(field(page, 'display_name')).toHaveValue(ASPEN)
            await expect.poll(() => failing.failed.length).toBeGreaterThan(0)
            await expect.poll(() => isDisabled(parent)).toBe(false)
            await expect(page.getByTestId('customer-parent-help')).toBeHidden()
            await failing.release()
            await back.click()
            await expectListShown(page)

            // (11) An unknown customer id.
            await navigateInApp(page, `${customersBase(page)}/doesnotexist000`)
            await expect(page.getByTestId('customer-not-found')).toContainText(
                "This customer doesn't exist or was removed"
            )
            const notFoundBack = page.getByTestId('customer-not-found-back')
            await expect(notFoundBack).toHaveText('Back to customers')
            await notFoundBack.click()
            await expect(page.getByTestId('customers-list')).toBeVisible()
            await expect(page.getByTestId('customer-not-found')).toBeHidden()
        })
    }
})
