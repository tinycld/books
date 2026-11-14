import { expect, type Locator, type Page, test } from '@playwright/test'
import {
    createCustomer,
    customerEntry,
    customerPageUrl,
    customerPath,
    DESKTOP,
    holdLoads,
    openBooks,
    openCustomersList,
    PHONE,
    searchCustomers,
    uniqueName,
} from './customer-form-helpers'

// The customer page's Contacts tab (customer-pages checkpoint 5, spec §3.6): adding,
// editing, making primary and deleting the people at a customer, from the keyboard on a
// wide window and with cards and a sheet menu on a phone, and the tab's loading, failed and
// empty states. Every test creates its own customers and contacts with unique names; no
// seeded row is read or changed.
//
// Not covered here: a read-only user (no Add contact, no row menu) cannot be driven,
// because the e2e seed has no read-only Books member; the reader rules are pinned by the
// `customerPageControls` unit test and the `canWrite` flag. The contact dialog's "This
// contact was removed" state needs a second session deleting the row while the dialog is
// open. The `mailto:` / `tel:` targets leave the page (Linking); this spec checks only that
// Email and Phone are links that show the stored values.
//
// The phone test calls `page.reload()` once, on the Customers list, before it holds the
// contacts read. The contacts it created through the dialog are already in the store, and
// pbtsdb serves a query whose rows are in the store with no request, so `holdLoads` would
// catch nothing; no UI path adds a contact without opening the tab that loads them. The
// reload empties the store so the next read goes out. It is not a pattern for in-app
// navigation: every move between screens here goes through the UI.

const CONTACTS_URL = '**/api/collections/books_party_contacts/records**'
const ROW_ID = /^customer-contact-([a-z0-9]{15})$/

type ContactValues = { name: string; role?: string; email?: string; phone?: string }

// The id of the customer whose page is open, read from the URL.
function openCustomerId(page: Page) {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

function isFocused(locator: Locator) {
    return locator.evaluate(el => el === document.activeElement)
}

// Presses Tab until `target` holds the focus (at most `max` presses); no click.
async function tabTo(page: Page, target: Locator, max = 30) {
    for (let presses = 0; presses < max && !(await isFocused(target)); presses++) {
        await page.keyboard.press('Tab')
    }
    await expect(target).toBeFocused()
}

function primarySwitch(page: Page) {
    return page.getByTestId('contact-primary').getByRole('switch')
}

// The ids of the tab's rows (table) or cards (phone), in screen order, in one snapshot.
function contactIds(page: Page) {
    return page
        .getByTestId('customer-contacts')
        .locator('[data-testid^="customer-contact-"]')
        .evaluateAll((els, pattern) => {
            const ids: string[] = []
            for (const el of els) {
                const match = new RegExp(pattern).exec(el.getAttribute('data-testid') ?? '')
                if (match?.[1] && !ids.includes(match[1])) ids.push(match[1])
            }
            return ids
        }, ROW_ID.source)
}

function contact(page: Page, id: string) {
    return page.getByTestId(`customer-contact-${id}`)
}

// Setup only (clicks allowed): adds one contact through the dialog from the open Contacts
// tab; returns the new contact's id.
async function addContact(page: Page, values: ContactValues & { primary?: boolean }) {
    const before = await contactIds(page)
    const add = page.getByTestId('customer-contacts-add')
    if (await add.isVisible()) await add.click()
    else await page.getByTestId('customer-contacts-empty-add').click()
    const dialog = page.getByTestId('contact-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('contact-name')).toBeFocused()
    await page.getByTestId('contact-name').fill(values.name)
    if (values.role !== undefined) await page.getByTestId('contact-role').fill(values.role)
    if (values.email !== undefined) await page.getByTestId('contact-email').fill(values.email)
    if (values.phone !== undefined) await page.getByTestId('contact-phone').fill(values.phone)
    if (values.primary) await primarySwitch(page).check()
    await page.getByTestId('contact-save').click()
    await expect(dialog).toBeHidden()
    let added = ''
    await expect
        .poll(async () => {
            added = (await contactIds(page)).find(id => !before.includes(id)) ?? ''
            return added
        })
        .not.toBe('')
    await expect(contact(page, added)).toContainText(values.name)
    return added
}

// From a focused row menu trigger: Enter opens it with Edit focused, Enter opens the
// dialog with the focus in Name.
async function editFromKeyboard(page: Page, id: string) {
    await tabTo(page, page.getByTestId(`customer-contact-menu-${id}`))
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('customer-contact-edit')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('contact-dialog')).toBeVisible()
    await expect(page.getByTestId('contact-name')).toBeFocused()
}

// The core ConfirmDialog "Delete contact" for `name`, confirmed with its own ⌘↵ key (its
// confirm button has no test id of its own in the brief).
async function confirmDelete(page: Page, name: string) {
    await expect(page.getByText('Delete contact', { exact: true })).toBeVisible()
    await expect(page.getByTestId('confirm-dialog-body')).toContainText(
        `Delete ${name} from this customer`
    )
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.getByText('Delete contact', { exact: true })).toBeHidden()
}

test.describe('customer-pages: contacts tab', () => {
    test('adds a contact from the keyboard only', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const name = uniqueName('Contacts add')
        const person = `${name} Person`
        const role = 'Controller'
        const email = 'controller@example.com'
        const phone = '(206) 555-0142'
        const dialog = page.getByTestId('contact-dialog')
        const nameInput = page.getByTestId('contact-name')
        await createCustomer(page, { name })

        // No click from here.
        await page.keyboard.press('Alt+2')
        await expect(page.getByTestId('customer-tab-contacts')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await expect(page.getByTestId('customer-contacts-empty')).toBeVisible()
        await tabTo(page, page.getByTestId('customer-contacts-empty-add'))
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await expect(nameInput).toBeFocused()

        // ⌘↵ with no name: refused, the dialog stays.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog.getByText('Enter a name', { exact: true })).toBeVisible()
        await expect(dialog).toBeVisible()

        await page.keyboard.type(person)
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('contact-role')).toBeFocused()
        await page.keyboard.type(role)
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('contact-email')).toBeFocused()
        await page.keyboard.type(email)
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('contact-phone')).toBeFocused()
        await page.keyboard.type(phone)
        await tabTo(page, primarySwitch(page), 3)
        await page.keyboard.press('Space')
        await expect(primarySwitch(page)).toBeChecked()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog).toBeHidden()

        await expect(page.getByTestId('customer-contacts-table')).toBeVisible()
        await expect.poll(async () => (await contactIds(page)).length).toBe(1)
        const [id] = await contactIds(page)
        const row = contact(page, id)
        await expect(row).toContainText(person)
        await expect(row).toContainText(role)
        await expect(page.getByTestId(`customer-contact-primary-${id}`)).toHaveText('Primary')
        const emailLink = page.getByTestId(`customer-contact-email-${id}`)
        await expect(emailLink).toHaveRole('link')
        await expect(emailLink).toHaveText(email)
        const phoneLink = page.getByTestId(`customer-contact-phone-${id}`)
        await expect(phoneLink).toHaveRole('link')
        await expect(phoneLink).toHaveText(phone)
    })

    test('edits a contact from the keyboard only, and Escape keeps the stored values', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const name = uniqueName('Contacts edit')
        const nameB = `${name} Bea`
        const nameA = `${name} Abe`
        const oldRole = 'Bookkeeper'
        const newRole = 'Accounts payable lead'
        const dialog = page.getByTestId('contact-dialog')
        await createCustomer(page, { name })
        await page.getByTestId('customer-tab-contacts').click()
        await expect(page.getByTestId('customer-contacts-empty')).toBeVisible()
        const idB = await addContact(page, { name: nameB, role: 'Owner', primary: true })
        const idA = await addContact(page, { name: nameA, role: oldRole })
        await expect.poll(() => contactIds(page)).toEqual([idB, idA])

        // No click from here.
        await editFromKeyboard(page, idA)
        await expect(page.getByTestId('contact-name')).toHaveValue(nameA)
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('contact-role')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(newRole)
        await tabTo(page, primarySwitch(page), 3)
        await page.keyboard.press('Space')
        await expect(primarySwitch(page)).toBeChecked()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog).toBeHidden()

        // A is primary, with its new role, and sorts first; B lost its badge.
        await expect(contact(page, idA)).toContainText(newRole)
        await expect(contact(page, idA)).not.toContainText(oldRole)
        await expect(page.getByTestId(`customer-contact-primary-${idA}`)).toHaveText('Primary')
        await expect(page.getByTestId(`customer-contact-primary-${idB}`)).toHaveCount(0)
        await expect.poll(() => contactIds(page)).toEqual([idA, idB])

        // Edit again, type in the role, Escape: the dialog closes and nothing is saved.
        await editFromKeyboard(page, idA)
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('contact-role')).toBeFocused()
        // Chromium selects a text input's value on Tab focus; End appends instead of replacing.
        await page.keyboard.press('End')
        await page.keyboard.type(' unsaved')
        await expect(page.getByTestId('contact-role')).toHaveValue(`${newRole} unsaved`)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(contact(page, idA)).toContainText(newRole)
        await expect(contact(page, idA)).not.toContainText('unsaved')

        // ⌥C, with no dialog open, offers Add contact; Escape leaves without a new contact.
        await page.keyboard.press('Alt+c')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText('Add contact', { exact: true })).toBeVisible()
        await expect(page.getByTestId('contact-name')).toBeFocused()
        await expect(page.getByTestId('contact-name')).toHaveValue('')
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect.poll(() => contactIds(page)).toEqual([idA, idB])
    })

    test('a phone shows cards, makes a contact primary, deletes, and shows the loading and failed states', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const prefix = uniqueName('Contacts phone')
        const name = `${prefix} A`
        const otherName = `${prefix} B`
        const first = `${prefix} First`
        const second = `${prefix} Second`
        const cards = page.getByTestId('customer-contacts-cards')
        const contactsTab = page.getByTestId('customer-tab-contacts')

        // The second customer's page opens on Transactions, so its contacts never load.
        await createCustomer(page, { name: otherName })
        await createCustomer(page, { name })
        const id = openCustomerId(page)
        await contactsTab.click()
        await expect(page.getByTestId('customer-contacts-empty')).toBeVisible()
        const firstId = await addContact(page, { name: first, primary: true })
        const secondId = await addContact(page, { name: second })

        // Back to the list. A reload empties the store, so the next contacts read goes out
        // and can be held (pbtsdb serves rows already in the store with no request).
        await openCustomersList(page)
        await page.reload()
        await expect(page.getByTestId('customers-list')).toBeVisible()
        await page.setViewportSize(PHONE)

        // Loading while held, then the cards, primary first.
        const contacts = await holdLoads(page, CONTACTS_URL)
        await searchCustomers(page, name)
        await customerEntry(page, name).click()
        await expect(page).toHaveURL(customerPath(id))
        await contactsTab.click()
        await expect.poll(() => contacts.held.length).toBeGreaterThan(0)
        await expect(page.getByTestId('customer-contacts-loading')).toBeVisible()
        await contacts.release()
        await expect(cards).toBeVisible()
        await expect.poll(() => contactIds(page)).toEqual([firstId, secondId])
        await expect(page.getByTestId(`customer-contact-primary-${firstId}`)).toHaveText('Primary')

        // Make the second primary from its card's menu: it moves first with the badge.
        await page.getByTestId(`customer-contact-menu-${secondId}`).click()
        await page.getByTestId('customer-contact-primary').click()
        await expect.poll(() => contactIds(page)).toEqual([secondId, firstId])
        await expect(page.getByTestId(`customer-contact-primary-${secondId}`)).toHaveText('Primary')
        await expect(page.getByTestId(`customer-contact-primary-${firstId}`)).toHaveCount(0)

        // Delete both; the empty state follows the last.
        await page.getByTestId(`customer-contact-menu-${secondId}`).click()
        await page.getByTestId('customer-contact-delete').click()
        await confirmDelete(page, second)
        await expect(contact(page, secondId)).toHaveCount(0)
        await expect.poll(() => contactIds(page)).toEqual([firstId])
        await page.getByTestId(`customer-contact-menu-${firstId}`).click()
        await page.getByTestId('customer-contact-delete').click()
        await confirmDelete(page, first)
        await expect(page.getByTestId('customer-contacts-empty')).toContainText('No contacts yet')

        // A refused first read of another customer's contacts: the banner, then Retry.
        await openCustomersList(page)
        await page.route(CONTACTS_URL, route =>
            route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: 'Something went wrong.', data: {} }),
            })
        )
        const refused = page.waitForResponse(
            r =>
                r.url().includes('/api/collections/books_party_contacts/records') &&
                r.status() === 400
        )
        await searchCustomers(page, otherName)
        await customerEntry(page, otherName).click()
        await expect(page).toHaveURL(customerPageUrl)
        await expect(page.getByTestId('customer-title')).toHaveText(otherName)
        await contactsTab.click()
        await refused
        await expect(page.getByTestId('customer-contacts-banner')).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('customer-contacts-retry').click()
        await expect(page.getByTestId('customer-contacts-empty')).toBeVisible()
        await expect(page.getByTestId('customer-contacts-banner')).toHaveCount(0)
    })
})
