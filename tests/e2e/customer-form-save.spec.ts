import { expect, type Page, test } from '@playwright/test'
import {
    afterNextFrames,
    createCustomer,
    customerEntries,
    customerEntry,
    customerIdOf,
    customerPageUrl,
    customerPath,
    customerSurface,
    customersBase,
    DESKTOP,
    discardDialog,
    expectCustomerEditSaved,
    field,
    holdLoads,
    insertAnswered,
    isDisabled,
    isRecordsUrl,
    isRecordUrl,
    leaveBooks,
    type NewCustomerValues,
    navigateInApp,
    openBooks,
    openCustomer,
    openCustomersList,
    openNewCustomer,
    PHONE,
    patchAnswered,
    pressEscapeOutsideInputs,
    refusedWrites,
    returnToBooks,
    SETTINGS_URL,
    searchCustomers,
    refusalToast as sharedRefusalToast,
    stampDigits,
    uniqueName,
    viewportName,
    WIDE,
} from './customer-form-helpers'

// Save (opens the new customer's page), Save and new (also for a sub-customer), an edit
// save on the customer page's Details tab (stays on the page), server refusals on a field
// and on the form, the "Discard changes?" guard on Cancel, Escape, the page's back button
// and the browser's Back button, a refusal that arrives after the page closed or after
// the user went to another package (a toast), an edit typed during a successful save
// (kept, still guarded), a save or a create that lands after the user went to another
// package, a save that lands after another customer opened beside the list on a very wide
// window (that customer stays open), and no footer while the New form loads.
//
// Each test proves one of these flows on its own: it logs in and creates, through the
// form, the customers it needs, each with a unique name. No test reads another test's
// rows or depends on the order, and no seeded customer is edited.
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

async function expectListShown(page: Page) {
    await expect(page.getByTestId('customers-list')).toBeVisible()
    await expect(customerSurface(page)).toBeHidden()
}

const refusedPatches = (method: 'PATCH' | 'POST' = 'PATCH') => refusedWrites(ROOT_REFUSAL, method)

const FORM_RECORDS = '**/api/collections/forms/records**'

// Holds every load of the forms collection, so the customer form's definition is not
// ready.
const holdFormLoads = (page: Page) => holdLoads(page, FORM_RECORDS)

// Creates a customer through the New customer form (Save opens its page) and returns its
// id, read from its list entry. The list is left searched for the customer's name.
async function createListedCustomer(page: Page, values: NewCustomerValues) {
    await createCustomer(page, values)
    await openCustomersList(page)
    await searchCustomers(page, values.name)
    return customerIdOf(page, values.name)
}

const refusalToast = (page: Page) => sharedRefusalToast(page, ROOT_REFUSAL)

test.describe('customer-form: save and discard', () => {
    for (const [sizeName, size] of SIZES) {
        test(`saves a full customer, and Save and new opens an empty form (${sizeName})`, async ({
            page,
        }) => {
            await openBooks(page, size)
            const title = page.getByTestId('customer-title')
            const save = page.getByTestId('customer-save')
            const summary = page.getByTestId('form-error-summary')

            // While the form's definition loads, the surface shows no footer. One viewport
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

            // A full customer.
            const prefix = uniqueName(`Save ${viewportName(page)}`)
            const name = `${prefix} one`
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

            // Save and new stays on an empty New customer form.
            await page.getByTestId('customer-save-new').click()
            await expect(field(page, 'display_name')).toHaveValue('')
            await expect(field(page, 'company')).toHaveValue('')
            await expect(field(page, 'email')).toHaveValue('')
            await expect(page).toHaveURL(/\/books\/customers\/new$/)
            await expect(title).toHaveText('New customer')

            // The saved customer has what was typed; the shipping address is the billing one.
            await openCustomersList(page)
            await searchCustomers(page, prefix)
            await expect(customerEntry(page, name)).toBeVisible()
            const id = await customerIdOf(page, name)
            await openCustomer(page, name)
            await expect(page).toHaveURL(customerPath(id))
            await expect(title).toHaveText(name)
            await expect(field(page, 'company')).toHaveValue('Helix Co')
            await expect(field(page, 'phone')).toHaveValue(phone)
            await expect(page.getByTestId('form-input-billing_address-city')).toHaveValue(
                'Portland'
            )
            await expect(page.getByTestId('form-input-shipping_address-same')).toBeChecked()
            await expect(page.getByTestId('address-shipping_address')).toBeHidden()
            await page.getByTestId('customer-back').click()
            await expectListShown(page)

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

        test(`refuses a bad email and a duplicate name on create, and asks before discarding (${sizeName})`, async ({
            page,
        }) => {
            await openBooks(page, size)
            const save = page.getByTestId('customer-save')
            const summary = page.getByTestId('form-error-summary')
            const dialog = discardDialog(page)
            const prefix = uniqueName(`Refuse ${viewportName(page)}`)
            const name = `${prefix} one`
            const secondName = `${prefix} two`
            const digits = stampDigits()
            await createCustomer(page, { name })

            // An email the server refuses lands on the Email field; fixed, Save leaves.
            await openNewCustomer(page)
            await field(page, 'display_name').fill(secondName)
            await field(page, 'email').fill('not-an-email')
            await save.click()
            await expect(page.getByTestId('form-field-email')).toContainText(/valid email address/i)
            await expect(page).toHaveURL(/\/new$/)
            await field(page, 'email').fill(`helix.${digits}.two@example.com`)
            await save.click()
            // Save opens the new customer's page.
            await expect(page).toHaveURL(customerPageUrl)
            await expect(page.getByTestId('customer-title')).toHaveText(secondName)
            await openCustomersList(page)
            await searchCustomers(page, prefix)
            await expect(customerEntry(page, name)).toBeVisible()
            await expect(customerEntry(page, secondName)).toBeVisible()
            await expect(customerEntries(page)).toHaveCount(2)

            // A duplicate name, in another case, is a field refusal, not a root error.
            await openNewCustomer(page)
            const upperName = name.toUpperCase()
            await field(page, 'display_name').fill(upperName)
            await save.click()
            await expect(page.getByTestId('form-field-display_name')).toContainText(
                `A customer named “${upperName}” already exists here`
            )
            await expect(summary).toBeHidden()
            await expect(page).toHaveURL(/\/new$/)

            // The form is dirty: Cancel, Escape and the back button ask first.
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
        })

        test(`holds the browser Back on an unsaved edit, and a cleared address stays clean (${sizeName})`, async ({
            page,
        }) => {
            await openBooks(page, size)
            const title = page.getByTestId('customer-title')
            const dialog = discardDialog(page)
            const name = `${uniqueName(`Back ${viewportName(page)}`)} one`
            const digits = stampDigits()
            const phone = `(555) 010-${digits}`
            const id = await createListedCustomer(page, { name, phone })

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

            // The browser's Back button is held while dirty.
            await openCustomer(page, name)
            await expect(page).toHaveURL(customerPath(id))
            await expect(title).toHaveText(name)
            await expect(field(page, 'phone')).toHaveValue(phone)

            const newPhone = `(555) 011-${digits}`
            await field(page, 'phone').fill(newPhone)
            await page.getByTestId('customer-back').click()
            await expect(dialog.title).toBeVisible()
            await dialog.keepEditing.click()
            await expect(dialog.title).toBeHidden()
            await page.goBack()
            await expect(dialog.title).toBeVisible()
            await expect(page).toHaveURL(customerPath(id))
            await dialog.keepEditing.click()
            await expect(dialog.title).toBeHidden()
            await expect(page).toHaveURL(customerPath(id))
            await expect(customerSurface(page)).toBeVisible()
            await expect(field(page, 'phone')).toHaveValue(newPhone)
        })

        test(`a refused edit save keeps the page and its edit, and a refusal after the page closed is a toast (${sizeName})`, async ({
            page,
        }) => {
            await openBooks(page, size)
            const save = page.getByTestId('customer-save')
            const summary = page.getByTestId('form-error-summary')
            const dialog = discardDialog(page)
            const name = `${uniqueName(`Hold ${viewportName(page)}`)} one`
            const digits = stampDigits()
            const phone = `(555) 010-${digits}`
            const newPhone = `(555) 011-${digits}`
            const id = await createListedCustomer(page, { name, phone })
            await openCustomer(page, name)
            await field(page, 'phone').fill(newPhone)

            // A refusal with no field, on the Details tab, shows in the form's summary;
            // the page stays open with the edit.
            const recordUrl = isRecordUrl(id)
            const recordPath = customerPath(id)
            const patches = refusedPatches()
            const cancel = page.getByTestId('customer-cancel')
            const back = page.getByTestId('customer-back')
            await page.route(recordUrl, patches.handler)
            patches.hold()
            await save.click()
            await expect.poll(() => patches.urls.length).toBe(1)
            await expect(customerSurface(page)).toBeVisible()
            await expect(page).toHaveURL(recordPath)
            // While the write is held, Cancel is off and Escape neither asks nor leaves.
            await expect.poll(() => isDisabled(cancel)).toBe(true)
            await pressEscapeOutsideInputs(page)
            await expect(dialog.title).toBeHidden()
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

            // A save in flight turns the leave guard off, so the browser's Back leaves at
            // once; the refusal that arrives after the page closed shows as a toast.
            patches.hold()
            await save.click()
            await expect.poll(() => patches.urls.length).toBe(2)
            await page.goBack()
            await expect(page).toHaveURL(/\/books\/customers$/)
            await expectListShown(page)
            patches.release()
            const toast = refusalToast(page)
            await expect(toast).toBeVisible()
            await expect(dialog.title).toBeHidden()
            await toast.getByRole('button', { name: 'Dismiss notification' }).click()
            await expect(toast).toBeHidden()
            await page.unroute(recordUrl, patches.handler)
        })

        test(`a refusal after leaving Books is a toast, and the left page keeps its edit (${sizeName})`, async ({
            page,
        }) => {
            await openBooks(page, size)
            const save = page.getByTestId('customer-save')
            const summary = page.getByTestId('form-error-summary')
            const dialog = discardDialog(page)
            const back = page.getByTestId('customer-back')
            const name = `${uniqueName(`Away ${viewportName(page)}`)} one`
            const digits = stampDigits()
            const phone = `(555) 010-${digits}`
            const newPhone = `(555) 011-${digits}`
            const id = await createListedCustomer(page, { name, phone })
            const recordUrl = isRecordUrl(id)
            const recordPath = customerPath(id)
            const patches = refusedPatches()
            await page.route(recordUrl, patches.handler)

            // Another package is a way out too. The left page stays mounted (frozen) but
            // hidden, so a refusal that arrives then shows as a toast, not on that form.
            await openCustomer(page, name)
            await expect(field(page, 'phone')).toHaveValue(phone)
            await field(page, 'phone').fill(newPhone)
            patches.hold()
            await save.click()
            await expect.poll(() => patches.urls.length).toBe(1)
            // The Books page is still in the DOM under Settings, so Playwright counts it
            // visible; the Settings URL and window title show it is covered.
            await leaveBooks(page)
            patches.release()
            const toast = refusalToast(page)
            await expect(toast).toBeVisible()
            await toast.getByRole('button', { name: 'Dismiss notification' }).click()
            await expect(toast).toBeHidden()

            // Back in Books the page is as it was left: the typed phone is kept and still
            // unsaved, and the refusal is not on its form.
            await returnToBooks(page)
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
            await expectCustomerEditSaved(page)
            await expect(dialog.title).toBeHidden()
            await openCustomersList(page)
            await searchCustomers(page, name)
            await expect(customerEntry(page, name)).toContainText(newPhone)
        })

        test(`keeps an edit typed while a save succeeds, and still asks before leaving (${sizeName})`, async ({
            page,
        }) => {
            await openBooks(page, size)
            const save = page.getByTestId('customer-save')
            const dialog = discardDialog(page)
            const cancel = page.getByTestId('customer-cancel')
            const back = page.getByTestId('customer-back')
            const name = `${uniqueName(`Typed ${viewportName(page)}`)} one`
            const digits = stampDigits()
            const phone = `(555) 010-${digits}`
            const newPhone = `(555) 011-${digits}`
            const id = await createListedCustomer(page, { name, phone })
            const recordUrl = isRecordUrl(id)
            const recordPath = customerPath(id)

            // An edit typed while a save is in flight is kept when the save succeeds: the
            // page stays open with it, and leaving still asks.
            const passed = refusedPatches()
            await page.route(recordUrl, passed.handler)
            await openCustomer(page, name)
            await field(page, 'phone').fill(newPhone)
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
            await page.unroute(recordUrl, passed.handler)
        })

        test(`a save or a create that lands after leaving Books leaves the user there (${sizeName})`, async ({
            page,
        }) => {
            await openBooks(page, size)
            const title = page.getByTestId('customer-title')
            const save = page.getByTestId('customer-save')
            const dialog = discardDialog(page)
            const back = page.getByTestId('customer-back')
            const prefix = uniqueName(`Land ${viewportName(page)}`)
            const name = `${prefix} one`
            const digits = stampDigits()
            const id = await createListedCustomer(page, { name, company: 'Helix Co' })
            const recordUrl = isRecordUrl(id)
            const passed = refusedPatches()
            await page.route(recordUrl, passed.handler)

            // An edit save that lands after the user went to another package does not pull
            // them back to Books; the page they left is saved and clean.
            const movedCompany = `Helix Co ${digits}`
            await openCustomer(page, name)
            await field(page, 'company').fill(movedCompany)
            passed.hold()
            await save.click()
            await expect.poll(() => passed.urls.length).toBe(1)
            await leaveBooks(page)
            const savedAway = patchAnswered(page, id)
            passed.release('pass')
            await savedAway
            await afterNextFrames(page)
            await expect(page).toHaveURL(SETTINGS_URL)
            await page.unroute(recordUrl, passed.handler)
            await returnToBooks(page)
            await back.click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()
            await openCustomer(page, name)
            await expect(field(page, 'company')).toHaveValue(movedCompany)
            await back.click()
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
            await leaveBooks(page)
            const insertedAway = insertAnswered(page)
            inserts.release('pass')
            await insertedAway
            await afterNextFrames(page)
            await expect(page).toHaveURL(SETTINGS_URL)
            // The route also passes the list's own record loads on; wait for any still running.
            await page.unrouteAll({ behavior: 'wait' })
            await returnToBooks(page)
            await expect(page).toHaveURL(/\/books\/customers\/new$/)
            await expect(title).toHaveText('New customer')
            await expect(field(page, 'display_name')).toHaveValue('')
            await back.click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()
            await searchCustomers(page, lateName)
            await expect(customerEntry(page, lateName)).toBeVisible()
        })

        test(`refuses a sibling's name on an edit, and a search hit opens the customer (${sizeName})`, async ({
            page,
        }) => {
            await openBooks(page, size)
            const title = page.getByTestId('customer-title')
            const save = page.getByTestId('customer-save')
            const summary = page.getByTestId('form-error-summary')
            const dialog = discardDialog(page)
            const prefix = uniqueName(`Edit ${viewportName(page)}`)
            const name = `${prefix} one`
            const secondName = `${prefix} two`
            const digits = stampDigits()
            await createCustomer(page, { name: secondName })
            const id = await createListedCustomer(page, { name })
            const recordPath = customerPath(id)

            // On an edit, a sibling's name is a field refusal too, and the page stays.
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

            // A save stays on the page and leaves it clean: Back then leaves without asking.
            const company = `Saved company ${digits}`
            await field(page, 'company').fill(company)
            await save.click()
            await expectCustomerEditSaved(page)
            await page.getByTestId('customer-back').click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()
            await openCustomer(page, name)
            await expect(field(page, 'company')).toHaveValue(company)
            await page.getByTestId('customer-back').click()
            await expectListShown(page)
            await expect(dialog.title).toBeHidden()

            // A search hit from outside the list pushes the customer; Back returns.
            const hubCard = page.getByTestId('books-list-card-customers')
            await page.getByTestId('customers-back').click()
            await expect(hubCard).toBeVisible()
            await page.keyboard.press('/')
            // The palette focuses its input a frame after it shows; keys typed before
            // that frame are lost.
            await expect(
                page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
            ).toBeFocused()
            const searched = page.waitForResponse(
                r =>
                    r.url().includes('/api/search') &&
                    r.status() === 200 &&
                    new URL(r.url()).searchParams.get('q') === name
            )
            await page.keyboard.type(name)
            await searched
            await page.getByRole('option').filter({ hasText: name }).click()
            await expect(title).toHaveText(name)
            await expect(page).toHaveURL(customerPath(id))
            // The hit opens the customer's page on its default tab, Transactions.
            await expect(page.getByTestId('customer-tab-transactions')).toHaveAttribute(
                'aria-selected',
                'true'
            )
            await page.goBack()
            await expect(hubCard).toBeVisible()
            await expect(customerSurface(page)).toBeHidden()
        })
    }

    // On a very wide window the customer's page sits beside the list of names, so another
    // customer can be opened while a save is in flight (the save turns the leave guard off).
    // Only a window this wide shows the list beside the page, so the test runs at one size.
    test('a save that lands after another customer opened beside the list leaves that customer open (wide)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const title = page.getByTestId('customer-title')
        const save = page.getByTestId('customer-save')
        const detailsTab = page.getByTestId('customer-tab-details')
        const prefix = uniqueName(`Panel ${viewportName(page)}`)
        const name = `${prefix} one`
        const secondName = `${prefix} two`
        const digits = stampDigits()
        const phone = `(555) 010-${digits}`
        const newPhone = `(555) 011-${digits}`
        await createCustomer(page, { name: secondName })
        const id = await createListedCustomer(page, { name, phone })
        const recordPath = customerPath(id)
        const recordUrl = isRecordUrl(id)
        const passed = refusedPatches()
        await page.route(recordUrl, passed.handler)

        // The save that lands then leaves that customer open.
        await page.setViewportSize(WIDE)
        await openCustomersList(page)
        await searchCustomers(page, prefix)
        const secondPath = customerPath(await customerIdOf(page, secondName))
        await customerEntry(page, name).click()
        await expect(page).toHaveURL(recordPath)
        await detailsTab.click()
        await field(page, 'phone').fill(newPhone)
        passed.hold()
        await save.click()
        await expect.poll(() => passed.urls.length).toBe(1)
        await customerEntry(page, secondName).click()
        await expect(page).toHaveURL(secondPath)
        await expect(title).toHaveText(secondName)
        await detailsTab.click()
        await expect(field(page, 'display_name')).toHaveValue(secondName)
        const landed = patchAnswered(page, id)
        passed.release('pass')
        await landed
        await afterNextFrames(page)
        await expect(page).toHaveURL(secondPath)
        await expect(customerSurface(page)).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(secondName)
        await page.unroute(recordUrl, passed.handler)
    })
})
