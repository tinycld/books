import { expect, type Locator, type Page, test } from '@playwright/test'
import { tabTo } from './keyboard-helpers'
import { localDay, vendorWithBills } from './pay-bills-helpers'
import { codeRouteKeys } from './record-key-helpers'
import {
    createVendor,
    DESKTOP,
    discardDialog,
    exactText,
    field,
    holdVendorWrite,
    isDisabled,
    isRecordUrl,
    openBooks,
    openNewVendor,
    openVendorId,
    openVendorsList,
    PHONE,
    panelPlacement,
    refusedWrites,
    searchVendors,
    stampDigits,
    takesClickAtCenter,
    uniqueName,
    vendorEntry,
    vendorIdOf,
    vendorPath,
    WIDE,
} from './vendor-form-helpers'

// The vendor page (vendor-pages checkpoint 3): every way in (Save on New vendor, the list
// row, the row menu's Edit, a search hit), the header with who the vendor is, Details and
// Notes edited in place with a save bar from the keyboard, the save refusals and the leave
// guard, the More menu, and the record width beside a column of names on a very wide
// window. Every test creates its own vendors with unique names and edits no seeded row.
//
// Not covered here: a read-only user (no More write items, read-only forms, no save bar)
// cannot be driven, because the e2e seed has no read-only Books member (as
// customer-form-actions.spec.ts says); the reader rules are pinned by the
// `vendorPageControls` unit test (tests/vendor-page-tabs.test.ts) and the `readOnly` /
// `canWrite` flags of the shared parts. The `mailto:` / `tel:` targets of Email and Call
// are not followed (Linking leaves the page); this spec checks that each control shows only
// when the vendor has the value. Swipe back and the hardware back are native only; the same
// `useLeaveGuard` call that holds the browser Back button holds them. The phone tab strip
// scrolling the selected tab into view is checked at gate 2 only. The Transactions tab, the
// balance and New transaction come in checkpoint 4. §3.10 (not found, loading) is unchanged
// and stays covered by vendor-form-page.spec.ts.

const LIST_URL = /\/books\/vendors$/
const BUSY = 'Books is busy. Try again.'
const CHANGE_REFUSAL = 'Books cannot change this vendor right now.'

// The most Tab presses from the Details tab to one of its form fields.
const TO_DETAILS_FIELD = 40

// True when the keyboard focus is inside the Vendors list (its search, toggles, rows).
function listHasFocus(page: Page) {
    return page.evaluate(
        () => document.activeElement?.closest('[data-testid="vendors-list"]') != null
    )
}

// From `start`, presses `key` `presses` times; the focus never enters the Vendors list.
async function focusSkipsList(
    page: Page,
    start: Locator,
    key: 'Tab' | 'Shift+Tab',
    presses: number
) {
    await start.focus()
    await expect(start).toBeFocused()
    for (let pressed = 0; pressed < presses; pressed++) {
        await page.keyboard.press(key)
        expect(await listHasFocus(page)).toBe(false)
    }
}

// Presses Shift+Tab from `start` until the focus is inside the Vendors list (at most
// `max` presses).
async function shiftTabIntoList(page: Page, start: Locator, max = 15) {
    await start.focus()
    await expect(start).toBeFocused()
    for (let pressed = 0; pressed < max && !(await listHasFocus(page)); pressed++) {
        await page.keyboard.press('Shift+Tab')
    }
    expect(await listHasFocus(page)).toBe(true)
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

// From the list: the vendor's row opens its page.
async function openFromRow(page: Page, name: string) {
    await openVendorsList(page)
    await searchVendors(page, name)
    await vendorEntry(page, name).click()
    await expect(page.getByTestId('vendor-title')).toHaveText(name)
}

// From the list: the row menu's Edit opens the page on its Details tab.
async function openDetailsFromRowMenu(page: Page, name: string) {
    await openVendorsList(page)
    await searchVendors(page, name)
    const id = await vendorIdOf(page, name)
    await page.getByTestId(`vendor-menu-${id}`).click()
    await page.getByTestId('vendor-menu-edit').click()
    await expect(page).toHaveURL(
        new RegExp(`/books/vendors/${await codeRouteKeys(page, 'vendors', id)}\\?tab=details$`)
    )
    await expect(page.getByTestId('vendor-tab-details')).toHaveAttribute('aria-selected', 'true')
    return id
}

async function openMore(page: Page) {
    await page.getByTestId('vendor-more').click()
    await expect(page.getByTestId('vendor-more-history')).toBeVisible()
}

async function chooseMore(page: Page, item: string) {
    await openMore(page)
    await page.getByTestId(item).click()
}

test.describe('vendor-pages: vendor page', () => {
    test('opens the page from every way in and shows who the vendor is', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const title = page.getByTestId('vendor-title')
        const header = page.getByTestId('vendor-header')
        const prefix = uniqueName('Ways in')
        const name = `${prefix} A`
        const plainName = `${prefix} B`
        const company = `${prefix} Holdings`
        const digits = stampDigits()
        const accountNumber = `ACCT-${digits}`
        const notes = `${prefix} private notes`

        // A vendor with a company of its own, an address, an email, a mobile and no phone,
        // an account number, terms and notes.
        await openNewVendor(page)
        await field(page, 'display_name').fill(name)
        await field(page, 'company').fill(company)
        await field(page, 'email').fill(`ways.${digits}@example.com`)
        await field(page, 'mobile').fill(`(555) 016-${digits}`)
        await page.getByTestId('form-input-address-line1').fill('12 Harbor Way')
        await page.getByTestId('form-input-address-city').fill('Portland')
        await page.getByTestId('form-input-address-region').fill('OR')
        await page.getByTestId('form-input-address-postal_code').fill('97210')
        await field(page, 'account_number').fill(accountNumber)
        await pickOption(page, 'terms', 'Net 30')
        await field(page, 'notes').fill(notes)
        await page.getByTestId('vendor-save').click()

        // Save opens the new vendor's page.
        await expect(page).toHaveURL(
            /\/books\/vendors\/(?!new(\?|$))([a-z0-9]{15}|[A-Z0-9][A-Z0-9-]{1,14})(\?.*)?$/
        )
        await expect(title).toHaveText(name)
        const id = await openVendorId(page)
        await expect(page.getByTestId('vendor-company')).toHaveText(company)
        const address = page.getByTestId('vendor-address')
        await expect(address).toContainText('12 Harbor Way')
        await expect(address).toContainText('Portland, OR 97210')
        await expect(page.getByTestId('vendor-email-action')).toBeVisible()
        // Call from the mobile number alone.
        await expect(page.getByTestId('vendor-call-action')).toBeVisible()
        await expect(header).not.toContainText(accountNumber)
        await expect(header).not.toContainText('Net 30')
        await expect(header).not.toContainText(notes)

        // The back button leaves to the list; the row opens the page again.
        await page.getByTestId('vendor-back').click()
        await expect(page).toHaveURL(LIST_URL)
        await openFromRow(page, name)
        await expect(page).toHaveURL(await vendorPath(page, id))

        // The row menu's Edit opens the page on Details.
        await openDetailsFromRowMenu(page, name)

        // A vendor whose company is its name and that has no email, phone or mobile: no
        // company line and neither contact action.
        await createVendor(page, { name: plainName, company: plainName })
        await openFromRow(page, plainName)
        await expect(page.getByTestId('vendor-company')).toHaveCount(0)
        await expect(page.getByTestId('vendor-email-action')).toHaveCount(0)
        await expect(page.getByTestId('vendor-call-action')).toHaveCount(0)

        // A search hit opens the first vendor's page.
        const hubCard = page.getByTestId('books-list-card-vendors')
        await page.getByTestId('vendor-back').click()
        await expect(page).toHaveURL(LIST_URL)
        await page.getByTestId('vendors-back').click()
        await expect(hubCard).toBeVisible()
        await page.keyboard.press('/')
        // The palette focuses its input a frame after it shows.
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
        await page
            .getByRole('option')
            .filter({ has: page.getByText(name, { exact: true }) })
            .click()
        await expect(page).toHaveURL(await vendorPath(page, id))
        await expect(title).toHaveText(name)
    })

    test('edits Details and Notes from the keyboard and stays on the page', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const name = uniqueName('Vendor keys')
        const newName = `${name} renamed`
        const company = `${name} Supply`
        const note = `${name} note`
        const nameInput = field(page, 'display_name')
        const companyInput = field(page, 'company')
        const notesInput = page.getByTestId('vendor-notes-input')
        const saveBar = page.getByTestId('vendor-save-bar')
        const dialog = discardDialog(page)
        await createVendor(page, { name })
        const id = await openDetailsFromRowMenu(page, name)

        // No click from here. The row menu's Edit opens the page over the list, so core
        // gives the focus back to a menu trigger that is now covered: it stays on the body.
        await tabTo(page, nameInput, { max: TO_DETAILS_FIELD, fromBody: true })
        // Chromium selects the value on Tab focus, so typing replaces it.
        await page.keyboard.type(newName)
        await expect(nameInput).toHaveValue(newName)
        await tabTo(page, companyInput, { max: TO_DETAILS_FIELD })
        await page.keyboard.type(company)
        await expect(companyInput).toHaveValue(company)

        await page.keyboard.press('Alt+4')
        await expect(page).toHaveURL(
            new RegExp(`/books/vendors/${await codeRouteKeys(page, 'vendors', id)}\\?tab=notes$`)
        )
        await expect(notesInput).toBeFocused()
        await page.keyboard.type(note)
        await expect(saveBar).toBeVisible()
        await expect(saveBar).toContainText('Unsaved changes')

        // The Details edits live above the tabs: back on Details they are still typed.
        await page.keyboard.press('Alt+3')
        await expect(page.getByTestId('vendor-tab-details')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await expect(nameInput).toHaveValue(newName)
        await expect(companyInput).toHaveValue(company)

        await page.keyboard.press('ControlOrMeta+s')
        await expect(saveBar).toBeHidden()
        await expect(page).toHaveURL(
            new RegExp(`/books/vendors/${await codeRouteKeys(page, 'vendors', id)}\\?tab=details$`)
        )

        // The stored values, read again after a reload.
        await page.reload()
        await expect(nameInput).toHaveValue(newName)
        await expect(companyInput).toHaveValue(company)
        await page.keyboard.press('Alt+4')
        await expect(notesInput).toHaveValue(note)

        // A new edit, Escape: the question; ⌘↵ discards back to the stored note.
        await expect(notesInput).toBeFocused()
        await page.keyboard.press('End')
        await page.keyboard.type(' unsaved')
        await expect(saveBar).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog.title).toBeVisible()
        await expect(dialog.message).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog.title).toBeHidden()
        await expect(notesInput).toHaveValue(note)
        await expect(saveBar).toBeHidden()

        // Nothing is dirty, so Escape leaves the page.
        await page.keyboard.press('Alt+3')
        await expect(page.getByTestId('vendor-tab-details')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(LIST_URL)
    })

    test('shows a refusal where the user can see it and holds every way out while dirty', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const dialog = discardDialog(page)
        const back = page.getByTestId('vendor-back')
        const detailsTab = page.getByTestId('vendor-tab-details')
        const notesTab = page.getByTestId('vendor-tab-notes')
        const notesInput = page.getByTestId('vendor-notes-input')
        const saveBar = page.getByTestId('vendor-save-bar')
        const prefix = uniqueName('Vendor guard')
        const nameA = `${prefix} A`
        const nameB = `${prefix} B`
        const fixedName = `${prefix} A2`
        const note = `${prefix} note`
        const secondNote = `${prefix} second note`
        await createVendor(page, { name: nameA })
        await createVendor(page, { name: nameB })
        // Both rows stay in the list under the page, for the row press beside it below.
        await openVendorsList(page)
        await searchVendors(page, prefix)
        await vendorEntry(page, nameA).click()
        await expect(page.getByTestId('vendor-title')).toHaveText(nameA)
        const idA = await openVendorId(page)
        const isPatchOfA = isRecordUrl(idA)
        const written: Record<string, unknown>[] = []
        page.on('response', response => {
            const request = response.request()
            if (request.method() !== 'PATCH' || !response.ok()) return
            if (isPatchOfA(new URL(response.url()))) written.push(request.postDataJSON())
        })

        // A field refusal from the Notes tab selects Details and shows on its field.
        await detailsTab.click()
        await field(page, 'display_name').fill(nameB)
        await notesTab.click()
        await notesInput.fill(note)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(detailsTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('form-field-display_name')).toContainText(
            `A vendor named “${nameB}” already exists`
        )
        await expect(saveBar).toBeVisible()

        // Fixed, Save writes both the name and the note.
        await field(page, 'display_name').fill(fixedName)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(saveBar).toBeHidden()
        await expect(page.getByTestId('vendor-title')).toHaveText(fixedName)
        await expect.poll(() => written.some(body => body.display_name === fixedName)).toBe(true)
        await expect.poll(() => written.some(body => body.notes === note)).toBe(true)

        // A refusal with no field shows in the save bar while Notes is on screen.
        await notesTab.click()
        await expect(notesInput).toHaveValue(note)
        await notesInput.fill(secondNote)
        const refused = refusedWrites(BUSY)
        await page.route(isRecordUrl(idA), refused.handler)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page.getByTestId('vendor-save-error-summary')).toContainText(BUSY)
        await expect(notesTab).toHaveAttribute('aria-selected', 'true')
        await expect(saveBar).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })

        // The back button asks first; Keep editing keeps the note.
        await back.click()
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(await vendorPath(page, idA))
        await expect(notesInput).toHaveValue(secondNote)

        // Beside the names column, another row asks first.
        await page.setViewportSize(WIDE)
        await expect(back).toBeHidden()
        await vendorEntry(page, nameB).click()
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(await vendorPath(page, idA))
        await expect(notesInput).toHaveValue(secondNote)

        // The browser's Back asks first.
        await page.goBack()
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(await vendorPath(page, idA))
        await expect(notesInput).toHaveValue(secondNote)

        // An open dialog takes Escape first: the page, its edits and the bar stay.
        await page.getByTestId('vendor-tab-contacts').click()
        await page.getByTestId('vendor-contacts-empty-add').click()
        const contactDialog = page.getByTestId('contact-dialog')
        await expect(contactDialog).toBeVisible()
        await expect(page.getByTestId('contact-name')).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(contactDialog).toBeHidden()
        await expect(saveBar).toBeVisible()
        await expect(dialog.title).toHaveCount(0)
        await expect(page).toHaveURL(await vendorPath(page, idA))

        // Saved, the back button leaves with no question.
        await page.getByTestId('vendor-save').click()
        await expect(saveBar).toBeHidden()
        await page.setViewportSize(DESKTOP)
        await expect(back).toBeVisible()
        await back.click()
        await expect(page).toHaveURL(LIST_URL)
        await expect(dialog.title).toHaveCount(0)
    })

    test('More: makes the vendor inactive and active, opens the audit history, deletes', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const title = page.getByTestId('vendor-title')
        const badge = page.getByTestId('vendor-inactive-badge')
        const toggle = page.getByTestId('vendor-more-inactive')
        const deleteItem = page.getByTestId('vendor-more-delete')
        const banner = page.getByTestId('vendor-action-banner')
        const deleteBody = page.getByTestId('delete-vendor-dialog-body')
        const name = uniqueName('Vendor more')
        await createVendor(page, { name })
        await openFromRow(page, name)
        const id = await openVendorId(page)

        // Make inactive, then Make active.
        await chooseMore(page, 'vendor-more-inactive')
        await expect(badge).toBeVisible()
        await expect(badge).toHaveText('Inactive')
        await openMore(page)
        await expect(toggle).toHaveText('Make active')
        await toggle.click()
        await expect(badge).toHaveCount(0)

        // A refused change shows in the page's banner; no badge; dismiss removes it.
        await page.route(isRecordUrl(id), refusedWrites(CHANGE_REFUSAL).handler)
        await chooseMore(page, 'vendor-more-inactive')
        await expect(banner).toContainText(CHANGE_REFUSAL)
        await expect(badge).toHaveCount(0)
        await page.getByTestId('vendor-action-banner-dismiss').click()
        await expect(banner).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })

        // While a write runs, the write items are disabled; settled, they are enabled.
        const held = await holdVendorWrite(page, id, 'PATCH')
        await chooseMore(page, 'vendor-more-inactive')
        await held.arrived
        await openMore(page)
        await expect.poll(() => isDisabled(toggle)).toBe(true)
        await expect.poll(() => isDisabled(deleteItem)).toBe(true)
        await page.keyboard.press('Escape')
        await expect(toggle).toHaveCount(0)
        await held.release()
        await expect(badge).toBeVisible()
        await openMore(page)
        await expect.poll(() => isDisabled(toggle)).toBe(false)
        await expect.poll(() => isDisabled(deleteItem)).toBe(false)

        // An open menu takes Escape first: the menu closes, the page stays.
        await page.keyboard.press('Escape')
        await expect(toggle).toHaveCount(0)
        await expect(page).toHaveURL(await vendorPath(page, id))
        await expect(title).toHaveText(name)

        // On a phone More is an icon button at the header's top right (another component):
        // it opens the same items, and Escape closes the menu and keeps the page.
        const more = page.getByTestId('vendor-more')
        await page.setViewportSize(PHONE)
        await expect(more).toBeVisible()
        await expect(more).not.toContainText('More')
        await more.click()
        await expect(toggle).toBeVisible()
        await expect(deleteItem).toBeVisible()
        await expect(page.getByTestId('vendor-more-history')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(toggle).toHaveCount(0)
        await expect(page).toHaveURL(await vendorPath(page, id))
        await expect(title).toHaveText(name)
        await page.setViewportSize(DESKTOP)
        await expect(more).toContainText('More')

        // Make the vendor active again, so the default list shows its row for the delete.
        await chooseMore(page, 'vendor-more-inactive')
        await expect(badge).toHaveCount(0)

        // Audit history opens this vendor's history; Back returns to the page.
        await chooseMore(page, 'vendor-more-history')
        await expect(page).toHaveURL(new RegExp(`/books/history/books_vendors/${id}$`))
        await expect(page.getByTestId('history-title')).toHaveText(name)
        await page.goBack()
        await expect(title).toHaveText(name)

        // A vendor on a posted bill: the refusal shows in the delete dialog, not the banner.
        await openVendorsList(page)
        const billed = await vendorWithBills(page, {
            name: uniqueName('Vendor billed'),
            bills: [{ amount: '120.00', due: await localDay(page, 30) }],
        })
        await openFromRow(page, billed.vendor.name)
        await chooseMore(page, 'vendor-more-delete')
        await expect(deleteBody).toBeVisible()
        await page.getByTestId('delete-vendor-confirm').click()
        await expect(deleteBody).toContainText(
            `${billed.vendor.name} is on bills. Make it inactive instead.`
        )
        await expect(banner).toHaveCount(0)
        await page.getByTestId('delete-vendor-close').click()
        await expect(deleteBody).toBeHidden()

        // A vendor with no documents: confirmed, the delete leaves to the list without it.
        await openFromRow(page, name)
        await chooseMore(page, 'vendor-more-delete')
        await expect(deleteBody).toContainText(name)
        await page.getByTestId('delete-vendor-confirm').click()
        await expect(page).toHaveURL(LIST_URL)
        await page.getByTestId('vendors-show-inactive').click()
        await searchVendors(page, name)
        await expect(vendorEntry(page, name)).toHaveCount(0)
    })

    test('narrows the list to names on a very wide window and keeps edits across a resize', async ({
        page,
    }) => {
        await openBooks(page, WIDE)
        const back = page.getByTestId('vendor-back')
        const notesInput = page.getByTestId('vendor-notes-input')
        const listHeader = page.getByTestId('vendors-header')
        const name = uniqueName('Vendor wide')
        const note = `${name} note`
        await createVendor(page, { name, email: `wide.${stampDigits()}@example.com` })
        await openVendorsList(page)
        await searchVendors(page, name)
        const id = await vendorIdOf(page, name)
        const row = vendorEntry(page, name)
        await row.click()
        await expect(page).toHaveURL(await vendorPath(page, id))

        // The page beside a column of names: no back button, no email column.
        await expect(page.getByTestId('vendor-title')).toHaveText(name)
        await expect(back).toBeHidden()
        await expect(row).toBeVisible()
        await expect(listHeader).not.toContainText('Email')
        await expect(page.getByTestId(`vendor-cell-email-${id}`)).toBeHidden()

        // Below 1360 px the page covers the list, and the typed note and the bar stay.
        await page.getByTestId('vendor-tab-notes').click()
        await notesInput.fill(note)
        await expect(page.getByTestId('vendor-save-bar')).toBeVisible()
        await page.setViewportSize({ width: 1280, height: 1000 })
        await expect(back).toBeVisible()
        await expect.poll(() => takesClickAtCenter(row)).toBe(false)
        await expect(notesInput).toHaveValue(note)
        await expect(page.getByTestId('vendor-save-bar')).toBeVisible()

        // The covered list is out of the keyboard's way: from the page's back button, the
        // focus never lands in it, back or forward.
        await focusSkipsList(page, back, 'Shift+Tab', 12)
        await focusSkipsList(page, back, 'Tab', 30)

        // Discarded; a new vendor at 1600 px keeps the 480 px panel beside the full list.
        await page.getByTestId('vendor-cancel').click()
        await discardDialog(page).discard.click()
        await expect(page.getByTestId('vendor-save-bar')).toBeHidden()
        await page.setViewportSize(WIDE)
        await expect(back).toBeHidden()
        // Beside the page, the names column is reachable by keyboard again.
        await shiftTabIntoList(page, page.getByTestId('vendor-more'))
        await openNewVendor(page)
        await expect(listHeader).toContainText('Email')
        await expect
            .poll(() => panelPlacement(page))
            .toEqual({ widthIs480: true, atContentRight: true, listToItsLeft: true })
    })
})
