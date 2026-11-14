import { expect, type Locator, type Page, test } from '@playwright/test'
import {
    createCustomer,
    customerEntry,
    customerIdOf,
    customerPageUrl,
    customerPath,
    DESKTOP,
    discardDialog,
    field,
    holdRecordWrite,
    isDisabled,
    isRecordUrl,
    openBooks,
    openCustomer,
    openCustomersList,
    openNewCustomer,
    panelPlacement,
    refusedWrites,
    searchCustomers,
    seenNotFoundOrDiscard,
    settle,
    stampDigits,
    takesClickAtCenter,
    uniqueName,
    WIDE,
    watchForNotFoundAndDiscard,
} from './customer-form-helpers'

// The customer page (customer-pages checkpoint 2): the record width beside a 320 px name
// column on a very wide window, Details and Notes edited in place with a save bar, driven
// from the keyboard (⌥3, ⌥4, ⌘S, Escape), the leave guard and the save refusals, and the
// header with its More menu. Every test creates its own customers with unique names and
// edits no seeded row.
//
// Not covered here: a read-only user (no More menu, read-only forms, no save bar) cannot
// be driven, because the e2e seed has no read-only Books member; the reader rules are
// pinned by the `customerPageControls` unit test (tests/customer-page-tabs.test.ts). The
// header test runs the phone More sheet and a tab press at 390 px; the phone tab strip
// scrolling the selected tab into view is checked at gate 2 only. The
// `mailto:` and `tel:` targets of Email and Call are not followed (Linking leaves the
// page); this spec checks that each control shows only when the customer has the value.

const LIST_URL = /\/books\/customers$/
const RECORD_WIDTH_LIST = 320
const BUSY = 'Books is busy. Try again.'
const PHONE = { width: 390, height: 844 }

// The id of the customer whose page is open, read from the URL.
function openCustomerId(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

function isFocused(locator: Locator) {
    return locator.evaluate(el => el === document.activeElement)
}

async function openMore(page: Page) {
    await page.getByTestId('customer-more').click()
    await expect(page.getByTestId('customer-more-inactive')).toBeVisible()
}

async function chooseMore(page: Page, item: string) {
    await openMore(page)
    await page.getByTestId(item).click()
}

test.describe('customer-pages: customer page', () => {
    test('a very wide window shows the page beside a 320 px name column, and a resize keeps the edits', async ({
        page,
    }) => {
        await openBooks(page, WIDE)
        const dialog = discardDialog(page)
        const back = page.getByTestId('customer-back')
        const notesInput = page.getByTestId('customer-notes-input')
        const prefix = uniqueName('Record width')
        const nameA = `${prefix} A`
        const nameB = `${prefix} B`
        await createCustomer(page, { name: nameA, email: `a.${stampDigits()}@example.com` })
        await createCustomer(page, { name: nameB })

        await openCustomersList(page)
        await searchCustomers(page, prefix)
        const idA = await customerIdOf(page, nameA)
        const rowA = customerEntry(page, nameA)
        const rowB = customerEntry(page, nameB)
        const emailCellA = page.getByTestId(`customer-cell-email-${idA}`)
        await rowA.click()
        await expect(page).toHaveURL(customerPath(idA))

        // The page beside a column of names: no back button, no email column.
        await expect(page.getByTestId('customer-tab-details')).toBeVisible()
        await expect(back).toBeHidden()
        await expect(rowA).toBeVisible()
        await expect(emailCellA).toBeHidden()
        await expect
            .poll(async () =>
                Math.round((await page.getByTestId('customers-list').boundingBox())?.width ?? 0)
            )
            .toBe(RECORD_WIDTH_LIST)

        // Another row asks before leaving unsaved notes; Keep editing stays.
        const note = `${prefix} note`
        await page.getByTestId('customer-tab-notes').click()
        await notesInput.fill(note)
        await rowB.click()
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(customerPath(idA))

        // Below 1360 px the page covers the list, and nothing remounts: the note stays.
        await page.setViewportSize({ width: 1280, height: 900 })
        await expect(back).toBeVisible()
        await expect.poll(() => takesClickAtCenter(rowA)).toBe(false)
        await expect(notesInput).toHaveValue(note)

        // Cancel, Discard; a new customer keeps the 480 px panel beside the full list.
        await page.getByTestId('customer-cancel').click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expect(page.getByTestId('customer-save-bar')).toBeHidden()
        await page.setViewportSize(WIDE)
        await openNewCustomer(page)
        await searchCustomers(page, nameA)
        await expect(emailCellA).toBeVisible()
        await expect
            .poll(() => panelPlacement(page))
            .toEqual({ widthIs480: true, atContentRight: true, listToItsLeft: true })
    })

    test('edits Details and Notes from the keyboard only, and the tab is in the URL', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const name = uniqueName('Keys')
        const phone = `(555) 013-${stampDigits()}`
        const note = `${name} note`
        const phoneInput = field(page, 'phone')
        const notesInput = page.getByTestId('customer-notes-input')
        const saveBar = page.getByTestId('customer-save-bar')
        await createCustomer(page, { name })
        const id = openCustomerId(page)

        // No click from here.
        await page.keyboard.press('Alt+3')
        await expect(page.getByTestId('customer-tab-details')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        for (let presses = 0; presses < 15 && !(await isFocused(phoneInput)); presses++) {
            await page.keyboard.press('Tab')
        }
        await expect(phoneInput).toBeFocused()
        await page.keyboard.type(phone)
        await expect(phoneInput).toHaveValue(phone)

        await page.keyboard.press('Alt+4')
        await expect(notesInput).toBeFocused()
        await page.keyboard.type(note)
        await expect(saveBar).toBeVisible()
        await page.keyboard.press('ControlOrMeta+s')
        await expect(saveBar).toBeHidden()
        await expect(page).toHaveURL(new RegExp(`/books/customers/${id}\\?tab=notes$`))

        // The tab is the URL's: a reload opens Notes with the saved note, and the phone
        // was saved too.
        await page.reload()
        await expect(page.getByTestId('customer-tab-notes')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await expect(notesInput).toHaveValue(note)
        await page.keyboard.press('Alt+3')
        await expect(phoneInput).toHaveValue(phone)

        // Nothing is dirty, so Escape leaves the page.
        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(LIST_URL)
    })

    test('holds every way out of unsaved edits, and shows save refusals where they belong', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const dialog = discardDialog(page)
        const back = page.getByTestId('customer-back')
        const detailsTab = page.getByTestId('customer-tab-details')
        const notesTab = page.getByTestId('customer-tab-notes')
        const notesInput = page.getByTestId('customer-notes-input')
        const saveBar = page.getByTestId('customer-save-bar')
        const prefix = uniqueName('Guard')
        const nameA = `${prefix} A`
        const nameB = `${prefix} B`
        const digits = stampDigits()
        const phone = `(555) 010-${digits}`
        const newPhone = `(555) 011-${digits}`
        const note = `${prefix} note`
        await createCustomer(page, { name: nameA, phone })
        await createCustomer(page, { name: nameB })

        await openCustomer(page, nameA)
        const idA = openCustomerId(page)
        const pathA = customerPath(idA)

        // A refused save of a note alone keeps the note unsaved: the bar stays with the
        // refusal in it.
        await notesTab.click()
        await notesInput.fill(note)
        const notesRefused = refusedWrites(BUSY)
        await page.route(isRecordUrl(idA), notesRefused.handler)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page.getByTestId('customer-save-error-summary')).toContainText(BUSY)
        await expect(saveBar).toBeVisible()
        await expect(notesInput).toHaveValue(note)
        await page.unrouteAll({ behavior: 'wait' })
        await detailsTab.click()

        // Edits on both tabs survive switching between them.
        await field(page, 'phone').fill(newPhone)
        await notesTab.click()
        await notesInput.fill(note)
        await detailsTab.click()
        await expect(field(page, 'phone')).toHaveValue(newPhone)
        await notesTab.click()
        await expect(notesInput).toHaveValue(note)
        await expect(saveBar).toBeVisible()

        // Escape, the back button and the browser's Back each ask first.
        await page.keyboard.press('Escape')
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await back.click()
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(pathA)
        await page.goBack()
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(pathA)

        // A refusal with no field shows in the save bar while Notes is on screen.
        const refused = refusedWrites(BUSY)
        await page.route(isRecordUrl(idA), refused.handler)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page.getByTestId('customer-save-error-summary')).toContainText(BUSY)
        await expect(notesInput).toHaveValue(note)
        await page.unrouteAll({ behavior: 'wait' })

        // A save in flight turns the guard off: Back leaves with no question.
        const held = await holdRecordWrite(page, idA, 'PATCH')
        await watchForNotFoundAndDiscard(page)
        await page.keyboard.press('ControlOrMeta+s')
        await held.arrived
        await back.click()
        await expect(page).toHaveURL(LIST_URL)
        expect((await seenNotFoundOrDiscard(page)).discard).toBe(false)
        await held.release()

        // The save that was in flight when the page closed wrote both the Details and the
        // note.
        await openCustomer(page, nameA)
        await expect(field(page, 'phone')).toHaveValue(newPhone)
        await notesTab.click()
        await expect(notesInput).toHaveValue(note)
        await detailsTab.click()

        // Cancel, Discard puts the stored value back and hides the bar.
        await field(page, 'phone').fill(phone)
        await page.getByTestId('customer-cancel').click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expect(saveBar).toBeHidden()
        await expect(field(page, 'phone')).toHaveValue(newPhone)

        // A field refusal from another tab selects the tab that holds the field.
        await field(page, 'display_name').fill(nameB)
        await notesTab.click()
        await page.keyboard.press('ControlOrMeta+s')
        await expect(detailsTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('form-field-display_name')).toContainText(
            `A customer named “${nameB}” already exists here.`
        )
    })

    test('shows the header, opens the parent, and runs the More menu', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const title = page.getByTestId('customer-title')
        const badge = page.getByTestId('customer-inactive-badge')
        const addSub = page.getByTestId('customer-more-add-sub')
        const prefix = uniqueName('Header')
        const nameP = `${prefix} P`
        const nameS = `${prefix} S`
        const company = `${prefix} Holdings`
        const digits = stampDigits()

        // Parent P: email, mobile (no phone), its own company and a two-line address.
        await openNewCustomer(page)
        await field(page, 'display_name').fill(nameP)
        await field(page, 'company').fill(company)
        await field(page, 'email').fill(`p.${digits}@example.com`)
        await field(page, 'mobile').fill(`(555) 014-${digits}`)
        await page.getByTestId('form-input-billing_address-line1').fill('12 Harbor Way')
        await page.getByTestId('form-input-billing_address-city').fill('Portland')
        await page.getByTestId('form-input-billing_address-region').fill('OR')
        await page.getByTestId('form-input-billing_address-postal_code').fill('97210')
        await page.getByTestId('customer-save').click()
        await expect(page).toHaveURL(customerPageUrl)
        await expect(title).toHaveText(nameP)
        const idP = openCustomerId(page)

        // Add sub-customer from P's More menu; Save opens S's page.
        await chooseMore(page, 'customer-more-add-sub')
        await expect(page).toHaveURL(new RegExp(`/books/customers/new\\?parent=${idP}$`))
        await expect(title).toHaveText('New sub-customer')
        await field(page, 'display_name').fill(nameS)
        await page.getByTestId('customer-save').click()
        await expect(page).toHaveURL(customerPageUrl)
        await expect(title).toHaveText(nameS)
        const idS = openCustomerId(page)

        // S: the parent link, no contact actions, no company, no Add sub-customer.
        const parentLink = page.getByTestId('customer-parent-link')
        await expect(parentLink).toHaveText(`Sub-customer of ${nameP}`)
        await expect(page.getByTestId('customer-email-action')).toHaveCount(0)
        await expect(page.getByTestId('customer-call-action')).toHaveCount(0)
        await expect(page.getByTestId('customer-company')).toHaveCount(0)
        await openMore(page)
        await expect(addSub).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('customer-more-inactive')).toHaveCount(0)

        // The parent link replaces S with P's page.
        await parentLink.click()
        await expect(page).toHaveURL(customerPath(idP))
        await expect(title).toHaveText(nameP)
        await page.goBack()
        await expect(page).not.toHaveURL(customerPath(idS))

        // P: Email, Call (from the mobile), the company and the address lines.
        await openCustomer(page, nameP)
        await expect(page.getByTestId('customer-email-action')).toBeVisible()
        await expect(page.getByTestId('customer-call-action')).toBeVisible()
        await expect(page.getByTestId('customer-company')).toHaveText(company)
        const address = page.getByTestId('customer-address')
        await expect(address).toContainText('12 Harbor Way')
        await expect(address).toContainText('Portland, OR 97210')

        // S: Make inactive from the phone's More sheet, and a tab pressed on the phone's
        // strip; then, back at the desktop width, Make active and Delete.
        await openCustomer(page, nameS)
        await page.setViewportSize(PHONE)
        await chooseMore(page, 'customer-more-inactive')
        await expect(badge).toBeVisible()
        await expect(badge).toHaveText('Inactive')
        const phoneNotesTab = page.getByTestId('customer-tab-notes')
        await phoneNotesTab.click()
        await expect(phoneNotesTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('customer-notes-input')).toBeVisible()
        await page.setViewportSize(DESKTOP)

        // An inactive customer takes no new transaction: the button is disabled with the
        // reason under it, and ⌥N opens no menu.
        const newTransaction = page.getByTestId('customer-new-transaction')
        const newTransactionHint = page.getByTestId('customer-new-transaction-hint')
        const newInvoice = page.getByTestId('customer-new-invoice')
        await expect.poll(() => isDisabled(newTransaction)).toBe(true)
        await expect(newTransactionHint).toHaveText(
            'Make this customer active to add transactions.'
        )
        await title.click()
        await page.keyboard.press('Alt+n')
        await settle(page)
        await expect(newInvoice).toHaveCount(0)

        await openMore(page)
        await expect(page.getByTestId('customer-more-inactive')).toHaveText('Make active')
        await page.getByTestId('customer-more-inactive').click()
        await expect(badge).toHaveCount(0)

        // Active again: the button is enabled and ⌥N opens the menu.
        await expect.poll(() => isDisabled(newTransaction)).toBe(false)
        await expect(newTransactionHint).toHaveCount(0)
        await title.click()
        await page.keyboard.press('Alt+n')
        await expect(newInvoice).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(newInvoice).toHaveCount(0)
        await chooseMore(page, 'customer-more-delete')
        await page.getByTestId('delete-customer-confirm').click()
        await expect(page).toHaveURL(LIST_URL)
        await searchCustomers(page, nameS)
        await expect(customerEntry(page, nameS)).toHaveCount(0)

        // P, with no active sub-customer now, can be made inactive; then it offers no
        // Add sub-customer.
        await openCustomer(page, nameP)
        await chooseMore(page, 'customer-more-inactive')
        await expect(badge).toBeVisible()
        await openMore(page)
        await expect(addSub).toHaveCount(0)
    })
})
