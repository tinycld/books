import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    backgroundOf,
    createCustomer,
    customerEntry,
    customerHelpers,
    customerIdOf,
    DESKTOP,
    discardDialog,
    edges,
    field,
    holdRecordWrite,
    leftEdgeOf,
    listSpansContent,
    openCustomersList,
    panelPlacement,
    pressEscapeOutsideInputs,
    searchCustomers,
    seenNotFoundOrDiscard,
    settle,
    stacked,
    uniqueName,
    WIDE,
    watchForNotFoundAndDiscard,
} from './customer-form-helpers'

// The customer side panel: at a window of 1360 px or more a customer opens in a 480 px
// panel beside the list, and a resize moves the open customer between the panel and the
// page without losing anything. The open, dirty customer can be deleted from its row menu
// beside the panel. Every customer this spec opens for editing or deletes it creates
// with a unique name; it reads the seeded Old Mill Bakery and Northwind customers only.
// The delete refusal is a 400 answered through `page.route`, which writes nothing. The
// last step holds a delete through `page.route` while the user goes to the Lists hub.
//
// Not covered here: there is no 390 run, because the panel surface does not exist below
// a 1360 px window (spec Surfaces: `panel` at 1360 px or more, `page` below). The phone
// flows this test touches are covered by the phone loops of checkpoints 4 and 5 (Back to
// the list after opening a customer, Escape, the Discard changes? question, browser Back,
// reload). The replace rule cannot occur on a phone, where no list row is reachable while
// a page is open. Native animation and swipe are not run. A read-only user cannot be
// driven, because the seed has no read-only Books member.

const PANEL_HEADER_HEIGHT = 52
const OLD_MILL = 'Old Mill Bakery'

const cityLineFits = (page: Page) => customerHelpers.cityLineFits(page, 'billing_address')

const UNSAVED_DELETE_WARNING = 'Unsaved changes to this customer will be lost.'
const DELETE_REFUSAL = 'This customer is used on an invoice.'

const jumpToBooksLists = customerHelpers.jumpToLists

test.describe('customer-form: side panel', () => {
    test('opens customers beside the list and survives a resize', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(WIDE)
        const panel = page.getByTestId('customer-panel')
        const customerPage = page.getByTestId('customer-page')
        const title = page.getByTestId('customer-title')
        const close = page.getByTestId('customer-close')
        const list = page.getByTestId('customers-list')
        const dialog = discardDialog(page)
        const errorText = 'Display name is required'
        const nameCell = page.getByTestId('form-field-display_name')

        // (1) No customer open: no panel, and the list spans the content area.
        await openCustomersList(page)
        await expect(panel).toBeHidden()
        await expect.poll(() => listSpansContent(page)).toBe(true)

        // (2) New customer opens in the 480 px panel at the right, beside the list.
        await page.getByTestId('customer-new-header').click()
        await expect(panel).toBeVisible()
        const header = page.getByTestId('customer-panel-header')
        await expect(header).toBeVisible()
        await expect
            .poll(async () => (await edges(header))?.height)
            .toBeGreaterThanOrEqual(PANEL_HEADER_HEIGHT - 1)
        await expect
            .poll(async () => (await edges(header))?.height)
            .toBeLessThanOrEqual(PANEL_HEADER_HEIGHT + 1)
        await expect(header.getByTestId('customer-title')).toHaveText('New customer')
        await expect(header.getByTestId('customer-close')).toHaveAccessibleName('Close')
        await expect(page.getByTestId('customer-back')).toBeHidden()
        await expect(list).toBeVisible()
        await expect
            .poll(() => panelPlacement(page))
            .toEqual({ widthIs480: true, atContentRight: true, listToItsLeft: true })

        // Under 640 px the pairs are one column; the city line still shares a line.
        await expect
            .poll(() =>
                stacked(
                    panel.getByTestId('form-input-first_name'),
                    panel.getByTestId('form-input-last_name')
                )
            )
            .toBe(true)
        await expect
            .poll(() => cityLineFits(page))
            .toEqual({
                shareTop: true,
                cityBeforeRegion: true,
                regionBeforePostal: true,
                postalInsideBlock: true,
            })

        // (3) The surface reads the window width only: collapsing the sidebar keeps the panel.
        const sidebarToggle = page.getByTestId('nav-sidebar-toggle')
        const listLeftOpen = await leftEdgeOf(list)
        await sidebarToggle.click()
        await expect(sidebarToggle).toHaveAccessibleName('Show sidebar')
        // The sidebar's width animates to zero, so the list's left edge moves left.
        await expect.poll(() => leftEdgeOf(list)).toBeLessThan(listLeftOpen - 100)
        await expect(panel).toBeVisible()
        await expect(customerPage).toBeHidden()
        await expect
            .poll(() => panelPlacement(page))
            .toEqual({ widthIs480: true, atContentRight: true, listToItsLeft: true })
        await sidebarToggle.click()
        await expect(sidebarToggle).toHaveAccessibleName('Hide sidebar')
        await expect.poll(() => leftEdgeOf(list)).toBe(listLeftOpen)

        // (4) Two customers created through the panel; each Save closes it.
        const prefix = uniqueName(page, 'Panel')
        const nameA = `${prefix} A`
        const nameB = `${prefix} B`
        for (const name of [nameA, nameB]) {
            await createCustomer(page, { name })
            await expect(panel).toBeHidden()
            await expect(page).toHaveURL(/\/books\/customers$/)
        }

        // (5) A row opens its customer in the panel and is marked; the list stays usable.
        await searchCustomers(page, prefix)
        const idA = await customerIdOf(page, nameA)
        const idB = await customerIdOf(page, nameB)
        const rowA = page.getByTestId(`customer-row-${idA}`)
        const rowB = page.getByTestId(`customer-row-${idB}`)
        const urlA = new RegExp(`/books/customers/${idA}$`)
        const urlB = new RegExp(`/books/customers/${idB}$`)
        await rowA.click()
        await expect(panel).toBeVisible()
        await expect(page).toHaveURL(urlA)
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await expect
            .poll(async () => (await backgroundOf(rowA)) !== (await backgroundOf(rowB)))
            .toBe(true)
        await searchCustomers(page, nameA)
        await expect(customerEntry(page, nameB)).toHaveCount(0)
        await expect(customerEntry(page, nameA)).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await searchCustomers(page, prefix)
        await expect(rowB).toBeVisible()

        // (6) Another row, then New customer, replace the open customer; Back returns
        // to the list.
        await rowB.click()
        await expect(page).toHaveURL(urlB)
        await expect(field(page, 'display_name')).toHaveValue(nameB)
        await page.getByTestId('customer-new-header').click()
        await expect(title).toHaveText('New customer')
        await expect(panel).toBeVisible()
        await page.goBack()
        await expect(page).toHaveURL(/\/books\/customers$/)
        await expect(panel).toBeHidden()

        // (7) Escape closes the panel.
        await rowA.click()
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await pressEscapeOutsideInputs(page)
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/customers$/)

        // (8) A dirty customer is not replaced without asking.
        const typedCompany = `${prefix} Co`
        await rowA.click()
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await field(page, 'company').fill(typedCompany)
        await rowB.click()
        await expect(dialog.title).toBeVisible()
        await expect(page).toHaveURL(urlA)
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await expect(field(page, 'company')).toHaveValue(typedCompany)
        await rowB.click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(urlB)
        await expect(field(page, 'display_name')).toHaveValue(nameB)

        // (9) A resize moves the open customer between panel and page with its typed
        // values, its field error and an open Discard changes? question.
        await rowA.click()
        await expect(page).toHaveURL(urlA)
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await field(page, 'company').fill(typedCompany)

        // The open customer's own row keeps its dirty form: no question, same URL, and
        // the same input element (a remount would drop the mark).
        await field(page, 'company').evaluate(el => el.setAttribute('data-e2e-kept', 'yes'))
        await rowA.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(urlA)
        await expect(field(page, 'company')).toHaveValue(typedCompany)
        await expect(field(page, 'company')).toHaveAttribute('data-e2e-kept', 'yes')

        await field(page, 'display_name').fill('')
        await page.getByTestId('customer-save').click()
        await expect(nameCell).toContainText(errorText)
        await expect(dialog.title).toBeHidden()

        await page.setViewportSize(DESKTOP)
        await expect(customerPage).toBeVisible()
        await expect(panel).toBeHidden()
        // The page surface draws no row as selected. The mouse leaves the rows so a
        // hover style cannot match or mask the selected one.
        await page.mouse.move(0, 0)
        await expect
            .poll(async () => (await backgroundOf(rowA)) === (await backgroundOf(rowB)))
            .toBe(true)
        await expect(page.getByTestId('customer-back')).toBeVisible()
        await expect(field(page, 'company')).toHaveValue(typedCompany)
        await expect(nameCell).toContainText(errorText)
        await expect(page).toHaveURL(urlA)

        await page.setViewportSize(WIDE)
        await expect(panel).toBeVisible()
        await expect(customerPage).toBeHidden()
        await expect(field(page, 'company')).toHaveValue(typedCompany)
        await expect(nameCell).toContainText(errorText)
        await expect(page).toHaveURL(urlA)

        await close.click()
        await expect(dialog.title).toBeVisible()
        await page.setViewportSize(DESKTOP)
        await expect(dialog.title).toBeVisible()
        await page.setViewportSize(WIDE)
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(panel).toBeVisible()
        await expect(field(page, 'company')).toHaveValue(typedCompany)

        // (10) An open picker query survives a resize.
        const parentSearch = page.getByTestId('customer-parent-search')
        await page.getByTestId('customer-parent').click()
        await parentSearch.fill('North')
        await page.setViewportSize(DESKTOP)
        await expect(customerPage).toBeVisible()
        if (!(await parentSearch.isVisible())) await page.getByTestId('customer-parent').click()
        await expect(parentSearch).toHaveValue('North')
        await page.keyboard.press('Escape')
        await expect(parentSearch).toBeHidden()
        await page.setViewportSize(WIDE)
        await expect(panel).toBeVisible()
        await close.click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/customers$/)
        // With the panel closed no row stays drawn as selected.
        await page.mouse.move(0, 0)
        await expect
            .poll(async () => (await backgroundOf(rowA)) === (await backgroundOf(rowB)))
            .toBe(true)

        // (11) A reload of a customer's URL shows it in the panel beside the list.
        await rowB.click()
        await expect(page).toHaveURL(urlB)
        await page.reload()
        await expect(panel).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameB)
        await expect(list).toBeVisible()
        await expect
            .poll(() => panelPlacement(page))
            .toEqual({ widthIs480: true, atContentRight: true, listToItsLeft: true })

        // (12) The list beside the panel still filters by Show inactive.
        const showInactive = page.getByTestId('customers-show-inactive')
        await expect(showInactive).toHaveAttribute('aria-checked', 'false')
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'true')
        await searchCustomers(page, OLD_MILL)
        await expect(customerEntry(page, OLD_MILL)).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameB)
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'false')
        await expect(customerEntry(page, OLD_MILL)).toHaveCount(0)
        await expect(panel).toBeVisible()

        // (13) The open, dirty customer deleted from its own row menu beside the panel:
        // the dialog warns of the unsaved changes, a refusal keeps the panel and its typed
        // notes, and the delete closes the panel with no second question and no not-found.
        const nameD = `${prefix} D`
        const typedNotes = `${prefix} notes`
        await createCustomer(page, { name: nameD })
        await searchCustomers(page, nameD)
        const idD = await customerIdOf(page, nameD)
        await page.getByTestId(`customer-row-${idD}`).click()
        await expect(panel).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameD)
        await field(page, 'notes').fill(typedNotes)
        await watchForNotFoundAndDiscard(page)

        const deleteDialog = page.getByTestId('delete-customer-dialog')
        const deleteBody = page.getByTestId('delete-customer-dialog-body')
        const deleteConfirm = page.getByTestId('delete-customer-confirm')
        const openDeleteFromRow = async () => {
            await page.getByTestId(`customer-menu-${idD}`).click()
            await page.getByTestId('customer-menu-delete').click()
            await expect(deleteDialog).toBeVisible()
            await expect(deleteBody).toContainText(UNSAVED_DELETE_WARNING)
        }
        const recordD = `**/api/collections/books_customers/records/${idD}`
        await page.route(recordD, route => {
            if (route.request().method() !== 'DELETE') return route.continue()
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ code: 400, message: DELETE_REFUSAL, data: {} }),
            })
        })
        await openDeleteFromRow()
        await deleteConfirm.click()
        await expect(deleteBody).toContainText(DELETE_REFUSAL)
        await expect(page.getByTestId('customer-not-found')).toHaveCount(0)
        await expect(panel).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameD)
        await expect(field(page, 'notes')).toHaveValue(typedNotes)
        // Escape closes the dialog only; the click moves focus off any input first.
        await deleteBody.click()
        await page.keyboard.press('Escape')
        await expect(deleteDialog).toBeHidden()
        await expect(panel).toBeVisible()
        await expect(field(page, 'notes')).toHaveValue(typedNotes)
        await page.unroute(recordD)

        await openDeleteFromRow()
        await deleteConfirm.click()
        await expect(deleteDialog).toBeHidden()
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/customers$/)
        await expect(dialog.title).toBeHidden()
        await expect(customerEntry(page, nameD)).toHaveCount(0)
        expect(await seenNotFoundOrDiscard(page)).toEqual({ notFound: false, discard: false })

        // (14) The delete's follow-up acts only while the user still sees that customer: a
        // delete of the open customer that lands after the user went on to the Lists hub
        // leaves them there.
        const nameE = `${prefix} E`
        await createCustomer(page, { name: nameE })
        await searchCustomers(page, nameE)
        const idE = await customerIdOf(page, nameE)
        await page.getByTestId(`customer-row-${idE}`).click()
        await expect(panel).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameE)
        const heldDelete = await holdRecordWrite(page, idE, 'DELETE')
        await page.getByTestId(`customer-menu-${idE}`).click()
        await page.getByTestId('customer-menu-delete').click()
        await expect(deleteDialog).toBeVisible()
        await deleteConfirm.click()
        await heldDelete.arrived
        await jumpToBooksLists(page)
        const deleted = page.waitForResponse(
            response =>
                response.request().method() === 'DELETE' &&
                response.url().includes(`/books_customers/records/${idE}`)
        )
        await heldDelete.release()
        expect((await deleted).ok()).toBe(true)
        await settle(page)
        await expect(page).toHaveURL(/\/books\/lists$/)
        await expect(page.getByTestId('books-list-card-customers')).toBeVisible()
    })
})
