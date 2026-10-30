import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    backgroundOf,
    cityLineFits,
    createVendor,
    DESKTOP,
    discardDialog,
    edges,
    field,
    holdVendorWrite,
    jumpToLists,
    leftEdgeOf,
    listSpansContent,
    openVendorsList,
    panelPlacement,
    pressEscapeOutsideInputs,
    searchVendors,
    seenNotFoundOrDiscard,
    settle,
    stacked,
    uniqueName,
    vendorEntry,
    vendorHelpers,
    vendorIdOf,
    WIDE,
    watchForNotFoundAndDiscard,
} from './vendor-form-helpers'

// The vendor side panel: at a window of 1360 px or more a vendor opens in a 480 px panel
// beside the list, and a resize moves the open vendor between the panel and the page
// without losing anything; the open vendor can be deleted from its row menu beside the
// panel. Every vendor this spec opens for editing or deletes it creates with a unique
// name; it reads the seeded Coastal Coffee Roasters and Willamette Valley Commercial
// Cleaning and Janitorial Services Cooperative and edits neither. A delete refusal is a
// 400 answered through `page.route` (no "in use" refusal exists yet), which writes nothing.
//
// Not covered here: there is no phone run, because the panel surface does not exist below
// a 1360 px window. The phone flows it touches (Back, Escape, the Discard changes?
// question, browser Back, reload) run in the customer page and save specs' phone loops.
// The replace rule cannot occur on a phone, where no list row is reachable while a page is
// open. Native animation and swipe are not run.

const PANEL_HEADER_HEIGHT = 52
const PANEL_WIDTH = 480
const COASTAL = 'Coastal Coffee Roasters'
const WILLAMETTE = 'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative'
const UNSAVED_DELETE_WARNING = 'Unsaved changes to this vendor will be lost.'
const DELETE_REFUSAL = 'This vendor is used on a bill.'

// The four half-width pairs of the default layout.
const PAIRS = [
    ['first_name', 'last_name'],
    ['email', 'phone'],
    ['mobile', 'website'],
    ['terms', 'account_number'],
] as const

// The panel's column: the outermost of `vendor-panel` and its ancestors that is still
// 480 ± 1 px wide (the panel itself sits inside the column's border). Its left border.
function borderLeftOfColumn(page: Page) {
    return page.getByTestId('vendor-panel').evaluate((el, width) => {
        const fits = (node: Element) => Math.abs(node.getBoundingClientRect().width - width) <= 1
        let column: Element | null = null
        for (let node: Element | null = el; node && fits(node); node = node.parentElement) {
            column = node
        }
        return column ? getComputedStyle(column).borderLeftWidth : null
    }, PANEL_WIDTH)
}

// The vertical scroller of a test id (the element itself, or the first one inside it whose
// computed overflowY scrolls): `scrollTo` sets its scrollTop (`'end'` = its scrollHeight)
// and returns what it then reads, or null when there is no scroller.
function scrollerIn(page: Page, testId: string) {
    return {
        scrollTo: (top: number | 'end' | null = null) =>
            page
                .getByTestId(testId)
                .filter({ visible: true })
                .evaluate((el, to) => {
                    const scrolls = (node: Element) =>
                        ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
                    const scroller = scrolls(el)
                        ? el
                        : Array.from(el.querySelectorAll('*')).find(scrolls)
                    if (!scroller) return null
                    if (to !== null) scroller.scrollTop = to === 'end' ? scroller.scrollHeight : to
                    return {
                        scrollTop: scroller.scrollTop,
                        scrollHeight: scroller.scrollHeight,
                        clientHeight: scroller.clientHeight,
                    }
                }, top),
    }
}

// The bottom of the footer against the bottom of the surface, in whole pixels.
async function footerGap(page: Page, surfaceId: string) {
    const [footer, surface] = await Promise.all([
        edges(page.getByTestId('vendor-footer')),
        edges(page.getByTestId(surfaceId)),
    ])
    if (!footer || !surface) return null
    return Math.abs(footer.top + footer.height - (surface.top + surface.height))
}

// `bg-accent` resolved in the page: tinycld/global.css declares `--accent` as an RGB
// triple per theme.
function accentOf(page: Page, testId: string) {
    return page
        .getByTestId(testId)
        .evaluate(
            el =>
                `rgb(${getComputedStyle(el).getPropertyValue('--accent').trim().split(/\s+/).join(', ')})`
        )
}

test.describe('vendor-form: side panel', () => {
    test('opens vendors beside the list and survives a resize', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(WIDE)
        const panel = page.getByTestId('vendor-panel')
        const vendorPage = page.getByTestId('vendor-page')
        const title = page.getByTestId('vendor-title')
        const close = page.getByTestId('vendor-close')
        const list = page.getByTestId('vendors-list')
        const dialog = discardDialog(page)
        const errorText = 'Display name is required'
        const nameCell = page.getByTestId('form-field-display_name')
        const placed = { widthIs480: true, atContentRight: true, listToItsLeft: true }

        // (1) No vendor open: no panel, and the list spans the content area.
        await openVendorsList(page)
        await expect(panel).toBeHidden()
        await expect.poll(() => listSpansContent(page)).toBe(true)

        // (2) New vendor opens in the 480 px panel at the right, beside the list.
        await page.getByTestId('vendor-new-header').click()
        await expect(panel).toBeVisible()
        const header = page.getByTestId('vendor-panel-header')
        await expect(header).toBeVisible()
        await expect
            .poll(async () => (await edges(header))?.height)
            .toBeGreaterThanOrEqual(PANEL_HEADER_HEIGHT - 1)
        await expect
            .poll(async () => (await edges(header))?.height)
            .toBeLessThanOrEqual(PANEL_HEADER_HEIGHT + 1)
        await expect(header.getByTestId('vendor-title')).toHaveText('New vendor')
        await expect(header.getByTestId('vendor-close')).toHaveAccessibleName('Close')
        await expect(page.getByTestId('vendor-back')).toBeHidden()
        await expect.poll(() => panelPlacement(page)).toEqual(placed)
        await expect.poll(() => borderLeftOfColumn(page)).toBe('1px')

        // Under 640 px the pairs are one column; the city line still shares a line.
        for (const [left, right] of PAIRS) {
            await expect
                .poll(() =>
                    stacked(
                        panel.getByTestId(`form-input-${left}`),
                        panel.getByTestId(`form-input-${right}`)
                    )
                )
                .toBe(true)
        }
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
        await expect.poll(() => leftEdgeOf(list)).toBeLessThan(listLeftOpen - 100)
        await expect(panel).toBeVisible()
        await expect(vendorPage).toBeHidden()
        await expect.poll(() => panelPlacement(page)).toEqual(placed)
        await sidebarToggle.click()
        await expect(sidebarToggle).toHaveAccessibleName('Hide sidebar')
        await expect.poll(() => leftEdgeOf(list)).toBe(listLeftOpen)

        // (4) Two vendors created through the panel; each Save closes it.
        const prefix = uniqueName(page, 'Panel')
        const nameA = `${prefix} A`
        const nameB = `${prefix} B`
        for (const name of [nameA, nameB]) {
            await createVendor(page, { name })
            await expect(panel).toBeHidden()
            await expect(page).toHaveURL(/\/books\/vendors$/)
        }

        // (5) A row opens its vendor in the panel and is marked; the list stays usable.
        await searchVendors(page, prefix)
        const idA = await vendorIdOf(page, nameA)
        const idB = await vendorIdOf(page, nameB)
        const rowA = page.getByTestId(`vendor-row-${idA}`)
        const rowB = page.getByTestId(`vendor-row-${idB}`)
        const urlA = new RegExp(`/books/vendors/${idA}$`)
        const urlB = new RegExp(`/books/vendors/${idB}$`)
        await rowA.click()
        await expect(panel).toBeVisible()
        await expect(page).toHaveURL(urlA)
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await page.mouse.move(0, 0)
        const accent = await accentOf(page, `vendor-row-${idA}`)
        await expect.poll(() => backgroundOf(rowA)).toBe(accent)
        await expect.poll(() => backgroundOf(rowB)).not.toBe(accent)
        await searchVendors(page, nameA)
        await expect(vendorEntry(page, nameB)).toHaveCount(0)
        await expect(vendorEntry(page, nameA)).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await searchVendors(page, prefix)
        await expect(rowB).toBeVisible()

        // (6) Another row, then New vendor, replace the open vendor; Back returns to the list.
        await rowB.click()
        await expect(page).toHaveURL(urlB)
        await page.getByTestId('vendor-new-header').click()
        await expect(title).toHaveText('New vendor')
        await expect(panel).toBeVisible()
        await page.goBack()
        await expect(page).toHaveURL(/\/books\/vendors$/)
        await expect(panel).toBeHidden()

        // (7) Escape closes the panel.
        await rowA.click()
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await pressEscapeOutsideInputs(page)
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/vendors$/)

        // (8) A dirty vendor is not replaced without asking.
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

        // (9) The open vendor's own row keeps its dirty form (no remount), and a resize
        // moves it between panel and page with its typed values, its field error and an
        // open Discard changes? question.
        await rowA.click()
        await expect(page).toHaveURL(urlA)
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await field(page, 'company').fill(typedCompany)
        await field(page, 'company').evaluate(el => el.setAttribute('data-e2e-kept', 'yes'))
        await rowA.click()
        await expect(dialog.title).toBeHidden()
        await expect(page).toHaveURL(urlA)
        await expect(field(page, 'company')).toHaveValue(typedCompany)
        await expect(field(page, 'company')).toHaveAttribute('data-e2e-kept', 'yes')

        await field(page, 'display_name').fill('')
        await page.getByTestId('vendor-save').click()
        await expect(nameCell).toContainText(errorText)

        await page.setViewportSize(DESKTOP)
        await expect(vendorPage).toBeVisible()
        await expect(panel).toBeHidden()
        // The page surface draws no row as selected; the mouse leaves the rows so a hover
        // style cannot match or mask the selected one.
        await page.mouse.move(0, 0)
        await expect
            .poll(async () => (await backgroundOf(rowA)) === (await backgroundOf(rowB)))
            .toBe(true)
        await expect(page.getByTestId('vendor-back')).toBeVisible()
        await expect(field(page, 'company')).toHaveValue(typedCompany)
        await expect(nameCell).toContainText(errorText)
        await expect(page).toHaveURL(urlA)

        await page.setViewportSize(WIDE)
        await expect(panel).toBeVisible()
        await expect(vendorPage).toBeHidden()
        await expect(field(page, 'company')).toHaveValue(typedCompany)
        await expect(nameCell).toContainText(errorText)

        // Each resize is read as done when the other surface shows, so the question is
        // checked on the re-rendered surface, not before the flip.
        await close.click()
        await expect(dialog.title).toBeVisible()
        await page.setViewportSize(DESKTOP)
        await expect(vendorPage).toBeVisible()
        await expect(panel).toBeHidden()
        await expect(dialog.title).toBeVisible()
        await page.setViewportSize(WIDE)
        await expect(panel).toBeVisible()
        await expect(vendorPage).toBeHidden()
        await expect(dialog.title).toBeVisible()
        await dialog.keepEditing.click()
        await expect(dialog.title).toBeHidden()
        await expect(panel).toBeVisible()
        await expect(field(page, 'company')).toHaveValue(typedCompany)
        await close.click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/vendors$/)
        await page.mouse.move(0, 0)
        await expect
            .poll(async () => (await backgroundOf(rowA)) === (await backgroundOf(rowB)))
            .toBe(true)

        // (10) A reload of a vendor's URL shows it in the panel beside the list.
        await rowB.click()
        await expect(page).toHaveURL(urlB)
        await page.reload()
        await expect(panel).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameB)
        await expect(list).toBeVisible()
        await expect.poll(() => panelPlacement(page)).toEqual(placed)

        // (11) The list beside the panel still filters by Show inactive.
        const showInactive = page.getByTestId('vendors-show-inactive')
        await expect(showInactive).toHaveAttribute('aria-checked', 'false')
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'true')
        await searchVendors(page, 'Coastal Coffee')
        await expect(vendorEntry(page, COASTAL)).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameB)
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'false')
        await expect(vendorEntry(page, COASTAL)).toHaveCount(0)
        await expect(panel).toBeVisible()

        // (12) The list scrolls beside the panel, and the footer stays at the bottom while
        // the form scrolls, on the panel and on the page.
        await page.setViewportSize({ width: 1600, height: 700 })
        await searchVendors(page, '')
        const table = scrollerIn(page, 'vendors-table')
        await table.scrollTo(200)
        await expect.poll(async () => (await table.scrollTo())?.scrollTop ?? 0).toBeGreaterThan(0)
        await expect(field(page, 'display_name')).toHaveValue(nameB)
        await searchVendors(page, 'Willamette Valley')
        await vendorEntry(page, WILLAMETTE).click()
        await expect(field(page, 'display_name')).toHaveValue(WILLAMETTE)

        for (const [size, surfaceId] of [
            [{ width: 1600, height: 700 }, 'vendor-panel'],
            [{ width: 1280, height: 700 }, 'vendor-page'],
        ] as const) {
            await page.setViewportSize(size)
            await expect(page.getByTestId(surfaceId)).toBeVisible()
            const form = scrollerIn(page, 'vendor-form')
            await expect
                .poll(async () => {
                    const state = await form.scrollTo(0)
                    return state ? state.scrollHeight > state.clientHeight : false
                })
                .toBe(true)
            await expect.poll(() => footerGap(page, surfaceId)).toBeLessThanOrEqual(1)
            await form.scrollTo('end')
            await expect
                .poll(async () => (await form.scrollTo())?.scrollTop ?? 0)
                .toBeGreaterThan(0)
            await expect.poll(() => footerGap(page, surfaceId)).toBeLessThanOrEqual(1)
            await expect(page.getByTestId('vendor-footer')).toBeVisible()
        }
        await page.setViewportSize(WIDE)
        await close.click()
        await expect(panel).toBeHidden()

        // (13) The open, dirty vendor deleted from its own row menu beside the panel: the
        // dialog warns of the unsaved changes, a refusal keeps the panel and its typed notes,
        // and the delete closes the panel with no second question and no not-found.
        const nameD = `${prefix} D`
        const typedNotes = `${prefix} notes`
        await createVendor(page, { name: nameD })
        await searchVendors(page, nameD)
        const idD = await vendorIdOf(page, nameD)
        await page.getByTestId(`vendor-row-${idD}`).click()
        await expect(panel).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameD)
        await field(page, 'notes').fill(typedNotes)
        await watchForNotFoundAndDiscard(page)

        const deleteDialog = page.getByTestId('delete-vendor-dialog')
        const deleteBody = page.getByTestId('delete-vendor-dialog-body')
        const deleteConfirm = page.getByTestId('delete-vendor-confirm')
        const menuD = page.getByTestId(`vendor-menu-${idD}`)
        const openDeleteFromRow = async () => {
            await expect(menuD).toBeVisible()
            await menuD.click()
            await page.getByTestId('vendor-menu-delete').click()
            await expect(deleteDialog).toBeVisible()
            await expect(deleteBody).toContainText(UNSAVED_DELETE_WARNING)
        }
        await page.route(vendorHelpers.recordUrl(idD), route => {
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
        await expect(page.getByTestId('vendor-not-found')).toHaveCount(0)
        await expect(panel).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameD)
        await expect(field(page, 'notes')).toHaveValue(typedNotes)
        // Escape closes the dialog only; the click moves focus off any input first.
        await deleteBody.click()
        await page.keyboard.press('Escape')
        await expect(deleteDialog).toBeHidden()
        await expect(panel).toBeVisible()
        await expect(field(page, 'notes')).toHaveValue(typedNotes)
        await page.unroute(vendorHelpers.recordUrl(idD))

        await openDeleteFromRow()
        await deleteConfirm.click()
        await expect(deleteDialog).toBeHidden()
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/vendors$/)
        await expect(dialog.title).toBeHidden()
        await expect(vendorEntry(page, nameD)).toHaveCount(0)
        expect(await seenNotFoundOrDiscard(page)).toEqual({ notFound: false, discard: false })

        // (14) A delete of the open vendor that lands after the user went on to the Lists
        // hub leaves them there.
        const nameE = `${prefix} E`
        await createVendor(page, { name: nameE })
        await searchVendors(page, nameE)
        const idE = await vendorIdOf(page, nameE)
        await page.getByTestId(`vendor-row-${idE}`).click()
        await expect(panel).toBeVisible()
        await expect(field(page, 'display_name')).toHaveValue(nameE)
        const held = await holdVendorWrite(page, idE, 'DELETE')
        await page.getByTestId(`vendor-menu-${idE}`).click()
        await page.getByTestId('vendor-menu-delete').click()
        await expect(deleteDialog).toBeVisible()
        await deleteConfirm.click()
        await held.arrived
        await jumpToLists(page)
        const deleted = page.waitForResponse(
            response =>
                response.request().method() === 'DELETE' &&
                response.url().includes(`/books_vendors/records/${idE}`)
        )
        await held.release()
        expect((await deleted).ok()).toBe(true)
        await settle(page)
        await expect(page).toHaveURL(/\/books\/lists$/)
        await expect(page.getByTestId('books-list-card-vendors')).toBeVisible()
    })
})
