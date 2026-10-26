import { expect, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    customerEntries,
    customerEntry,
    customerIdOf,
    customerSurface,
    customersBase,
    DESKTOP,
    discardDialog,
    field,
    isDisabled,
    isPhone,
    navigateInApp,
    openCustomer,
    openCustomersList,
    openNewCustomer,
    PHONE,
    searchCustomers,
    uniqueName,
    WIDE,
} from './customer-form-helpers'

// Save, Save and new (also for a sub-customer), an edit save, server refusals on a field
// and on the form, the "Discard changes?" guard on Cancel, Escape, the page's back button
// and the browser's Back button, the leave paths held while a save is in flight, a refusal
// that arrives after the page closed or after the user went to another package (a toast),
// an edit typed during a successful save (kept, still guarded), a save that lands after
// another customer opened in the wide panel (that customer stays open), and no footer
// while the form loads. Every customer here is created through the form with a unique
// name; no seeded customer is edited.
//
// Not covered here: a read-only user (a Close button and no footer actions) cannot be
// driven, because the seed has no read-only Books member; the footer rule is
// `customerFooter`, covered by tests/customer-display.test.ts. The iOS swipe back and the
// Android hardware back are native-only and are not run. The `beforeunload` prompt on
// reload and tab close is not asserted, because Playwright dismisses it.

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const ROOT_REFUSAL = 'Books cannot save this customer right now.'

// Four digits that differ between runs, for phone numbers and emails.
function stampDigits() {
    return String(Date.now() % 10000).padStart(4, '0')
}

async function expectListShown(page: Page) {
    await expect(page.getByTestId('customers-list')).toBeVisible()
    await expect(customerSurface(page)).toBeHidden()
}

// A click on the title moves focus off any input: react-native-web's TextInput stops
// every keydown from reaching the window, where the Escape shortcut listens.
async function pressEscapeOutsideInputs(page: Page) {
    await page.getByTestId('customer-title').click()
    await page.keyboard.press('Escape')
}

function isRecordUrl(id: string) {
    return (url: URL) => url.pathname.endsWith(`/api/collections/books_customers/records/${id}`)
}

type PatchAnswer = 'refuse' | 'pass'

// Answers each PATCH (or each `method` request) on the routed URL with a refusal that
// names no field, or after `hold` waits for `release`, which refuses it or (`'pass'`)
// lets it reach the server. `urls` lists the requests seen.
function refusedPatches(method: 'PATCH' | 'POST' = 'PATCH') {
    const urls: string[] = []
    let gate = Promise.resolve<PatchAnswer>('refuse')
    let open = (_answer: PatchAnswer) => {}
    const handler = async (route: Route) => {
        if (route.request().method() !== method) {
            await route.continue()
            return
        }
        urls.push(route.request().url())
        if ((await gate) === 'pass') {
            await route.continue()
            return
        }
        await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 400, message: ROOT_REFUSAL, data: {} }),
        })
    }
    return {
        urls,
        handler,
        hold: () => {
            gate = new Promise<PatchAnswer>(resolve => {
                open = resolve
            })
        },
        release: (answer: PatchAnswer = 'refuse') => open(answer),
    }
}

// The customers collection's records endpoint, where a create POSTs.
function isRecordsUrl(url: URL) {
    return url.pathname.endsWith('/api/collections/books_customers/records')
}

// A PATCH of the record that the server answered.
function patchAnswered(page: Page, id: string) {
    const recordUrl = isRecordUrl(id)
    return page.waitForResponse(
        r => r.request().method() === 'PATCH' && recordUrl(new URL(r.url()))
    )
}

// A create of a customer that the server answered.
function insertAnswered(page: Page) {
    return page.waitForResponse(
        r => r.request().method() === 'POST' && isRecordsUrl(new URL(r.url()))
    )
}

// The app handles a server answer in the frames after it arrives: two frames later, a
// save's success or refusal handler has run.
async function afterNextFrames(page: Page) {
    await page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
    )
}

// To another installed package and back again. A phone has no rail (navigateToPackage
// clicks rail links), so there the MobileTabBar's tab is pressed.
async function switchPackage(page: Page, slug: string) {
    if (isPhone(page)) {
        await page.getByTestId(`nav-${slug}`).click()
        await expect(page.getByTestId(`pkg-active-${slug}`)).toBeVisible()
    } else {
        await navigateToPackage(page, slug)
    }
    await expect(page).toHaveURL(new RegExp(`/${slug}(/|$)`))
}

const FORM_RECORDS = '**/api/collections/forms/records**'

// Holds every load of the forms collection, so the customer form's definition is not
// ready. `held` lists the held loads; `release` lets them through.
async function holdFormLoads(page: Page) {
    let open = () => {}
    const released = new Promise<void>(resolve => {
        open = resolve
    })
    const held: string[] = []
    const handler = async (route: Route) => {
        held.push(route.request().url())
        await released
        await route.continue()
    }
    await page.route(FORM_RECORDS, handler)
    return {
        held,
        // Waits for the held handlers: removing a route under a pending handler hands
        // its request on, and the handler's own `continue` then fails.
        release: async () => {
            open()
            await page.unrouteAll({ behavior: 'wait' })
        },
    }
}

test.describe('customer-form: save and discard', () => {
    for (const [sizeName, size] of SIZES) {
        test(`creates, edits and guards unsaved changes (${sizeName})`, async ({ page }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            await page.setViewportSize(size)
            const title = page.getByTestId('customer-title')
            const save = page.getByTestId('customer-save')
            const summary = page.getByTestId('form-error-summary')
            const dialog = discardDialog(page)

            // (1) While the form's definition loads, the surface shows no footer. One viewport
            // is enough: the footer rule does not depend on the width.
            const formLoads = sizeName === 'desktop' ? await holdFormLoads(page) : null
            await openCustomersList(page)
            await page.getByTestId('customer-new-header').click()
            await expect(customerSurface(page)).toBeVisible()
            if (formLoads) {
                await expect(page.getByTestId('customer-loading')).toBeVisible()
                expect(formLoads.held.length).toBeGreaterThan(0)
                await expect(page.getByTestId('customer-footer')).toBeHidden()
                await expect(save).toBeHidden()
                await expect(page.getByTestId('customer-cancel')).toBeHidden()
                await formLoads.release()
            }
            await expect(title).toHaveText('New customer')

            // Save with Display name empty: the field shows its error inline only.
            await save.click()
            await expect(page.getByTestId('form-field-display_name')).toContainText(
                'Display name is required'
            )
            await expect(summary).toBeHidden()
            await expect(page).toHaveURL(/\/new$/)

            // (2) A full customer.
            const prefix = uniqueName(page, 'Save')
            const name = `${prefix} one`
            const secondName = `${prefix} two`
            const digits = stampDigits()
            const phone = `(555) 010-${digits}`
            await field(page, 'display_name').fill(name)
            await field(page, 'company').fill('Helix Co')
            await field(page, 'first_name').fill('Ada')
            await field(page, 'last_name').fill('Helix')
            await field(page, 'email').fill(`helix.${digits}@example.com`)
            await field(page, 'phone').fill(phone)
            await page.getByTestId('form-input-billing_address-line1').fill('12 Harbor Way')
            await page.getByTestId('form-input-billing_address-city').fill('Portland')
            await page.getByTestId('form-input-billing_address-region').fill('OR')
            await page.getByTestId('form-input-billing_address-postal_code').fill('97210')
            await page.getByTestId('form-input-billing_address-country').fill('United States')

            // (3) Save and new stays on an empty New customer form.
            await page.getByTestId('customer-save-new').click()
            await expect(field(page, 'display_name')).toHaveValue('')
            await expect(field(page, 'company')).toHaveValue('')
            await expect(field(page, 'email')).toHaveValue('')
            await expect(page).toHaveURL(/\/books\/customers\/new$/)
            await expect(title).toHaveText('New customer')

            // (4) An email the server refuses lands on the Email field; fixed, Save leaves.
            await field(page, 'display_name').fill(secondName)
            await field(page, 'email').fill('not-an-email')
            await save.click()
            await expect(page.getByTestId('form-field-email')).toContainText(/valid email address/i)
            await expect(page).toHaveURL(/\/new$/)
            await field(page, 'email').fill(`helix.${digits}.two@example.com`)
            await save.click()
            await expectListShown(page)
            await searchCustomers(page, prefix)
            await expect(customerEntry(page, name)).toBeVisible()
            await expect(customerEntry(page, secondName)).toBeVisible()
            await expect(customerEntries(page)).toHaveCount(2)
            const id = await customerIdOf(page, name)

            // (5) A duplicate name, in another case, is a field refusal, not a root error.
            await openNewCustomer(page)
            const upperName = name.toUpperCase()
            await field(page, 'display_name').fill(upperName)
            await save.click()
            await expect(page.getByTestId('form-field-display_name')).toContainText(
                `A customer named “${upperName}” already exists here`
            )
            await expect(summary).toBeHidden()
            await expect(page).toHaveURL(/\/new$/)

            // (6) The form is dirty: Cancel, Escape and the back button ask first.
            await page.getByTestId('customer-cancel').click()
            await expect(dialog.title).toBeVisible()
            await expect(dialog.message).toBeVisible()
            await dialog.keepEditing.click()
            await expect(dialog.title).toBeHidden()
            await expect(field(page, 'display_name')).toHaveValue(upperName)

            await pressEscapeOutsideInputs(page)
            await expect(dialog.title).toBeVisible()
            await page.keyboard.press('Escape')
            await expect(dialog.title).toBeHidden()
            await expect(customerSurface(page)).toBeVisible()
            await expect(field(page, 'display_name')).toHaveValue(upperName)

            await page.getByTestId('customer-back').click()
            await expect(dialog.title).toBeVisible()
            await dialog.discard.click()
            await expect(page).toHaveURL(/\/books\/customers$/)
            await expectListShown(page)

            // (7) The saved customer, and the browser's Back button held while dirty.
            await openCustomer(page, name)
            await expect(page).toHaveURL(new RegExp(`/books/customers/${id}$`))
            await expect(title).toHaveText('Edit customer')
            await expect(field(page, 'company')).toHaveValue('Helix Co')
            await expect(field(page, 'phone')).toHaveValue(phone)
            await expect(page.getByTestId('form-input-billing_address-city')).toHaveValue(
                'Portland'
            )
            await expect(page.getByTestId('form-input-shipping_address-same')).toBeChecked()
            await expect(page.getByTestId('address-shipping_address')).toBeHidden()

            const newPhone = `(555) 011-${digits}`
            await field(page, 'phone').fill(newPhone)
            await page.getByTestId('customer-back').click()
            await expect(dialog.title).toBeVisible()
            await dialog.keepEditing.click()
            await expect(dialog.title).toBeHidden()
            await page.goBack()
            await expect(dialog.title).toBeVisible()
            await expect(page).toHaveURL(new RegExp(`/books/customers/${id}$`))
            await dialog.keepEditing.click()
            await expect(dialog.title).toBeHidden()
            await expect(page).toHaveURL(new RegExp(`/books/customers/${id}$`))
            await expect(customerSurface(page)).toBeVisible()
            await expect(field(page, 'phone')).toHaveValue(newPhone)

            // (8) While an edit save is in flight, Cancel, the back button and Escape cannot
            // leave, so the refusal finds the form: a refusal with no field shows in the
            // form's summary.
            const recordUrl = isRecordUrl(id)
            const recordPath = new RegExp(`/books/customers/${id}$`)
            const patches = refusedPatches()
            const cancel = page.getByTestId('customer-cancel')
            const back = page.getByTestId('customer-back')
            await page.route(recordUrl, patches.handler)
            patches.hold()
            await save.click()
            await expect.poll(() => patches.urls.length).toBe(1)
            await expect.poll(() => isDisabled(cancel)).toBe(true)
            await expect.poll(() => isDisabled(back)).toBe(true)
            await pressEscapeOutsideInputs(page)
            await expect(customerSurface(page)).toBeVisible()
            await expect(page).toHaveURL(recordPath)
            patches.release()
            await expect(summary).toBeVisible()
            await expect(summary).toContainText(ROOT_REFUSAL)
            await expect(customerSurface(page)).toBeVisible()
            await expect(page).toHaveURL(recordPath)
            await expect(field(page, 'phone')).toHaveValue(newPhone)
            await expect.poll(() => isDisabled(cancel)).toBe(false)

            // The refused edit is still unsaved, so leaving asks first.
            await back.click()
            await expect(dialog.title).toBeVisible()
            await dialog.keepEditing.click()
            await expect(dialog.title).toBeHidden()
            await expect(page).toHaveURL(recordPath)
            await expect(field(page, 'phone')).toHaveValue(newPhone)

            // The browser's Back is the one way out while a save is in flight; the refusal
            // that arrives after the page closed shows as a toast.
            patches.hold()
            await save.click()
            await expect.poll(() => patches.urls.length).toBe(2)
            await page.goBack()
            await expect(page).toHaveURL(/\/books\/customers$/)
            await expectListShown(page)
            patches.release()
            const refusalToast = page.getByTestId('toast-card').filter({ hasText: ROOT_REFUSAL })
            await expect(refusalToast).toBeVisible()
            await expect(dialog.title).toBeHidden()
            await refusalToast.getByRole('button', { name: 'Dismiss notification' }).click()
            await expect(refusalToast).toBeHidden()

            // Another package is a way out too. The left page stays mounted (frozen) but
            // hidden, so a refusal that arrives then shows as a toast, not on that form.
            await openCustomer(page, name)
            await expect(field(page, 'phone')).toHaveValue(phone)
            await field(page, 'phone').fill(newPhone)
            patches.hold()
            await save.click()
            await expect.poll(() => patches.urls.length).toBe(3)
            // The Books page is still in the DOM under Calendar, so Playwright counts it
            // visible; the Calendar marker and URL show it is covered.
            await switchPackage(page, 'calendar')
            patches.release()
            await expect(refusalToast).toBeVisible()
            await refusalToast.getByRole('button', { name: 'Dismiss notification' }).click()
            await expect(refusalToast).toBeHidden()

            // Back in Books the page is as it was left: the typed phone is kept and still
            // unsaved, and the refusal is not on its form.
            await switchPackage(page, 'books')
            await expect(customerSurface(page)).toBeVisible()
            await expect(page).toHaveURL(recordPath)
            await expect(field(page, 'phone')).toHaveValue(newPhone)
            await expect(summary).toBeHidden()
            await back.click()
            await expect(dialog.title).toBeVisible()
            await dialog.discard.click()
            await expectListShown(page)
            await page.unroute(recordUrl, patches.handler)

            // Nothing refused was stored; typed again, the new phone saves.
            await openCustomer(page, name)
            await expect(field(page, 'phone')).toHaveValue(phone)
            await field(page, 'phone').fill(newPhone)
            await save.click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()
            await searchCustomers(page, name)
            await expect(customerEntry(page, name)).toContainText(newPhone)

            // An edit typed while a save is in flight is kept when the save succeeds: the
            // page stays open with it, and leaving still asks.
            const passed = refusedPatches()
            await page.route(recordUrl, passed.handler)
            await openCustomer(page, name)
            await field(page, 'phone').fill(phone)
            passed.hold()
            await save.click()
            await expect.poll(() => passed.urls.length).toBe(1)
            const mobile = `(555) 012-${digits}`
            await field(page, 'mobile').fill(mobile)
            const saved = patchAnswered(page, id)
            passed.release('pass')
            await saved
            await afterNextFrames(page)
            await expect(customerSurface(page)).toBeVisible()
            await expect(page).toHaveURL(recordPath)
            await expect(field(page, 'mobile')).toHaveValue(mobile)
            await expect.poll(() => isDisabled(cancel)).toBe(false)
            await back.click()
            await expect(dialog.title).toBeVisible()
            await expect(page).toHaveURL(recordPath)
            await dialog.discard.click()
            await expectListShown(page)

            // The wide panel sits beside the list, so another customer can be opened while
            // a save is in flight. The save that lands then leaves that customer open.
            if (sizeName === 'desktop') {
                await page.setViewportSize(WIDE)
                await openCustomersList(page)
                await searchCustomers(page, prefix)
                const secondPath = new RegExp(
                    `/books/customers/${await customerIdOf(page, secondName)}$`
                )
                await customerEntry(page, name).click()
                await expect(page).toHaveURL(recordPath)
                await field(page, 'phone').fill(newPhone)
                passed.hold()
                await save.click()
                await expect.poll(() => passed.urls.length).toBe(2)
                await customerEntry(page, secondName).click()
                await expect(page).toHaveURL(secondPath)
                await expect(title).toHaveText('Edit customer')
                await expect(field(page, 'display_name')).toHaveValue(secondName)
                const landed = patchAnswered(page, id)
                passed.release('pass')
                await landed
                await afterNextFrames(page)
                await expect(page).toHaveURL(secondPath)
                await expect(customerSurface(page)).toBeVisible()
                await expect(field(page, 'display_name')).toHaveValue(secondName)
                await page.setViewportSize(size)
            }

            // An edit save that lands after the user went to another package does not pull
            // them back to Books; the page they left is saved and clean.
            const movedCompany = `Helix Co ${digits}`
            await openCustomer(page, name)
            await field(page, 'company').fill(movedCompany)
            const patchesBefore = passed.urls.length
            passed.hold()
            await save.click()
            await expect.poll(() => passed.urls.length).toBe(patchesBefore + 1)
            await switchPackage(page, 'calendar')
            const savedAway = patchAnswered(page, id)
            passed.release('pass')
            await savedAway
            await afterNextFrames(page)
            await expect(page).toHaveURL(/\/calendar(\/|$)/)
            await page.unroute(recordUrl, passed.handler)
            await switchPackage(page, 'books')
            await back.click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()
            await openCustomer(page, name)
            await expect(field(page, 'company')).toHaveValue(movedCompany)
            await back.click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()

            // (9) On an edit, a sibling's name is a field refusal too, and the page stays.
            await openCustomer(page, name)
            await field(page, 'display_name').fill(secondName)
            await save.click()
            await expect(page.getByTestId('form-field-display_name')).toContainText(
                `A customer named “${secondName}” already exists here.`
            )
            await expect(summary).toBeHidden()
            await expect(customerSurface(page)).toBeVisible()
            await expect(page).toHaveURL(recordPath)
            await field(page, 'display_name').fill(name)

            // A saved form leaves without asking.
            const notes = `Saved notes ${digits}`
            await field(page, 'notes').fill(notes)
            await save.click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()
            await openCustomer(page, name)
            await expect(field(page, 'notes')).toHaveValue(notes)
            await page.getByTestId('customer-back').click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()

            // (10) A search hit from outside the list pushes the customer; Back returns.
            const hubCard = page.getByTestId('books-list-card-customers')
            await page.getByTestId('customers-back').click()
            await expect(hubCard).toBeVisible()
            await page.keyboard.press('/')
            await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
            const searched = page.waitForResponse(
                r =>
                    r.url().includes('/api/search') &&
                    r.status() === 200 &&
                    new URL(r.url()).searchParams.get('q') === name
            )
            await page.keyboard.type(name)
            await searched
            await page.getByRole('option').filter({ hasText: name }).click()
            await expect(title).toHaveText('Edit customer')
            await expect(page).toHaveURL(new RegExp(`/books/customers/${id}$`))
            await page.goBack()
            await expect(hubCard).toBeVisible()
            await expect(customerSurface(page)).toBeHidden()

            // An address part typed and emptied again leaves the form clean: an all-empty
            // billing address is stored as null, the form's seed. Escape then leaves at
            // once, with no question.
            await openNewCustomer(page)
            const street = page.getByTestId('form-input-billing_address-line1')
            await street.fill('x')
            await expect(street).toHaveValue('x')
            await street.fill('')
            await expect(street).toHaveValue('')
            await pressEscapeOutsideInputs(page)
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()

            // A create that lands after the user went to another package leaves them there,
            // and the New form they come back to is clean and empty, not the saved customer.
            const lateName = `${prefix} late`
            const inserts = refusedPatches('POST')
            await openNewCustomer(page)
            await field(page, 'display_name').fill(lateName)
            await page.route(isRecordsUrl, inserts.handler)
            inserts.hold()
            await save.click()
            await expect.poll(() => inserts.urls.length).toBe(1)
            await switchPackage(page, 'calendar')
            const insertedAway = insertAnswered(page)
            inserts.release('pass')
            await insertedAway
            await afterNextFrames(page)
            await expect(page).toHaveURL(/\/calendar(\/|$)/)
            await page.unroute(isRecordsUrl, inserts.handler)
            await switchPackage(page, 'books')
            await expect(page).toHaveURL(/\/books\/customers\/new$/)
            await expect(title).toHaveText('New customer')
            await expect(field(page, 'display_name')).toHaveValue('')
            await back.click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()
            await searchCustomers(page, lateName)
            await expect(customerEntry(page, lateName)).toBeVisible()

            // Save and new on a new sub-customer keeps its parent (`?parent`).
            const parentPicker = page.getByTestId('customer-parent')
            await navigateInApp(page, `${customersBase(page)}/new?parent=${id}`)
            await expect(customerSurface(page)).toBeVisible()
            await expect(title).toHaveText('New sub-customer')
            await expect(parentPicker).toContainText(name)
            await field(page, 'display_name').fill(`${prefix} sub`)
            await page.getByTestId('customer-save-new').click()
            await expect(field(page, 'display_name')).toHaveValue('')
            await expect(title).toHaveText('New sub-customer')
            await expect(parentPicker).toContainText(name)
        })
    }
})
