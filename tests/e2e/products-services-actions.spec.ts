import { expect, test } from '@playwright/test'
import {
    chooseFromMenu,
    createBundle,
    createProduct,
    DESKTOP,
    deleteDialog,
    discardDialog,
    effectiveOpacity,
    exactText,
    inactiveLabel,
    menuItem,
    openBooks,
    openButton,
    openMenu,
    openNewProduct,
    openProduct,
    productEntry,
    productIdOf,
    productSurface,
    searchProducts,
    uniqueName,
} from './products-services-helpers'

// The row menu (Edit, Make inactive or Make active, Delete) on product rows, Make inactive,
// and the Delete product or service dialog with the server's refusal for an item that is on
// a bundle. Both tests run on desktop only: the menu writes and the dialog refusal are the
// same code on a phone; the phone menu sheet and dialog sheet are driven by the customer and
// vendor actions specs.
//
// Every product here is created through the form with `uniqueName`; no seeded product is
// made inactive or deleted. The refusal is the server's own (an item on a bundle), so
// nothing is routed.
//
// Not covered here: read-only users (no row menu) cannot be driven, because the seed has no
// read-only Books member; `recordMenuItems` is unit-tested. The offline and
// one-write-at-a-time paths are the shared `useRecordActions`, driven by the customer and
// vendor actions specs.

const CANNOT_UNDO = 'This cannot be undone.'
const BUNDLE_LINE = 'Its item list is deleted with it.'
const ON_ONE_BUNDLE = 'This item is in 1 bundle. Take it out of it first, or make it inactive.'

test.describe('products-services: inactive and delete', () => {
    test('refuses to delete an item that is on a bundle and shows why in the dialog (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const item = uniqueName(page, 'Part')
        await createProduct(page, { type: 'non_inventory', name: item })
        await createBundle(page, { name: `${item} kit`, items: [{ name: item, quantity: '1' }] })
        await searchProducts(page, item)
        const id = await productIdOf(page, item)
        const entry = productEntry(page, item)

        // The menu is its own "Product actions" button beside the open button, not in it.
        const trigger = page.getByTestId(`product-menu-${id}`)
        await expect(trigger).toHaveRole('button')
        await expect(trigger).toHaveAccessibleName('Product actions')
        await expect(openButton(page, item).getByTestId(`product-menu-${id}`)).toHaveCount(0)
        await openMenu(page, id)
        await expect(menuItem(page, 'edit')).toHaveText('Edit')
        await expect(menuItem(page, 'toggle-inactive')).toHaveText('Make inactive')
        await expect(menuItem(page, 'delete')).toHaveText('Delete')

        const dialog = deleteDialog(page)
        await menuItem(page, 'delete').click()
        await expect(dialog.root).toBeVisible()
        await expect(dialog.title).toHaveText('Delete product or service')
        await expect(dialog.body).toContainText(item)
        await expect(dialog.body).toContainText(CANNOT_UNDO)
        await expect(dialog.body).not.toContainText(BUNDLE_LINE)

        // The server refuses: the dialog stays, says why, and the item is still listed.
        await dialog.confirm.click()
        await expect(dialog.body).toContainText(ON_ONE_BUNDLE)
        await expect(dialog.root).toBeVisible()
        await expect(entry).toHaveCount(1)

        await dialog.close.click()
        await expect(dialog.root).toBeHidden()
        await expect(entry).toBeVisible()
    })

    test('makes an item inactive, leaves it out of the bundle picker and dims it under Show inactive (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const prefix = uniqueName(page, 'Pick')
        const kept = `${prefix} kept`
        const old = `${prefix} old`
        const bundle = `${prefix} bundle`
        await createProduct(page, { type: 'service', name: kept })
        await createProduct(page, { type: 'service', name: old })
        await createBundle(page, { name: bundle, items: [{ name: old, quantity: '1' }] })
        await searchProducts(page, old)
        const id = await productIdOf(page, old)
        const entry = productEntry(page, old)

        // Make inactive drops the item from the default list.
        await chooseFromMenu(page, id, 'toggle-inactive')
        await expect(entry).toHaveCount(0)
        await expect(page.getByTestId('products-no-match')).toBeVisible()

        // The bundle keeps the item it holds, marked inactive.
        await openProduct(page, bundle)
        const rows = productSurface(page).locator('[data-testid^="form-table-items-row-"]')
        await expect(rows).toHaveCount(1)
        const rowTestId = (await rows.first().getAttribute('data-testid')) ?? ''
        const rowId = rowTestId.slice('form-table-items-row-'.length)
        const heldTrigger = page.getByTestId(`form-table-items-${rowId}-product`)
        await expect(heldTrigger).toContainText(old)
        await expect(heldTrigger).toContainText('(inactive)')
        await page.getByTestId('product-cancel').click()
        await expect(page.getByTestId('products-list')).toBeVisible()

        // Show inactive brings it back, dimmed and labelled.
        const showInactive = page.getByTestId('products-show-inactive')
        await searchProducts(page, old)
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'true')
        await expect(inactiveLabel(entry)).toBeVisible()
        await expect
            .poll(() => effectiveOpacity(entry.getByText(old, { exact: true })))
            .toBeLessThan(1)
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'false')

        // A new bundle's picker offers neither the inactive item nor a bundle.
        await openNewProduct(page, 'bundle')
        await page.getByTestId('form-table-items-add').click()
        await expect(rows).toHaveCount(1)
        const newRowTestId = (await rows.first().getAttribute('data-testid')) ?? ''
        const cell = `form-table-items-${newRowTestId.slice('form-table-items-row-'.length)}`
        await page.getByTestId(`${cell}-product`).click()
        await page.getByTestId(`${cell}-product-search`).fill(prefix)
        const options = page.locator(`[data-testid^="${cell}-product-option-"]`)
        await expect(options.filter({ hasText: exactText(kept) })).toBeVisible()
        await expect(options.filter({ hasText: old })).toHaveCount(0)
        await expect(options.filter({ hasText: bundle })).toHaveCount(0)

        // Escape closes the menu only; the added row made the form dirty.
        await page.keyboard.press('Escape')
        await expect(options).toHaveCount(0)
        await expect(page.getByTestId(`${cell}-product-search`)).toBeHidden()
        await expect(productSurface(page)).toBeVisible()
        await page.getByTestId('product-cancel').click()
        await discardDialog(page).discard.click()
        await expect(page.getByTestId('products-list')).toBeVisible()
    })
})
