import { expect, type Locator, type Page, test } from '@playwright/test'
import {
    createVendor,
    DESKTOP,
    field,
    insertAnswered,
    isFocused,
    openBooks,
    openNewVendor,
    openVendor,
    openVendorsList,
    PHONE,
    searchVendors,
    type TabKey,
    tabTo,
    uniqueName,
    vendorEntry,
} from './vendor-form-helpers'

// The vendor page's Contacts tab (vendor-pages checkpoint 3, spec §3.6): adding, editing,
// making primary and deleting the people at a vendor from the keyboard, the table on the
// record surface with no sideways scroll and the cards on a phone, and one failed read of
// the vendor's contacts. Every test creates its own vendors and contacts with unique names;
// no seeded row is read or changed.
//
// Not covered here: a read-only user (no Add contact, no row menu) cannot be driven,
// because the e2e seed has no read-only Books member; the reader rules are pinned by the
// `vendorPageControls` unit test and the `canWrite` flag of the shared part. The contacts
// loading state and the dialog's removed-contact state are the shared part's, covered by
// customer-pages-contacts.spec.ts. The `mailto:` / `tel:` targets leave the page (Linking).

const CONTACTS_URL = '**/api/collections/books_party_contacts/records**'
const ROW_ID = /^vendor-contact-([a-z0-9]{15})$/
// The window at which the vendor page sits beside the names column (the record surface).
const RECORD_SURFACE = { width: 1360, height: 900 }

// How far a table's own scroller reaches past its box; above 0 it scrolls sideways.
function sideOverflow(scroller: Locator) {
    return scroller.evaluate(el => el.scrollWidth - el.clientWidth)
}

function primarySwitch(page: Page) {
    return page.getByTestId('contact-primary').getByRole('switch')
}

// The ids of the tab's rows (table) or cards (phone), in screen order, in one snapshot.
function contactIds(page: Page) {
    return page
        .getByTestId('vendor-contacts')
        .locator('[data-testid^="vendor-contact-"]')
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
    return page.getByTestId(`vendor-contact-${id}`)
}

// From the Add contact button (or the empty-state button), a few Tab stops away at most:
// Enter, then the dialog filled from the keyboard and saved with ⌘↵. Returns the new
// contact's id.
async function addFromKeyboard(
    page: Page,
    add: Locator,
    values: { name: string; role: string; email: string; phone: string }
) {
    const before = await contactIds(page)
    const dialog = page.getByTestId('contact-dialog')
    await tabTo(page, add)
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('contact-name')).toBeFocused()
    await page.keyboard.type(values.name)
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('contact-role')).toBeFocused()
    await page.keyboard.type(values.role)
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('contact-email')).toBeFocused()
    await page.keyboard.type(values.email)
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('contact-phone')).toBeFocused()
    await page.keyboard.type(values.phone)
    await tabTo(page, primarySwitch(page), 3)
    await page.keyboard.press('Space')
    await expect(primarySwitch(page)).toBeChecked()
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(dialog).toBeHidden()
    let added = ''
    await expect
        .poll(async () => {
            added = (await contactIds(page)).find(id => !before.includes(id)) ?? ''
            return added
        })
        .not.toBe('')
    return added
}

// Moves the focus to the row's menu trigger with `key` (Shift+Tab for a row above the
// focus), then Enter opens the menu and the arrow keys reach `item`.
async function rowMenuItem(page: Page, id: string, item: string, key: TabKey = 'Tab') {
    await tabTo(page, page.getByTestId(`vendor-contact-menu-${id}`), 20, key)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('vendor-contact-edit')).toBeFocused()
    const target = page.getByTestId(item)
    for (let presses = 0; presses < 4 && !(await isFocused(target)); presses++) {
        await page.keyboard.press('ArrowDown')
    }
    await expect(target).toBeFocused()
    await page.keyboard.press('Enter')
}

test.describe('vendor-pages: vendor contacts', () => {
    test('adds, edits, makes primary and deletes a contact from the keyboard, and shows cards on a phone', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const prefix = uniqueName('Vendor contacts')
        const name = `${prefix} A`
        const unopened = `${prefix} B`
        const first = {
            name: `${prefix} First`,
            role: 'Bookkeeper',
            email: 'first@example.com',
            phone: '(206) 555-0151',
        }
        const second = {
            name: `${prefix} Second`,
            role: 'Owner',
            email: 'second@example.com',
            phone: '(206) 555-0152',
        }
        const newRole = 'Accounts receivable lead'
        const dialog = page.getByTestId('contact-dialog')
        const contactsTab = page.getByTestId('vendor-tab-contacts')

        // A second vendor saved with Save and new: its page never opened, so its contacts
        // were never read.
        await openNewVendor(page)
        await field(page, 'display_name').fill(unopened)
        const inserted = insertAnswered(page)
        await page.getByTestId('vendor-save-new').click()
        expect((await inserted).ok()).toBe(true)
        await expect(page.getByTestId('vendor-title')).toHaveText('New vendor')

        await createVendor(page, { name })
        await openVendor(page, name)

        // No click from here.
        await page.keyboard.press('Alt+2')
        await expect(contactsTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('vendor-contacts-empty')).toContainText('No contacts yet')
        const emptyAdd = page.getByTestId('vendor-contacts-empty-add')
        await expect(emptyAdd).toBeVisible()

        // ⌘↵ with no name: refused, the dialog stays.
        await tabTo(page, emptyAdd)
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('contact-name')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog.getByText('Enter a name', { exact: true })).toBeVisible()
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        // The dialog hands the focus back to its opener one frame after it closes; the next
        // Tab walk starts from there.
        await expect(emptyAdd).toBeFocused()

        const firstId = await addFromKeyboard(page, emptyAdd, first)
        // The empty state and its button are gone: the focus returns to the header's Add
        // contact, not to the document start.
        const add = page.getByTestId('vendor-contacts-add')
        await expect(add).toBeFocused()
        const firstRow = contact(page, firstId)
        await expect(firstRow).toContainText(first.name)
        await expect(firstRow).toContainText(first.role)
        await expect(page.getByTestId(`vendor-contact-email-${firstId}`)).toHaveText(first.email)
        await expect(page.getByTestId(`vendor-contact-phone-${firstId}`)).toHaveText(first.phone)
        await expect(page.getByTestId(`vendor-contact-primary-${firstId}`)).toHaveText('Primary')

        // A second primary: the server clears the first's mark, and the second sorts first.
        const secondId = await addFromKeyboard(page, add, second)
        // The dialog hands the focus back to Add contact; the Tab walk to the row menu
        // starts from there.
        await expect(add).toBeFocused()
        await expect(page.getByTestId(`vendor-contact-primary-${secondId}`)).toHaveText('Primary')
        await expect(page.getByTestId(`vendor-contact-primary-${firstId}`)).toHaveCount(0)
        await expect.poll(() => contactIds(page)).toEqual([secondId, firstId])

        // Edit the first contact's role from its row menu.
        await rowMenuItem(page, firstId, 'vendor-contact-edit')
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('contact-name')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('contact-role')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type(newRole)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog).toBeHidden()
        // The menu row put the focus on its trigger before it opened the dialog, so the
        // dialog hands it back there.
        await expect(page.getByTestId(`vendor-contact-menu-${firstId}`)).toBeFocused()
        await expect(firstRow).toContainText(newRole)
        await expect(firstRow).not.toContainText(first.role)

        // Delete the second contact: the question names it and this vendor. Its row is above
        // the edited row, which holds the focus, so Shift+Tab reaches its menu.
        await rowMenuItem(page, secondId, 'vendor-contact-delete', 'Shift+Tab')
        await expect(page.getByTestId('confirm-dialog-body')).toContainText(
            `Delete ${second.name} from this vendor's contacts?`
        )
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(contact(page, secondId)).toHaveCount(0)
        await expect.poll(() => contactIds(page)).toEqual([firstId])

        // On the record surface the table fits with no sideways scroll; a phone draws cards.
        const table = page.getByTestId('vendor-contacts-table')
        await page.setViewportSize(RECORD_SURFACE)
        await expect(table).toBeVisible()
        await expect(firstRow).toContainText(first.name)
        await expect.poll(() => sideOverflow(table)).toBeLessThanOrEqual(0)
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('vendor-contacts-cards')).toBeVisible()
        await expect(table).toBeHidden()
        await expect(contact(page, firstId)).toContainText(first.name)

        // A refused first read of the other vendor's contacts: the banner, then Retry.
        await page.setViewportSize(DESKTOP)
        await openVendorsList(page)
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
        await searchVendors(page, unopened)
        await vendorEntry(page, unopened).click()
        await expect(page.getByTestId('vendor-title')).toHaveText(unopened)
        await contactsTab.click()
        await refused
        await expect(page.getByTestId('vendor-contacts-banner')).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('vendor-contacts-retry').click()
        await expect(page.getByTestId('vendor-contacts-empty')).toBeVisible()
        await expect(page.getByTestId('vendor-contacts-banner')).toHaveCount(0)
    })
})
