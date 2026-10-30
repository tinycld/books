import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    chooseFromMenu,
    closeMenu,
    createVendor,
    DESKTOP,
    discardDialog,
    field,
    holdVendorWrite,
    inactiveLabel,
    isDisabled,
    menuItem,
    openButton,
    openDeleteDialog,
    openMenu,
    openVendorsList,
    PHONE,
    refuseDelete,
    searchVendors,
    uniqueName,
    vendorEntry,
    vendorHelpers,
    vendorIdOf,
    vendorSurface,
} from './vendor-form-helpers'

// The row menu (Edit, Make inactive or Make active, Delete) on vendor rows and cards, Make
// inactive and Make active, a change the server refuses shown in the list banner, the
// Delete vendor dialog and a delete the server refuses, and a vendor deleted in another tab
// while its form is open and dirty. Every vendor here is created through the form with a
// unique name; no seeded vendor is edited, made inactive or deleted.
//
// The phone run covers the code a phone draws differently: the cards, the row menu as a
// bottom sheet hosted by the card, and the Delete vendor dialog as a sheet with no dialog
// role (found by its title text). The banner, offline and held writes, and the vendor
// deleted elsewhere run the same code at both sizes, so they run on desktop only.
//
// Not covered here: a read-only user (no row menu) cannot be driven, because the seed has
// no read-only Books member; `recordMenuItems` is unit-tested. A refusal for a vendor that
// is in use does not exist yet (later units add it), so a refusal is a 400 answered
// through `page.route`, which writes nothing. Enter, Space and Tab on the shared
// `PartyRow` are driven by the customer actions spec.

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

const REFUSAL = 'This vendor is used on a bill.'
const CHANGE_REFUSAL = 'Books cannot change this vendor right now.'
const SERVER_UNREACHED = "Your change wasn't saved: the server could not be reached."
const CANNOT_UNDO = 'This cannot be undone.'
const NOT_FOUND = "This vendor doesn't exist or was removed"

async function expectListShown(page: Page) {
    await expect(page.getByTestId('vendors-list')).toBeVisible()
    await expect(vendorSurface(page)).toBeHidden()
    await expect(page).toHaveURL(/\/books\/vendors$/)
}

test.describe('vendor-form: inactive and delete', () => {
    for (const [sizeName, size] of SIZES) {
        test(`makes vendors inactive and deletes them (${sizeName})`, async ({ page }) => {
            await login(page)
            await navigateToPackage(page, 'books')
            await page.setViewportSize(size)
            const banner = page.getByTestId('vendors-banner')
            const showInactive = page.getByTestId('vendors-show-inactive')
            const prefix = uniqueName(page, 'Actions')
            const nameP = `${prefix} P`
            const nameQ = `${prefix} Q`

            // (1) The row (or card) opens through a button named for the vendor; the menu is
            // its own "Vendor actions" button beside it, not nested inside it.
            await openVendorsList(page)
            await createVendor(page, { name: nameP })
            await createVendor(page, { name: nameQ })
            await searchVendors(page, prefix)
            const pId = await vendorIdOf(page, nameP)
            const qId = await vendorIdOf(page, nameQ)
            const entryP = vendorEntry(page, nameP)
            const menuP = page.getByTestId(`vendor-menu-${pId}`)
            await expect(openButton(page, nameP)).toHaveCount(1)
            await expect(menuP).toHaveRole('button')
            await expect(menuP).toHaveAccessibleName('Vendor actions')
            await expect(openButton(page, nameP).getByTestId(`vendor-menu-${pId}`)).toHaveCount(0)
            await openMenu(page, pId)
            await expect(menuItem(page, 'edit')).toHaveText('Edit')
            await expect(menuItem(page, 'toggle-inactive')).toHaveText('Make inactive')
            await expect(menuItem(page, 'delete')).toHaveText('Delete')
            // The menu press did not also open the row.
            await expectListShown(page)
            await menuItem(page, 'edit').click()
            await expect(page.getByTestId('vendor-title')).toHaveText('Edit vendor')
            await expect(field(page, 'display_name')).toHaveValue(nameP)
            await page.getByTestId('vendor-back').click()
            await expectListShown(page)
            await searchVendors(page, prefix)

            // (2) Make inactive drops the vendor from the default list; Show inactive brings
            // it back, labelled; Make active clears the label.
            await chooseFromMenu(page, pId, 'toggle-inactive')
            await expect(entryP).toHaveCount(0)
            await showInactive.click()
            await expect(showInactive).toHaveAttribute('aria-checked', 'true')
            await expect(inactiveLabel(entryP)).toBeVisible()
            await openMenu(page, pId)
            await expect(menuItem(page, 'toggle-inactive')).toHaveText('Make active')
            await menuItem(page, 'toggle-inactive').click()
            await expect(inactiveLabel(entryP)).toHaveCount(0)
            await expect(entryP).toBeVisible()
            await showInactive.click()
            await expect(showInactive).toHaveAttribute('aria-checked', 'false')
            await expect(entryP).toBeVisible()

            if (sizeName === 'desktop') {
                // (3) A refusal with no dialog open shows in the banner.
                await page.route(vendorHelpers.recordUrl(pId), route =>
                    route.request().method() !== 'PATCH'
                        ? route.continue()
                        : route.fulfill({
                              status: 400,
                              contentType: 'application/json',
                              body: JSON.stringify({
                                  code: 400,
                                  message: CHANGE_REFUSAL,
                                  data: {},
                              }),
                          })
                )
                await chooseFromMenu(page, pId, 'toggle-inactive')
                await expect(banner).toContainText(CHANGE_REFUSAL)
                await expect(entryP).toBeVisible()
                await expect(inactiveLabel(entryP)).toHaveCount(0)
                await page.getByTestId('vendors-banner-dismiss').click()
                await expect(banner).toHaveCount(0)
                await page.unroute(vendorHelpers.recordUrl(pId))

                // (4) Offline, a write from the menu fails at once instead of pausing, and the
                // write items are enabled again.
                await page.context().setOffline(true)
                await chooseFromMenu(page, pId, 'toggle-inactive')
                await expect(banner).toContainText(SERVER_UNREACHED)
                await expect(page.getByTestId('vendors-banner-dismiss')).toBeVisible()
                await expect(inactiveLabel(entryP)).toHaveCount(0)
                await openMenu(page, pId)
                await expect(menuItem(page, 'toggle-inactive')).toHaveText('Make inactive')
                await expect.poll(() => isDisabled(menuItem(page, 'toggle-inactive'))).toBe(false)
                await expect.poll(() => isDisabled(menuItem(page, 'delete'))).toBe(false)
                await closeMenu(page)
                await page.getByTestId('vendors-banner-dismiss').click()
                await expect(banner).toHaveCount(0)
                await page.context().setOffline(false)

                // While one write is in flight, no other row's Make inactive or Delete can
                // start; Edit still can.
                const held = await holdVendorWrite(page, pId, 'PATCH')
                await chooseFromMenu(page, pId, 'toggle-inactive')
                await held.arrived
                await openMenu(page, qId)
                await expect.poll(() => isDisabled(menuItem(page, 'toggle-inactive'))).toBe(true)
                await expect.poll(() => isDisabled(menuItem(page, 'delete'))).toBe(true)
                await expect.poll(() => isDisabled(menuItem(page, 'edit'))).toBe(false)
                await closeMenu(page)
                await held.release()
                await expect(entryP).toHaveCount(0)
                await showInactive.click()
                await expect(showInactive).toHaveAttribute('aria-checked', 'true')
                await chooseFromMenu(page, pId, 'toggle-inactive')
                await expect(inactiveLabel(entryP)).toHaveCount(0)
                await showInactive.click()
                await expect(showInactive).toHaveAttribute('aria-checked', 'false')
                await expect(entryP).toBeVisible()
            }

            // (5) The Delete vendor dialog: Escape closes it only; a refused delete keeps the
            // vendor and says why in the dialog; then the delete goes through.
            let dialog = await openDeleteDialog(page, pId)
            await expect(dialog.title).toHaveText('Delete vendor')
            await expect(dialog.body).toContainText(nameP)
            await expect(dialog.body).toContainText(CANNOT_UNDO)
            await expect(dialog.body).not.toContainText('Unsaved changes')
            await expect(dialog.confirm).toHaveText('Delete')
            await expect(dialog.close).toHaveText('Cancel')
            // The click moves focus off any input first.
            await dialog.body.click()
            await page.keyboard.press('Escape')
            await expect(dialog.root).toBeHidden()
            await expectListShown(page)
            await expect(entryP).toBeVisible()

            dialog = await openDeleteDialog(page, pId)
            await refuseDelete(page, pId, REFUSAL)
            await dialog.confirm.click()
            await expect(dialog.body).toContainText(REFUSAL)
            await expect(dialog.root).toBeVisible()
            await expect(entryP).toBeVisible()
            await page.unroute(vendorHelpers.recordUrl(pId))
            await dialog.confirm.click()
            await expect(dialog.root).toBeHidden()
            await expect(entryP).toHaveCount(0)
            await searchVendors(page, nameP)
            await expect(page.getByTestId('vendors-no-match')).toBeVisible()

            if (sizeName === 'desktop') await deleteOpenVendorElsewhere(page, prefix)
        })
    }
})

// (6) The open, dirty vendor is deleted in another tab: the not-found message replaces the
// form and no Discard changes? question appears.
async function deleteOpenVendorElsewhere(page: Page, prefix: string) {
    const discard = discardDialog(page)
    const nameC = `${prefix} C`
    await createVendor(page, { name: nameC })
    await searchVendors(page, nameC)
    await openButton(page, nameC).click()
    await expect(vendorSurface(page)).toBeVisible()
    await expect(field(page, 'display_name')).toHaveValue(nameC)
    await field(page, 'notes').fill(`${prefix} typed notes`)

    const other = await page.context().newPage()
    await login(other)
    await navigateToPackage(other, 'books')
    await other.setViewportSize(DESKTOP)
    await openVendorsList(other)
    await searchVendors(other, nameC)
    const cId = await vendorIdOf(other, nameC)
    const otherDialog = vendorHelpers.deleteDialog(other)
    await other.getByTestId(`vendor-menu-${cId}`).click()
    await other.getByTestId('vendor-menu-delete').click()
    await expect(otherDialog.root).toBeVisible()
    await other.getByTestId('delete-vendor-confirm').click()
    await expect(otherDialog.root).toBeHidden()
    await expect(vendorEntry(other, nameC)).toHaveCount(0)
    await other.close()

    const notFound = page.getByTestId('vendor-not-found')
    await expect(notFound).toContainText(NOT_FOUND)
    await expect(discard.title).toBeHidden()
    await page.getByTestId('vendor-not-found-back').click()
    await expect(discard.title).toBeHidden()
    await expect(notFound).toBeHidden()
    await expect(page.getByTestId('vendors-list')).toBeVisible()
}
