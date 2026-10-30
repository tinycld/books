import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    createCustomer,
    customerEntry,
    customerIdOf,
    DESKTOP,
    discardDialog,
    field,
    holdRecordWrite,
    openCustomersList,
    searchCustomers,
    uniqueName,
    WIDE,
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

const PANEL_WIDTH = 480
const PANEL_HEADER_HEIGHT = 52
const OLD_MILL = 'Old Mill Bakery'

function boxOf(locator: Locator) {
    return locator.boundingBox()
}

// The content area, with the Books sidebar open: from the right edge of the sidebar to
// the right edge of the window. A collapsed sidebar keeps its content laid out inside a
// zero-width box, so its edge is read only while it is open.
async function contentArea(page: Page) {
    const sidebar = await boxOf(page.getByTestId('package-sidebar-mounted'))
    const width = page.viewportSize()?.width ?? WIDE.width
    if (!sidebar) return null
    return { left: sidebar.x + sidebar.width, right: width }
}

async function leftEdgeOf(locator: Locator) {
    return (await edges(locator))?.left ?? Number.NaN
}

// Edges rounded to whole pixels, for a stable comparison.
async function edges(locator: Locator) {
    const box = await boxOf(locator)
    if (!box) return null
    return {
        left: Math.round(box.x),
        right: Math.round(box.x + box.width),
        top: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
    }
}

// The panel's width and where it sits against the content area and the list.
async function panelPlacement(page: Page) {
    const [panel, list, content] = await Promise.all([
        edges(page.getByTestId('customer-panel')),
        edges(page.getByTestId('customers-list')),
        contentArea(page),
    ])
    if (!panel || !list || !content) return null
    return {
        widthIs480: Math.abs(panel.width - PANEL_WIDTH) <= 1,
        atContentRight: Math.abs(panel.right - content.right) <= 1,
        listToItsLeft: list.right <= panel.left + 1 && list.width > 0,
    }
}

// True when the list fills the content area from edge to edge.
async function listSpansContent(page: Page) {
    const [list, content] = await Promise.all([
        edges(page.getByTestId('customers-list')),
        contentArea(page),
    ])
    if (!list || !content) return false
    return Math.abs(list.left - content.left) <= 1 && Math.abs(list.right - content.right) <= 1
}

// True when `lower` starts below the bottom of `upper` (they do not share a top).
async function stacked(upper: Locator, lower: Locator) {
    const [a, b] = await Promise.all([boxOf(upper), boxOf(lower)])
    if (!a || !b) return false
    return b.y >= a.y + a.height - 1
}

// City, State or region and Postal code share a top, and none runs into the next or past
// the address block (the core `min-w-0` fix on TextInput).
async function cityLineFits(page: Page) {
    const part = (name: string) => boxOf(page.getByTestId(`form-input-billing_address-${name}`))
    const [city, region, postal, block] = await Promise.all([
        part('city'),
        part('region'),
        part('postal_code'),
        boxOf(page.getByTestId('address-billing_address')),
    ])
    if (!city || !region || !postal || !block) return null
    return {
        shareTop: Math.abs(city.y - region.y) < 1 && Math.abs(region.y - postal.y) < 1,
        cityBeforeRegion: city.x + city.width <= region.x + 0.5,
        regionBeforePostal: region.x + region.width <= postal.x + 0.5,
        postalInsideBlock: postal.x + postal.width <= block.x + block.width + 0.5,
    }
}

function backgroundOf(locator: Locator) {
    return locator.evaluate(el => getComputedStyle(el).backgroundColor)
}

// A click on the title moves focus off any input: react-native-web's TextInput stops
// every keydown from reaching the window, where the Escape shortcut listens.
async function pressEscapeOutsideInputs(page: Page) {
    await page.getByTestId('customer-title').click()
    await page.keyboard.press('Escape')
}

const UNSAVED_DELETE_WARNING = 'Unsaved changes to this customer will be lost.'
const DELETE_REFUSAL = 'This customer is used on an invoice.'

// From now on, records whether the not-found message or the Discard changes? question
// ever appears, even for one frame.
function watchForNotFoundAndDiscard(page: Page) {
    return page.evaluate(() => {
        const seen = { notFound: false, discard: false }
        new MutationObserver(() => {
            if (document.querySelector('[data-testid="customer-not-found"]')) seen.notFound = true
            if (document.body.textContent?.includes('Discard changes?')) seen.discard = true
        }).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        })
        Object.assign(window, { __customerSeen: seen })
    })
}

// To the Books Lists hub with the `t k` jump, the way out while a dialog's backdrop takes
// the pointer off the sidebar, and waits until the hub shows.
async function jumpToBooksLists(page: Page) {
    await page.keyboard.press('t')
    await page.keyboard.press('k')
    await expect(page).toHaveURL(/\/books\/lists$/)
    await expect(page.getByTestId('books-list-card-customers')).toBeVisible()
}

// Two frames and a task in the page, so work queued by a response that just arrived (a
// mutation's onSuccess and any navigation it starts) has run.
function settle(page: Page) {
    return page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve)))
            )
    )
}

function seenNotFoundOrDiscard(page: Page) {
    return page.evaluate(
        () => (window as unknown as { __customerSeen: Record<string, boolean> }).__customerSeen
    )
}

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
