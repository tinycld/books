import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    createCustomer,
    customerEntries,
    customerEntry,
    customerIdOf,
    customerSurface,
    DESKTOP,
    discardDialog,
    field,
    holdRecordWrite,
    isDisabled,
    openCustomersList,
    PHONE,
    searchCustomers,
    uniqueName,
} from './customer-form-helpers'

// The row menu (Edit, Add sub-customer, Make inactive or Make active, Delete) on rows and
// cards, Make inactive refused while a sub-customer is active, the Delete customer dialog
// and its sub-customer rules, a delete the server refuses, and a customer deleted in
// another tab while its form is open and dirty. On desktop, the open button takes Enter,
// Space and Tab; offline, a write fails at once and leaves the list usable. Every customer
// here is created through the form with a unique name; no seeded customer is edited, made
// inactive or deleted.
//
// Not covered here: a read-only user (no row menu) cannot be driven, because the seed has
// no read-only Books member; `customerMenuItems` in tests/customer-actions.test.ts covers
// that rule. A refusal for a customer used on a transaction does not exist yet (later
// units add it), so step (7) answers the DELETE with a 400 through `page.route`, which
// writes nothing. A failed sub-customer check cannot be made to happen on a live server,
// so step (8) answers that one load with a 400 through `page.route`.

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const MENU_ITEMS = ['edit', 'add-sub', 'toggle-inactive', 'delete'] as const
type MenuItem = (typeof MENU_ITEMS)[number]

const REFUSAL = 'This customer is used on an invoice.'
const ACTIVE_SUB_REFUSAL = 'This customer has 1 active sub-customer.'
const CANNOT_UNDO = 'This cannot be undone.'
const NOT_FOUND = "This customer doesn't exist or was removed"
const CUSTOMER_RECORDS = '**/api/collections/books_customers/records**'

function recordUrl(id: string) {
    return `**/api/collections/books_customers/records/${id}`
}

// The button that opens a customer from its row or card. Its accessible name carries the
// display name; the row menu ("Customer actions") is a separate button beside it.
function openButton(page: Page, name: string) {
    return page.getByTestId('customers-list').getByRole('button', { name })
}

// Answers the has-sub-customers load for one customer (filtered on `parent = id`) with a
// 400; every other request passes. Returns the route's handler, to remove it.
async function failSubCustomerCheck(page: Page, id: string) {
    const handler = async (route: Route) => {
        const filter = new URL(route.request().url()).searchParams.get('filter') ?? ''
        if (!filter.replace(/\s/g, '').includes(`parent="${id}"`)) return route.continue()
        return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 400, message: 'Check failed.', data: {} }),
        })
    }
    await page.route(CUSTOMER_RECORDS, handler)
    return handler
}

// Answers only the DELETE of the record with the server's 400; every other request passes.
async function refuseDelete(page: Page, id: string) {
    await page.route(recordUrl(id), route => {
        if (route.request().method() !== 'DELETE') return route.continue()
        return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 400, message: REFUSAL, data: {} }),
        })
    })
}

function menuItem(page: Page, item: MenuItem) {
    return page.getByTestId(`customer-menu-${item}`)
}

async function openMenu(page: Page, id: string) {
    await page.getByTestId(`customer-menu-${id}`).click()
    await expect(menuItem(page, 'edit')).toBeVisible()
}

async function closeMenu(page: Page) {
    await page.keyboard.press('Escape')
    await expect(menuItem(page, 'edit')).toHaveCount(0)
}

async function chooseFromMenu(page: Page, id: string, item: MenuItem) {
    await openMenu(page, id)
    await menuItem(page, item).click()
}

function deleteDialog(page: Page) {
    const root = page.getByTestId('delete-customer-dialog')
    return {
        root,
        // A phone shows the dialog as a sheet with no dialog role; its title is text.
        title: page.getByText('Delete customer', { exact: true }),
        body: page.getByTestId('delete-customer-dialog-body'),
        confirm: page.getByTestId('delete-customer-confirm'),
        makeInactive: page.getByTestId('delete-customer-make-inactive'),
        close: page.getByTestId('delete-customer-close'),
    }
}

async function openDeleteDialog(page: Page, id: string) {
    await chooseFromMenu(page, id, 'delete')
    const dialog = deleteDialog(page)
    await expect(dialog.root).toBeVisible()
    await expect(dialog.title).toBeVisible()
    return dialog
}

async function textLeft(entry: Locator, name: string) {
    return (await entry.getByText(name, { exact: true }).boundingBox())?.x ?? 0
}

async function expectListShown(page: Page) {
    await expect(page.getByTestId('customers-list')).toBeVisible()
    await expect(customerSurface(page)).toBeHidden()
    await expect(page).toHaveURL(/\/books\/customers$/)
}

// The open button takes Enter and Space on web: the customer opens, then Back returns to
// the list with the search kept or typed again.
async function openWithKey(page: Page, open: Locator, id: string, name: string, key: string) {
    await open.focus()
    await expect(open).toBeFocused()
    await page.keyboard.press(key)
    await expect(customerSurface(page)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/books/customers/${id}$`))
    await expect(field(page, 'display_name')).toHaveValue(name)
    await page.getByTestId('customer-back').click()
    await expectListShown(page)
    await searchCustomers(page, name)
}

function inactiveLabel(entry: Locator) {
    return entry.getByText('Inactive', { exact: true })
}

test.describe('customer-form: inactive and delete', () => {
    for (const [sizeName, size] of SIZES) {
        test(`makes customers inactive and deletes them (${sizeName})`, async ({ page }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            await page.setViewportSize(size)
            const title = page.getByTestId('customer-title')
            const parentPicker = page.getByTestId('customer-parent')
            const banner = page.getByTestId('customers-banner')
            const discard = discardDialog(page)
            const prefix = uniqueName(page, 'Actions')
            const parentName = `${prefix} parent`
            const subName = `${prefix} sub`

            // (1) A parent, then its sub-customer from the parent's row menu.
            await openCustomersList(page)
            await createCustomer(page, { name: parentName })
            await searchCustomers(page, prefix)
            const parentId = await customerIdOf(page, parentName)
            // The row (or card) opens through a button named for the customer; the menu is
            // its own "Customer actions" button beside it, not nested inside it.
            const parentOpen = openButton(page, parentName)
            const parentMenu = page.getByTestId(`customer-menu-${parentId}`)
            await expect(parentOpen).toHaveCount(1)
            await expect(parentMenu).toHaveRole('button')
            await expect(parentMenu).toHaveAccessibleName('Customer actions')
            await expect(parentOpen.getByTestId(`customer-menu-${parentId}`)).toHaveCount(0)
            await expect(parentOpen.getByRole('button', { name: 'Customer actions' })).toHaveCount(
                0
            )
            // Keyboard on web: Enter and Space open the customer, and Tab goes from the open
            // button to that row's menu button. The phone has no keyboard path.
            if (sizeName === 'desktop') {
                await openWithKey(page, parentOpen, parentId, parentName, 'Enter')
                await openWithKey(page, parentOpen, parentId, parentName, ' ')
                await parentOpen.focus()
                await page.keyboard.press('Tab')
                await expect(parentMenu).toBeFocused()
            }
            await openMenu(page, parentId)
            await expect(menuItem(page, 'edit')).toHaveText('Edit')
            await expect(menuItem(page, 'add-sub')).toHaveText('Add sub-customer')
            await expect(menuItem(page, 'toggle-inactive')).toHaveText('Make inactive')
            await expect(menuItem(page, 'delete')).toHaveText('Delete')
            // The menu press did not also open the row.
            await expectListShown(page)

            await menuItem(page, 'add-sub').click()
            await expect(customerSurface(page)).toBeVisible()
            const newSubUrl = new RegExp(`/books/customers/new\\?parent=${parentId}$`)
            await expect(page).toHaveURL(newSubUrl)
            await expect(title).toHaveText('New sub-customer')
            await expect(parentPicker).toContainText(parentName)
            await field(page, 'display_name').fill(subName)
            await page.getByTestId('customer-save-new').click()
            await expect(field(page, 'display_name')).toHaveValue('')
            await expect(page).toHaveURL(newSubUrl)
            await expect(title).toHaveText('New sub-customer')
            await expect(parentPicker).toContainText(parentName)
            // The reset form is clean, so Cancel leaves without a question.
            await page.getByTestId('customer-cancel').click()
            await expect(discard.title).toBeHidden()
            await expectListShown(page)

            await searchCustomers(page, prefix)
            const entries = customerEntries(page)
            await expect(entries).toHaveCount(2)
            await expect(entries.nth(0).getByText(parentName, { exact: true })).toBeVisible()
            await expect(entries.nth(1).getByText(subName, { exact: true })).toBeVisible()
            const parentEntry = customerEntry(page, parentName)
            const subEntry = customerEntry(page, subName)
            await expect
                .poll(
                    async () =>
                        (await textLeft(subEntry, subName)) -
                        (await textLeft(parentEntry, parentName))
                )
                .toBeGreaterThan(8)
            const subId = await customerIdOf(page, subName)

            // (2) A sub-customer's menu has no Add sub-customer.
            await openMenu(page, subId)
            await expect(menuItem(page, 'edit')).toHaveText('Edit')
            await expect(menuItem(page, 'toggle-inactive')).toHaveText('Make inactive')
            await expect(menuItem(page, 'delete')).toHaveText('Delete')
            await expect(menuItem(page, 'add-sub')).toHaveCount(0)
            await closeMenu(page)
            await expectListShown(page)

            // (3) Make inactive is refused while a sub-customer is active; the banner says why.
            await chooseFromMenu(page, parentId, 'toggle-inactive')
            await expect(banner).toContainText(ACTIVE_SUB_REFUSAL)
            await expect(parentEntry).toBeVisible()
            await expect(inactiveLabel(parentEntry)).toHaveCount(0)
            // The refusal stays with the parent: the sub-customer's Delete dialog does not
            // show it, and the banner shows it again once that dialog closes. The plain
            // Delete state says what a delete does.
            let dialog = await openDeleteDialog(page, subId)
            await expect(dialog.confirm).toHaveText('Delete')
            await expect(dialog.body).toContainText(CANNOT_UNDO)
            await expect(dialog.body).not.toContainText(ACTIVE_SUB_REFUSAL)
            await dialog.close.click()
            await expect(dialog.root).toBeHidden()
            await expect(banner).toContainText(ACTIVE_SUB_REFUSAL)
            await page.getByTestId('customers-banner-dismiss').click()
            await expect(banner).toHaveCount(0)

            // (4) Delete of a parent with an active sub-customer offers only Close.
            dialog = await openDeleteDialog(page, parentId)
            await expect(dialog.body).toContainText('This customer has sub-customers')
            await expect(dialog.body).toContainText('Make its sub-customers inactive first')
            await expect(dialog.close).toBeVisible()
            await expect(dialog.confirm).toHaveCount(0)
            await expect(dialog.makeInactive).toHaveCount(0)
            // Escape closes the dialog only. The click moves focus off any input first.
            await dialog.body.click()
            await page.keyboard.press('Escape')
            await expect(dialog.root).toBeHidden()
            await expectListShown(page)
            await expect(parentEntry).toBeVisible()
            dialog = await openDeleteDialog(page, parentId)
            await dialog.close.click()
            await expect(dialog.root).toBeHidden()
            await expectListShown(page)

            // (5) With every sub-customer inactive, the dialog offers Make inactive instead.
            // While the sub-customer's write is in flight, no other row's Make inactive or
            // Delete can start.
            const subPatch = await holdRecordWrite(page, subId, 'PATCH')
            await chooseFromMenu(page, subId, 'toggle-inactive')
            await subPatch.arrived
            await openMenu(page, parentId)
            await expect.poll(() => isDisabled(menuItem(page, 'toggle-inactive'))).toBe(true)
            await expect.poll(() => isDisabled(menuItem(page, 'delete'))).toBe(true)
            await closeMenu(page)
            await subPatch.release()
            await expect(subEntry).toHaveCount(0)
            dialog = await openDeleteDialog(page, parentId)
            await expect(dialog.body).toContainText('This customer has sub-customers')
            await expect(dialog.body).not.toContainText('Make its sub-customers inactive first')
            await expect(dialog.makeInactive).toHaveText('Make inactive')
            await expect(dialog.confirm).toHaveCount(0)
            await dialog.makeInactive.click()
            await expect(dialog.root).toBeHidden()
            await expect(parentEntry).toHaveCount(0)

            // (6) Show inactive brings both back, labelled; Make active clears the label.
            const showInactive = page.getByTestId('customers-show-inactive')
            await showInactive.click()
            await expect(showInactive).toHaveAttribute('aria-checked', 'true')
            await expect(inactiveLabel(parentEntry)).toBeVisible()
            await expect(inactiveLabel(subEntry)).toBeVisible()
            await openMenu(page, parentId)
            await expect(menuItem(page, 'toggle-inactive')).toHaveText('Make active')
            await menuItem(page, 'toggle-inactive').click()
            await expect(inactiveLabel(parentEntry)).toHaveCount(0)
            await expect(parentEntry).toBeVisible()
            await expect(inactiveLabel(subEntry)).toBeVisible()

            // Offline behavior does not depend on the viewport; desktop only keeps the phone
            // run well inside the test timeout.
            if (sizeName === 'desktop') {
                // (6b) Offline, a write from the menu fails at once instead of pausing: the banner
                // says why (a refusal, with Dismiss), and the write items are enabled again.
                await page.context().setOffline(true)
                await chooseFromMenu(page, parentId, 'toggle-inactive')
                await expect(banner).toBeVisible()
                await expect(banner).toContainText(
                    "Your change wasn't saved: the server could not be reached."
                )
                await expect(banner).not.toContainText(ACTIVE_SUB_REFUSAL)
                await expect(page.getByTestId('customers-banner-dismiss')).toBeVisible()
                await expect(inactiveLabel(parentEntry)).toHaveCount(0)
                await openMenu(page, parentId)
                await expect(menuItem(page, 'toggle-inactive')).toHaveText('Make inactive')
                await expect.poll(() => isDisabled(menuItem(page, 'toggle-inactive'))).toBe(false)
                await expect.poll(() => isDisabled(menuItem(page, 'delete'))).toBe(false)
                await closeMenu(page)
                await page.getByTestId('customers-banner-dismiss').click()
                await expect(banner).toHaveCount(0)
                // The sub-customer check needs the server, so the dialog opens online. Offline,
                // the dialog's Delete is disabled with the reason (core's offline gate), and Cancel
                // still closes the dialog.
                await page.context().setOffline(false)
                dialog = await openDeleteDialog(page, subId)
                await expect(dialog.confirm).toHaveText('Delete')
                await page.context().setOffline(true)
                await expect(dialog.root).toContainText("You're offline")
                await expect.poll(() => isDisabled(dialog.confirm)).toBe(true)
                await expect.poll(() => isDisabled(dialog.close)).toBe(false)
                await dialog.close.click()
                await expect(dialog.root).toBeHidden()
                await expect(subEntry).toBeVisible()
                await page.context().setOffline(false)
            }

            // (7) A customer with no sub-customers: a refused delete keeps it, then it goes.
            dialog = await openDeleteDialog(page, subId)
            await expect(dialog.confirm).toHaveText('Delete')
            await expect(dialog.body).toContainText(CANNOT_UNDO)
            await expect(dialog.makeInactive).toHaveCount(0)
            await refuseDelete(page, subId)
            await dialog.confirm.click()
            await expect(dialog.body).toContainText(REFUSAL)
            await expect(dialog.root).toBeVisible()
            await expect(subEntry).toBeVisible()
            await page.unroute(recordUrl(subId))
            await dialog.confirm.click()
            await expect(dialog.root).toBeHidden()
            await expect(subEntry).toHaveCount(0)

            dialog = await openDeleteDialog(page, parentId)
            await expect(dialog.body).not.toContainText('This customer has sub-customers')
            await dialog.confirm.click()
            await expect(dialog.root).toBeHidden()
            await expect(parentEntry).toHaveCount(0)
            await expect(page.getByTestId('customers-no-match')).toBeVisible()

            // (8) The open, dirty customer is deleted in another tab: the not-found message
            // replaces the form and no Discard changes? question appears.
            const openName = `${prefix} open`
            await createCustomer(page, { name: openName })
            await searchCustomers(page, openName)
            await openButton(page, openName).click()
            await expect(customerSurface(page)).toBeVisible()
            await expect(field(page, 'display_name')).toHaveValue(openName)
            await field(page, 'notes').fill(`${prefix} typed notes`)

            const other = await page.context().newPage()
            await login(other)
            await navigateToPackage(other, 'books')
            await other.setViewportSize(size)
            await openCustomersList(other)
            await searchCustomers(other, openName)
            const openId = await customerIdOf(other, openName)
            const otherDialog = deleteDialog(other)
            // A sub-customer check that fails offers neither Delete nor Make inactive.
            const failedCheck = await failSubCustomerCheck(other, openId)
            await other.getByTestId(`customer-menu-${openId}`).click()
            await other.getByTestId('customer-menu-delete').click()
            await expect(otherDialog.root).toBeVisible()
            await expect(otherDialog.body).toContainText(/could not|couldn't|failed|try again/i)
            await expect(otherDialog.close).toBeVisible()
            await expect(otherDialog.confirm).toHaveCount(0)
            await expect(otherDialog.makeInactive).toHaveCount(0)
            await otherDialog.close.click()
            await expect(otherDialog.root).toBeHidden()
            await other.unroute(CUSTOMER_RECORDS, failedCheck)

            await other.getByTestId(`customer-menu-${openId}`).click()
            await other.getByTestId('customer-menu-delete').click()
            await expect(otherDialog.root).toBeVisible()
            await otherDialog.confirm.click()
            await expect(otherDialog.root).toBeHidden()
            await expect(customerEntry(other, openName)).toHaveCount(0)
            await other.close()

            const notFound = page.getByTestId('customer-not-found')
            await expect(notFound).toContainText(NOT_FOUND)
            await expect(discard.title).toBeHidden()
            await page.getByTestId('customer-not-found-back').click()
            await expect(discard.title).toBeHidden()
            await expect(notFound).toBeHidden()
            await expect(page.getByTestId('customers-list')).toBeVisible()
        })
    }
})
