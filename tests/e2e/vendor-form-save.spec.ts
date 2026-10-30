import { expect, type Page, test } from '@playwright/test'
import {
    afterNextFrames,
    createVendor,
    DESKTOP,
    discardDialog,
    field,
    holdLoads,
    insertAnswered,
    isDisabled,
    isRecordsUrl,
    isRecordUrl,
    openBooks,
    openNewVendor,
    openVendor,
    openVendorsList,
    patchAnswered,
    pressEscapeOutsideInputs,
    refusedWrites,
    searchVendors,
    stampDigits,
    uniqueName,
    vendorEntries,
    vendorEntry,
    vendorIdOf,
    vendorSurface,
} from './vendor-form-helpers'

// Save, Save and new, a search hit that opens a saved vendor, server refusals on a field
// and on the form, an edit save that writes only the dirty keys, and the "Discard
// changes?" guard on Cancel, Escape, the page's back button and the browser's Back
// button, with the leave paths held and one press at a time while a save is in flight.
//
// Each test logs in and creates, through the form, the vendors it needs, each with a
// unique name. No seeded vendor is edited. Every test runs on desktop only: the save,
// the refusal placement and the guard run the same code on a phone, and core
// ConfirmDialog's phone sheet is driven by the phone runs of the customer save spec.
//
// Not covered here: a read-only user (a Close button and no footer actions) cannot be
// driven, because the seed has no read-only Books member; `recordFooter` is unit-tested
// (tests/record-display.test.ts). The iOS swipe back and the Android hardware back are
// native-only and are not run. A save answer that lands after another vendor opened, and
// a throw before the write, are the shared `useRecordSave`: the customer save spec's wide
// test and tests/record-save.test.ts drive them. A refusal after leaving (a toast) is
// shared useRecordSave behavior that the customer save spec drives. Not driven by any e2e
// (pruned to fit the 12-test cap): the `beforeunload` prompt on a dirty tab close, and
// Retry of a failed list load while a vendor is open beside it. Pacific Power is seeded
// and never edited, so "an untouched stored inactive account is kept on save" is
// server/vendors_test.go (the account rule runs only on a change) plus the dirty-keys
// PATCH this spec reads.

const ROOT_REFUSAL = 'Books cannot save this vendor right now.'
const FORM_RECORDS = '**/api/collections/forms/records**'

async function expectListShown(page: Page) {
    await expect(page.getByTestId('vendors-list')).toBeVisible()
    await expect(vendorSurface(page)).toBeHidden()
}

function exactText(label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^\\s*${escaped}\\s*$`)
}

// Opens a core SelectInput and presses the item whose text is `label`: core names each
// item `${testID}-${value}`.
async function pickOption(page: Page, key: string, label: string) {
    await page.getByTestId(`form-input-${key}`).click()
    const item = page
        .locator(`[data-testid^="form-input-${key}-"]`)
        .filter({ hasText: exactText(label) })
    await expect(item).toHaveCount(1)
    await item.click()
    await expect(page.locator(`[data-testid^="form-input-${key}-"]`)).toHaveCount(0)
}

test.describe('vendor-form: save and discard', () => {
    test('saves a full vendor, and a search hit opens it (desktop)', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const title = page.getByTestId('vendor-title')
        const save = page.getByTestId('vendor-save')
        const summary = page.getByTestId('form-error-summary')

        // (1) While the form's definition loads, the surface shows no footer.
        const formLoads = await holdLoads(page, FORM_RECORDS)
        await openVendorsList(page)
        await page.getByTestId('vendor-new-header').click()
        await expect(vendorSurface(page)).toBeVisible()
        await expect(page.getByTestId('vendor-loading')).toBeVisible()
        await expect.poll(() => formLoads.held.length).toBeGreaterThan(0)
        await expect(page.getByTestId('vendor-footer')).toBeHidden()
        await expect(save).toBeHidden()
        await expect(page.getByTestId('vendor-cancel')).toBeHidden()
        await formLoads.release()
        await expect(title).toHaveText('New vendor')

        // (2) Save with Display name empty: the field shows its error inline only.
        await save.click()
        await expect(page.getByTestId('form-field-display_name')).toContainText(
            'Display name is required'
        )
        await expect(summary).toBeHidden()
        await expect(page).toHaveURL(/\/new$/)

        // (3) A full vendor.
        const prefix = uniqueName(page, 'Save')
        const name = `${prefix} one`
        const digits = stampDigits()
        const phone = `(555) 010-${digits}`
        const mobile = `(555) 012-${digits}`
        const website = 'https://helix.example'
        const accountNumber = `ACCT-${digits}`
        const notes = `Helix notes ${digits}`
        await field(page, 'display_name').fill(name)
        await field(page, 'company').fill('Helix Supply')
        await field(page, 'first_name').fill('Ada')
        await field(page, 'last_name').fill('Helix')
        await field(page, 'email').fill(`helix.${digits}@example.com`)
        await field(page, 'phone').fill(phone)
        await field(page, 'mobile').fill(mobile)
        await field(page, 'website').fill(website)
        await page.getByTestId('form-input-address-line1').fill('12 Harbor Way')
        await page.getByTestId('form-input-address-city').fill('Portland')
        await page.getByTestId('form-input-address-region').fill('OR')
        await page.getByTestId('form-input-address-postal_code').fill('97210')
        await page.getByTestId('form-input-address-country').fill('United States')
        await pickOption(page, 'terms', 'Net 30')
        await field(page, 'account_number').fill(accountNumber)
        await pickOption(page, 'expense_account', '6100 Rent')
        await field(page, 'notes').fill(notes)

        // (4) Save and new inserts the vendor and stays on an empty New vendor form.
        const insert = page.waitForRequest(
            r => r.method() === 'POST' && isRecordsUrl(new URL(r.url()))
        )
        const inserted = insertAnswered(page)
        await page.getByTestId('vendor-save-new').click()
        const body = (await insert).postDataJSON()
        expect(body.display_name).toBe(name)
        expect(body.terms).toBe('net_30')
        expect(typeof body.form).toBe('string')
        expect(body.form).not.toBe('')
        expect(typeof body.fields).toBe('object')
        expect(body.fields).not.toBeNull()
        expect(typeof body.expense_account).toBe('string')
        expect(body.expense_account).not.toBe('')
        await expect(page).toHaveURL(/\/books\/vendors\/new$/)
        await expect(title).toHaveText('New vendor')
        await expect(field(page, 'display_name')).toHaveValue('')
        await expect(field(page, 'company')).toHaveValue('')
        await expect(page.getByTestId('form-input-terms')).toContainText('None')
        await expect(page.getByTestId('form-input-expense_account')).toContainText('None')

        // (5) The saved vendor has every value that was typed, read after the server
        // answered so the optimistic row cannot stand in for the stored one.
        expect((await inserted).status()).toBe(200)
        await openVendorsList(page)
        await searchVendors(page, name)
        const id = await vendorIdOf(page, name)
        await openVendor(page, name)
        await expect(page).toHaveURL(new RegExp(`/books/vendors/${id}$`))
        await expect(title).toHaveText('Edit vendor')
        await expect(field(page, 'company')).toHaveValue('Helix Supply')
        await expect(field(page, 'phone')).toHaveValue(phone)
        await expect(field(page, 'mobile')).toHaveValue(mobile)
        await expect(field(page, 'website')).toHaveValue(website)
        await expect(page.getByTestId('form-input-address-line1')).toHaveValue('12 Harbor Way')
        await expect(page.getByTestId('form-input-address-city')).toHaveValue('Portland')
        await expect(page.getByTestId('form-input-terms')).toContainText('Net 30')
        await expect(field(page, 'account_number')).toHaveValue(accountNumber)
        await expect(page.getByTestId('form-input-expense_account')).toContainText('6100 Rent')
        await expect(field(page, 'notes')).toHaveValue(notes)

        // (6) A search hit from outside the list pushes the vendor; Back returns.
        const hubCard = page.getByTestId('books-list-card-vendors')
        await page.getByTestId('vendor-back').click()
        await expectListShown(page)
        await page.getByTestId('vendors-back').click()
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
        await expect(title).toHaveText('Edit vendor')
        await expect(page).toHaveURL(new RegExp(`/books/vendors/${id}$`))
        await page.goBack()
        await expect(hubCard).toBeVisible()
        await expect(vendorSurface(page)).toBeHidden()
    })

    test('refuses bad values and writes only the dirty keys (desktop)', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const save = page.getByTestId('vendor-save')
        const summary = page.getByTestId('form-error-summary')
        const dialog = discardDialog(page)
        const prefix = uniqueName(page, 'Refuse')
        const name = `${prefix} one`
        const secondName = `${prefix} two`
        const digits = stampDigits()

        // (1)
        await createVendor(page, { name })

        // (2) An email the server refuses lands on the Email field; fixed, Save leaves.
        await openNewVendor(page)
        await field(page, 'display_name').fill(secondName)
        await field(page, 'email').fill('not-an-email')
        await save.click()
        await expect(page.getByTestId('form-field-email')).toContainText(/valid email address/i)
        await expect(page).toHaveURL(/\/new$/)
        await field(page, 'email').fill(`helix.${digits}.two@example.com`)
        await save.click()
        await expectListShown(page)
        await searchVendors(page, prefix)
        await expect(vendorEntry(page, name)).toBeVisible()
        await expect(vendorEntry(page, secondName)).toBeVisible()
        await expect(vendorEntries(page)).toHaveCount(2)

        // (3) A duplicate name, in another case, is a field refusal, not a root error.
        await openNewVendor(page)
        const upperName = name.toUpperCase()
        await field(page, 'display_name').fill(upperName)
        await save.click()
        await expect(page.getByTestId('form-field-display_name')).toContainText(
            `A vendor named “${upperName}” already exists.`
        )
        await expect(summary).toBeHidden()
        await page.getByTestId('vendor-cancel').click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expectListShown(page)

        // (4) An edit save writes only the dirty keys.
        await searchVendors(page, prefix)
        const id = await vendorIdOf(page, name)
        const recordRoute = isRecordUrl(id)
        const recordPath = new RegExp(`/books/vendors/${id}$`)
        const newPhone = `(555) 011-${digits}`
        await openVendor(page, name)
        await field(page, 'phone').fill(newPhone)
        const patch = page.waitForRequest(
            r => r.method() === 'PATCH' && recordRoute(new URL(r.url()))
        )
        await save.click()
        expect(Object.keys((await patch).postDataJSON())).toEqual(['phone'])
        await expectListShown(page)
        await expect(vendorEntry(page, name)).toContainText(newPhone)

        // (5) A refusal with no field on an edit save shows in the form's summary and
        // keeps the typed value; the next save stores it.
        const newMobile = `(555) 013-${digits}`
        const patches = refusedWrites(ROOT_REFUSAL)
        await page.route(recordRoute, patches.handler)
        await openVendor(page, name)
        await field(page, 'mobile').fill(newMobile)
        await save.click()
        await expect(summary).toContainText(ROOT_REFUSAL)
        await expect(vendorSurface(page)).toBeVisible()
        await expect(page).toHaveURL(recordPath)
        await expect(field(page, 'mobile')).toHaveValue(newMobile)
        await page.unroute(recordRoute, patches.handler)
        await save.click()
        await expectListShown(page)
        await expect(dialog.title).toBeHidden()
        await openVendor(page, name)
        await expect(field(page, 'mobile')).toHaveValue(newMobile)
    })

    test('asks before unsaved changes are lost (desktop)', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const save = page.getByTestId('vendor-save')
        const cancel = page.getByTestId('vendor-cancel')
        const back = page.getByTestId('vendor-back')
        const dialog = discardDialog(page)
        const digits = stampDigits()
        const name = `${uniqueName(page, 'Guard')} one`
        const phone = `(555) 010-${digits}`

        // (1)
        await createVendor(page, { name, phone })
        await searchVendors(page, name)
        const id = await vendorIdOf(page, name)
        const recordRoute = isRecordUrl(id)
        const recordPath = new RegExp(`/books/vendors/${id}$`)

        // (2) An address part typed and emptied again leaves the form clean: an all-empty
        // address is stored as null, the form's seed. Typed, Escape asks; emptied again,
        // Escape leaves with no question.
        await openNewVendor(page)
        const street = page.getByTestId('form-input-address-line1')
        await street.fill('x')
        await expect(street).toHaveValue('x')
        await pressEscapeOutsideInputs(page)
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(street).toHaveValue('x')
        await street.fill('')
        await expect(street).toHaveValue('')
        await pressEscapeOutsideInputs(page)
        await expectListShown(page)
        await expect(dialog.title).toBeHidden()

        // (3) Cancel, Escape, the back button and the browser's Back ask while dirty.
        const newPhone = `(555) 011-${digits}`
        await openVendor(page, name)
        await field(page, 'phone').fill(newPhone)
        await cancel.click()
        await expect(dialog.title).toBeVisible()
        await expect(dialog.message).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(field(page, 'phone')).toHaveValue(newPhone)

        await pressEscapeOutsideInputs(page)
        await expect(dialog.title).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog.title).toBeHidden()
        await expect(vendorSurface(page)).toBeVisible()

        await back.click()
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()

        await page.goBack()
        await expect(dialog.title).toBeVisible()
        await expect(page).toHaveURL(recordPath)
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(recordPath)
        await expect(field(page, 'phone')).toHaveValue(newPhone)

        // (4) One press at a time, the leave paths held, and an edit typed during the
        // write is kept: the page stays, still guarded.
        const passed = refusedWrites(ROOT_REFUSAL)
        await page.route(recordRoute, passed.handler)
        passed.hold()
        await save.click()
        await expect.poll(() => passed.urls.length).toBe(1)
        await expect.poll(() => isDisabled(save)).toBe(true)
        // Save is disabled while it runs, so a plain click would wait for it.
        await save.click({ force: true })
        await afterNextFrames(page)
        expect(passed.urls.length).toBe(1)
        await expect.poll(() => isDisabled(cancel)).toBe(true)
        await expect.poll(() => isDisabled(back)).toBe(true)
        await pressEscapeOutsideInputs(page)
        await expect(vendorSurface(page)).toBeVisible()
        await expect(page).toHaveURL(recordPath)
        const mobile = `(555) 012-${digits}`
        await field(page, 'mobile').fill(mobile)
        const saved = patchAnswered(page, id)
        passed.release('pass')
        await saved
        await afterNextFrames(page)
        expect(passed.urls.length).toBe(1)
        await expect(vendorSurface(page)).toBeVisible()
        await expect(page).toHaveURL(recordPath)
        await expect(field(page, 'mobile')).toHaveValue(mobile)
        await expect.poll(() => isDisabled(cancel)).toBe(false)
        await back.click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expectListShown(page)
        await page.unroute(recordRoute, passed.handler)

        // (5) A saved form leaves without asking.
        const notes = `Guard notes ${digits}`
        await openVendor(page, name)
        await field(page, 'notes').fill(notes)
        await save.click()
        await expectListShown(page)
        await expect(dialog.title).toBeHidden()
        await openVendor(page, name)
        await expect(field(page, 'notes')).toHaveValue(notes)
        await back.click()
        await expectListShown(page)
        await expect(dialog.title).toBeHidden()
    })
})
