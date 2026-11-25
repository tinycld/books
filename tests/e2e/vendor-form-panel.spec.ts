import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { nameOnDraftLine } from './journal-entries-helpers'
import {
    accentOf,
    backgroundOf,
    cityLineFits,
    contentArea,
    createVendor,
    DESKTOP,
    discardDialog,
    edges,
    field,
    holdVendorWrite,
    jumpToBooksHome,
    leftEdgeOf,
    listSpansContent,
    openVendorId,
    openVendorsList,
    panelPlacement,
    pressEscapeOutsideInputs,
    searchVendors,
    seenNotFoundOrDiscard,
    settle,
    stacked,
    uniqueName,
    vendorEntry,
    vendorIdOf,
    vendorPath,
    viewportName,
    WIDE,
    watchForNotFoundAndDiscard,
} from './vendor-form-helpers'

// The vendor surfaces at a window of 1360 px or more: a new vendor opens in a 480 px panel
// beside the full list, and an existing vendor's page fills the content area beside a
// 320 px column of names. A resize moves the open vendor between that and the page surface
// without losing anything; the open vendor can be deleted from its page's More menu.
// Every vendor this spec opens for editing or deletes it creates with a unique
// name; it reads the seeded Coastal Coffee Roasters and Willamette Valley Commercial
// Cleaning and Janitorial Services Cooperative and saves neither: the scroll test types
// into Willamette's website field to show the save bar and then discards it, so the seeded
// row is never written. Each test makes the vendors its own steps use. The delete refusal is
// the server's own: another tab puts the vendor on a line of a draft journal entry, and
// deletes that draft before the delete that goes through.
//
// Not covered here: there is no phone run, because the panel surface does not exist below
// a 1360 px window. The phone flows it touches (Back, Escape, the Discard changes?
// question, browser Back, reload) run in the customer page and save specs' phone loops.
// The replace rule cannot occur on a phone, where no list row is reachable while a page is
// open. Native animation and swipe are not run.

const PANEL_HEADER_HEIGHT = 52
const PANEL_WIDTH = 480
const RECORD_LIST_WIDTH = 320
const COASTAL = 'Coastal Coffee Roasters'
const WILLAMETTE = 'Willamette Valley Commercial Cleaning and Janitorial Services Cooperative'
const UNSAVED_DELETE_WARNING = 'Unsaved changes to this vendor will be lost.'
const RECORD_PLACED = { listIs320: true, atContentRight: true, listToItsLeft: true }

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

// Opens a vendor from its list row and shows its Details tab.
async function openRowDetails(page: Page, row: Locator) {
    await row.click()
    await page.getByTestId('vendor-tab-details').click()
}

// The page beside a 320 px list column, the page at the right of the content area.
async function recordPlacement(page: Page) {
    const [record, list, content] = await Promise.all([
        edges(page.getByTestId('vendor-panel')),
        edges(page.getByTestId('vendors-list')),
        contentArea(page),
    ])
    if (!record || !list || !content) return null
    return {
        listIs320: Math.abs(list.width - RECORD_LIST_WIDTH) <= 1,
        atContentRight: Math.abs(record.right - content.right) <= 1,
        listToItsLeft: list.right <= record.left + 1,
    }
}

// The bottom of the page's save bar (its footer while the form is dirty) against the
// bottom of the surface, in whole pixels.
async function footerGap(page: Page, surfaceId: string) {
    const [footer, surface] = await Promise.all([
        edges(page.getByTestId('vendor-save-bar')),
        edges(page.getByTestId(surfaceId)),
    ])
    if (!footer || !surface) return null
    return Math.abs(footer.top + footer.height - (surface.top + surface.height))
}

// Books at the 1600 px window, where the panel surface shows.
async function openWide(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(WIDE)
}

// Two vendors created through the panel (`afterSave` runs on each new vendor's page), then
// the list searched to the pair: their names, rows and URLs.
async function createPair(page: Page, label: string, afterSave = async () => {}) {
    const prefix = uniqueName(`${label} ${viewportName(page)}`)
    const nameA = `${prefix} A`
    const nameB = `${prefix} B`
    for (const name of [nameA, nameB]) {
        await createVendor(page, { name })
        await afterSave()
    }
    await openVendorsList(page)
    await searchVendors(page, prefix)
    const idA = await vendorIdOf(page, nameA)
    const idB = await vendorIdOf(page, nameB)
    return {
        prefix,
        idA,
        nameA,
        nameB,
        rowA: page.getByTestId(`vendor-row-${idA}`),
        rowB: page.getByTestId(`vendor-row-${idB}`),
        urlA: vendorPath(idA),
        urlB: vendorPath(idB),
    }
}

test.describe('vendor-form: side panel', () => {
    test('a new vendor opens in the 480 px panel beside the list, also with the sidebar collapsed', async ({
        page,
    }) => {
        await openWide(page)
        const panel = page.getByTestId('vendor-panel')
        const list = page.getByTestId('vendors-list')
        const placed = { widthIs480: true, atContentRight: true, listToItsLeft: true }

        // No vendor open: no panel, and the list spans the content area.
        await openVendorsList(page)
        await expect(panel).toBeHidden()
        await expect.poll(() => listSpansContent(page)).toBe(true)

        // New vendor opens in the 480 px panel at the right, beside the list.
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

        // The surface reads the window width only: collapsing the sidebar keeps the panel.
        const sidebarToggle = page.getByTestId('nav-sidebar-toggle')
        const listLeftOpen = await leftEdgeOf(list)
        await sidebarToggle.click()
        await expect(sidebarToggle).toHaveAccessibleName('Show sidebar')
        await expect.poll(() => leftEdgeOf(list)).toBeLessThan(listLeftOpen - 100)
        await expect(panel).toBeVisible()
        await expect(page.getByTestId('vendor-page')).toBeHidden()
        await expect.poll(() => panelPlacement(page)).toEqual(placed)
        await sidebarToggle.click()
        await expect(sidebarToggle).toHaveAccessibleName('Hide sidebar')
        await expect.poll(() => leftEdgeOf(list)).toBe(listLeftOpen)
    })

    test('a vendor opens beside a 320 px list of names; a row, New vendor, Back, Escape and a reload move between them', async ({
        page,
    }) => {
        await openWide(page)
        const panel = page.getByTestId('vendor-panel')
        const list = page.getByTestId('vendors-list')

        // Each Save opens the new vendor's page beside a 320 px column of names, with no
        // back button.
        const { prefix, idA, nameA, nameB, rowA, rowB, urlA, urlB } = await createPair(
            page,
            'Panel',
            async () => {
                await expect(panel).toBeVisible()
                await expect(page.getByTestId('vendor-back')).toBeHidden()
                await expect.poll(() => recordPlacement(page)).toEqual(RECORD_PLACED)
            }
        )

        // A row opens its vendor beside the list and is marked; the list stays usable.
        await openRowDetails(page, rowA)
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

        // Another row, then New vendor, replace the open vendor; Back returns to the list.
        await openRowDetails(page, rowB)
        await expect(page).toHaveURL(urlB)
        await page.getByTestId('vendor-new-header').click()
        await expect(page.getByTestId('vendor-title')).toHaveText('New vendor')
        await expect(panel).toBeVisible()
        await page.goBack()
        await expect(page).toHaveURL(/\/books\/vendors$/)
        await expect(panel).toBeHidden()

        // Escape on a clean page leaves it.
        await openRowDetails(page, rowA)
        await expect(field(page, 'display_name')).toHaveValue(nameA)
        await pressEscapeOutsideInputs(page)
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/vendors$/)

        // A reload of a vendor's URL shows its page beside the list of names.
        await rowB.click()
        await expect(page).toHaveURL(urlB)
        await page.reload()
        await expect(panel).toBeVisible()
        await page.getByTestId('vendor-tab-details').click()
        await expect(field(page, 'display_name')).toHaveValue(nameB)
        await expect(list).toBeVisible()
        await expect.poll(() => recordPlacement(page)).toEqual(RECORD_PLACED)

        // The list of names beside the page still filters by Show inactive.
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
    })

    test('a dirty vendor is not replaced without asking, and a resize keeps its values, error and question', async ({
        page,
    }) => {
        await openWide(page)
        const panel = page.getByTestId('vendor-panel')
        const vendorPage = page.getByTestId('vendor-page')
        const cancel = page.getByTestId('vendor-cancel')
        const dialog = discardDialog(page)
        const errorText = 'Display name is required'
        const nameCell = page.getByTestId('form-field-display_name')
        const { prefix, nameA, nameB, rowA, rowB, urlA, urlB } = await createPair(page, 'Dirty')

        // A dirty vendor is not replaced without asking.
        const typedCompany = `${prefix} Co`
        await openRowDetails(page, rowA)
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
        await page.getByTestId('vendor-tab-details').click()
        await expect(field(page, 'display_name')).toHaveValue(nameB)

        // The open vendor's own row keeps its dirty form (no remount), and a resize moves it
        // between the record width and the page with its typed values, its field error and
        // an open Discard changes? question.
        await openRowDetails(page, rowA)
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
        await cancel.click()
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
        // Discard puts the stored values back and the page stays; Escape on the clean page
        // then leaves it.
        await cancel.click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expect(page.getByTestId('vendor-save-bar')).toBeHidden()
        await pressEscapeOutsideInputs(page)
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/vendors$/)
        await page.mouse.move(0, 0)
        await expect
            .poll(async () => (await backgroundOf(rowA)) === (await backgroundOf(rowB)))
            .toBe(true)
    })

    test('the list scrolls beside the page, and the save bar stays at the bottom while the form scrolls', async ({
        page,
    }) => {
        await openWide(page)
        const panel = page.getByTestId('vendor-panel')
        const dialog = discardDialog(page)
        await openVendorsList(page)
        await searchVendors(page, 'Willamette Valley')
        await openRowDetails(page, vendorEntry(page, WILLAMETTE))
        await expect(field(page, 'display_name')).toHaveValue(WILLAMETTE)

        // The full list scrolls beside the open page, which stays open.
        await page.setViewportSize({ width: 1600, height: 700 })
        await searchVendors(page, '')
        const table = scrollerIn(page, 'vendors-table')
        await table.scrollTo(200)
        await expect.poll(async () => (await table.scrollTo())?.scrollTop ?? 0).toBeGreaterThan(0)
        await expect(field(page, 'display_name')).toHaveValue(WILLAMETTE)

        // The seeded vendor is edited but never saved: Cancel discards below. The save bar
        // (the page's footer while the form is dirty) stays at the bottom while the form
        // scrolls, on the record width and on the page.
        await field(page, 'website').fill('https://example.com/helix')
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
            await expect(page.getByTestId('vendor-save-bar')).toBeVisible()
        }
        await page.setViewportSize(WIDE)
        await page.getByTestId('vendor-cancel').click()
        await expect(dialog.title).toBeVisible()
        await dialog.discard.click()
        await expect(page.getByTestId('vendor-save-bar')).toBeHidden()
        await pressEscapeOutsideInputs(page)
        await expect(panel).toBeHidden()
    })

    test('the open, dirty vendor deleted from its More menu: a refusal keeps the page, then the delete leaves it', async ({
        page,
    }) => {
        await openWide(page)
        const panel = page.getByTestId('vendor-panel')
        const prefix = uniqueName(`Panel delete ${viewportName(page)}`)
        const nameD = `${prefix} D`
        const typedNotes = `${prefix} notes`
        const notesInput = page.getByTestId('vendor-notes-input')
        await createVendor(page, { name: nameD })
        await expect(panel).toBeVisible()
        await page.getByTestId('vendor-tab-details').click()
        await expect(field(page, 'display_name')).toHaveValue(nameD)
        await page.getByTestId('vendor-tab-notes').click()
        await notesInput.fill(typedNotes)
        await watchForNotFoundAndDiscard(page)

        // The dialog warns of the unsaved changes.
        const deleteDialog = page.getByTestId('delete-vendor-dialog')
        const deleteBody = page.getByTestId('delete-vendor-dialog-body')
        const deleteConfirm = page.getByTestId('delete-vendor-confirm')
        const more = page.getByTestId('vendor-more')
        const openDeleteFromRow = async () => {
            await expect(more).toBeVisible()
            await more.click()
            await page.getByTestId('vendor-more-delete').click()
            await expect(deleteDialog).toBeVisible()
            await expect(deleteBody).toContainText(UNSAVED_DELETE_WARNING)
        }
        // Another tab puts D on a line of a draft journal entry, so the server refuses
        // the delete (server/lines.go msgPartyOnLines).
        const namedOnDraft = await nameOnDraftLine(page, nameD)
        await openDeleteFromRow()
        await deleteConfirm.click()
        await expect(deleteBody).toContainText(
            `${nameD} is on journal lines. Make it inactive instead.`
        )
        await expect(page.getByTestId('vendor-not-found')).toHaveCount(0)
        await expect(panel).toBeVisible()
        await expect(page.getByTestId('vendor-title')).toHaveText(nameD)
        await expect(notesInput).toHaveValue(typedNotes)
        // Escape closes the dialog only; the click moves focus off any input first.
        await deleteBody.click()
        await page.keyboard.press('Escape')
        await expect(deleteDialog).toBeHidden()
        await expect(panel).toBeVisible()
        await expect(notesInput).toHaveValue(typedNotes)
        // The other tab deletes the draft entry; no line names D now.
        await namedOnDraft.release()

        // The delete leaves the page with no second question and no not-found.
        await openDeleteFromRow()
        await deleteConfirm.click()
        await expect(deleteDialog).toBeHidden()
        await expect(panel).toBeHidden()
        await expect(page).toHaveURL(/\/books\/vendors$/)
        await expect(discardDialog(page).title).toBeHidden()
        await searchVendors(page, nameD)
        await expect(vendorEntry(page, nameD)).toHaveCount(0)
        expect(await seenNotFoundOrDiscard(page)).toEqual({ notFound: false, discard: false })
    })

    test('a delete of the open vendor that lands after the user went to the Books home leaves them there', async ({
        page,
    }) => {
        await openWide(page)
        const panel = page.getByTestId('vendor-panel')
        const nameE = `${uniqueName(`Panel home ${viewportName(page)}`)} E`
        await createVendor(page, { name: nameE })
        await expect(panel).toBeVisible()
        await page.getByTestId('vendor-tab-details').click()
        await expect(field(page, 'display_name')).toHaveValue(nameE)
        const idE = await openVendorId(page)
        const held = await holdVendorWrite(page, idE, 'DELETE')
        await page.getByTestId('vendor-more').click()
        await page.getByTestId('vendor-more-delete').click()
        await expect(page.getByTestId('delete-vendor-dialog')).toBeVisible()
        await page.getByTestId('delete-vendor-confirm').click()
        await held.arrived
        await jumpToBooksHome(page)
        const deleted = page.waitForResponse(
            response =>
                response.request().method() === 'DELETE' &&
                response.url().includes(`/books_vendors/records/${idE}`)
        )
        await held.release()
        expect((await deleted).ok()).toBe(true)
        await settle(page)
        await expect(page).toHaveURL(/\/books\/dashboard$/)
        await expect(page.getByTestId('dashboard-screen').filter({ visible: true })).toBeVisible()
    })
})
